import Papa from "papaparse";
import type {
  OptionRepository,
  SourceMappingRepository,
  TransactionRepository,
} from "@/services/contracts";
import type {
  ImportCandidate,
  ImportCommitResult,
  ImportPreview,
  Transaction,
  TradeType,
} from "@/types/domain";
import { createImportFingerprint, importBusinessKey } from "@/utils/fingerprint";
import { normalizeDateTime, normalizeExcelDateTime } from "@/utils/date";
import { signedMinor } from "@/utils/money";

type ExternalSource = "alipay" | "wechat" | "canonical_csv";
type Matrix = unknown[][];

const ALIPAY_KEYS = ["交易时间", "交易分类", "金额", "收/支", "收/付款方式"];
const WECHAT_KEYS = ["交易时间", "交易类型", "金额(元)", "收/支", "支付方式"];

const ALIPAY_COLUMNS = {
  time: "交易时间",
  category: "交易分类",
  counterparty: "交易对方",
  remark: "商品说明",
  type: "收/支",
  amount: "金额",
  payment: "收/付款方式",
};

const WECHAT_COLUMNS = {
  time: "交易时间",
  category: "交易类型",
  counterparty: "交易对方",
  remark: "商品",
  type: "收/支",
  amount: "金额(元)",
  payment: "支付方式",
};

const CANONICAL_HEADERS = [
  "occurred_at",
  "account",
  "trade_type",
  "amount",
  "category",
  "tag",
  "status",
  "remark",
  "counterparty",
  "payment_channel",
  "source_category",
] as const;

const SPREADSHEET_FORMULA_PREFIX = /^[=+\-@]/;
const SPREADSHEET_CONTROL_PREFIX = /^[\u0000-\u001f\u007f]/;

export function protectSpreadsheetText(value: string): string {
  if (!value) return value;
  if (SPREADSHEET_CONTROL_PREFIX.test(value) || SPREADSHEET_FORMULA_PREFIX.test(value.trimStart())) {
    return `'${value}`;
  }
  return value;
}

function text(value: unknown): string {
  return String(value ?? "").trim().replace(/^\uFEFF/, "");
}

function normalizeTradeType(value: unknown): TradeType | null {
  const raw = text(value);
  if (raw === "expense" || raw.includes("支出") || raw === "支") return "expense";
  if (raw === "refund" || raw.includes("退款")) return "refund";
  if (raw === "income" || raw.includes("收入") || raw === "收") return "income";
  return null;
}

function cleanAmount(value: unknown): string {
  return text(value).replace(/[¥￥元,\s]/g, "");
}

function findHeader(matrix: Matrix, keys: string[]): number {
  const required = new Set(keys);
  const index = matrix.slice(0, 50).findIndex((row) => {
    const values = new Set(row.map(text));
    return [...required].filter((key) => values.has(key)).length >= 3;
  });
  if (index < 0) throw new Error(`前 50 行中未识别到账单表头：${keys.join("、")}`);
  return index;
}

function rowsToObjects(matrix: Matrix, headerIndex: number): Record<string, unknown>[] {
  const headers = matrix[headerIndex].map(text);
  return matrix.slice(headerIndex + 1).filter((row) => row.some((value) => text(value))).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index]])),
  );
}

function exclusionReason(candidate: Omit<ImportCandidate, "fingerprint" | "excludedReason">): string | null {
  if (candidate.source === "alipay") {
    if ((candidate.remark.includes("余额宝") || candidate.sourceCategory.includes("余额宝"))
        && (candidate.remark.includes("收益") || candidate.sourceCategory.includes("收益"))) return "余额宝收益发放";
    if ((candidate.counterparty.includes("花呗") || candidate.remark.includes("花呗")) && candidate.remark.includes("还款")) return "花呗自动还款";
    if (candidate.remark.includes("定时转入")) return "银行卡定时转入";
  }
  if (candidate.source === "wechat"
      && (candidate.remark.includes("转入零钱通") || candidate.sourceCategory.includes("转入零钱通"))) return "转入零钱通";
  return null;
}

export function normalizeCsvLineEndings(content: string): string {
  return content.replace(/\r\n?/g, "\n");
}

export function inferPlatformTradeType(
  source: "alipay" | "wechat",
  tradeType: unknown,
  sourceCategory: unknown,
  remark: unknown,
  sourceStatus: unknown,
): { tradeType: TradeType | null; excludedNeutral: boolean } {
  const rawTradeType = text(tradeType);
  const rawCategory = text(sourceCategory);
  const rawRemark = text(remark);
  const status = text(sourceStatus);
  const excludedTransfer = source === "wechat" && (rawCategory.includes("转入零钱通") || rawRemark.includes("转入零钱通"));
  const alipayRefund = source === "alipay"
    && rawTradeType === "不计收支"
    && (rawCategory.includes("退款") || rawRemark.includes("退款") || status.includes("退款"));
  const alipayNeutral = source === "alipay" && rawTradeType === "不计收支";
  const excludedNeutral = alipayNeutral
    && (rawCategory.includes("余额宝") || rawRemark.includes("余额宝"))
    && (rawCategory.includes("收益") || rawRemark.includes("收益"));
  return {
    tradeType: normalizeTradeType(rawTradeType)
      ?? (alipayRefund ? "refund" : excludedTransfer ? "income" : alipayNeutral ? "expense" : null),
    excludedNeutral,
  };
}

function hasUtf8Bom(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

function decodeCsv(buffer: ArrayBuffer, source: ExternalSource): string {
  const encoding = source === "alipay" && !hasUtf8Bom(buffer) ? "gb18030" : "utf-8";
  return normalizeCsvLineEndings(new TextDecoder(encoding).decode(buffer));
}

function parseCsvMatrix(buffer: ArrayBuffer, source: ExternalSource): Matrix {
  const result = Papa.parse<string[]>(decodeCsv(buffer, source), {
    delimiter: ",",
    newline: "\n",
    skipEmptyLines: "greedy",
  });
  if (result.errors.length) throw new Error(result.errors[0].message);
  return result.data;
}

type WorkbookSheet = { sheet: string; data: Matrix };

async function parseWorkbook(buffer: ArrayBuffer): Promise<WorkbookSheet[]> {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  return await readXlsxFile(buffer) as WorkbookSheet[];
}

function sheetMatrix(workbook: WorkbookSheet[], name = workbook[0]?.sheet): Matrix {
  const worksheet = workbook.find((sheet) => sheet.sheet === name);
  if (!worksheet) throw new Error(`Excel 中不存在工作表：${name ?? "空白"}`);
  return worksheet.data;
}

async function buildCandidate(
  source: ExternalSource,
  input: {
    occurredAt: unknown;
    accountName: unknown;
    tradeType: unknown;
    amount: unknown;
    sourceCategory: unknown;
    sourceTag?: unknown;
    statusCode?: unknown;
    remark?: unknown;
    counterparty?: unknown;
    paymentChannel?: unknown;
    sourceStatus?: unknown;
    isExcelDate?: boolean;
  },
): Promise<ImportCandidate> {
  const rawCategory = text(input.sourceCategory);
  const rawRemark = text(input.remark);
  const sourceStatus = text(input.sourceStatus);
  const platformType = source === "alipay" || source === "wechat"
    ? inferPlatformTradeType(source, input.tradeType, rawCategory, rawRemark, input.sourceStatus)
    : { tradeType: normalizeTradeType(input.tradeType), excludedNeutral: false };
  const tradeType = platformType.tradeType;
  if (!tradeType) throw new Error(`无法识别收支类型：${text(input.tradeType)}`);
  const candidateBase = {
    rowId: crypto.randomUUID(),
    source,
    occurredAt: input.isExcelDate ? normalizeExcelDateTime(input.occurredAt) : normalizeDateTime(input.occurredAt),
    accountName: text(input.accountName) || "未命名账户",
    tradeType,
    amountMinor: signedMinor(cleanAmount(input.amount), tradeType),
    sourceCategory: rawCategory,
    sourceTag: text(input.sourceTag),
    categoryId: null,
    tagId: null,
    statusCode: (text(input.statusCode) || null) as ImportCandidate["statusCode"],
    remark: rawRemark,
    counterparty: text(input.counterparty),
    paymentChannel: text(input.paymentChannel),
  } satisfies Omit<ImportCandidate, "fingerprint" | "excludedReason">;
  return {
    ...candidateBase,
    fingerprint: await createImportFingerprint(candidateBase),
    excludedReason: (source === "alipay" && sourceStatus.includes("交易关闭") ? `交易状态：${sourceStatus}` : null)
      ?? exclusionReason(candidateBase)
      ?? (platformType.excludedNeutral ? `不计收支：${rawCategory || rawRemark || "未分类"}` : null),
  };
}

async function parsePlatform(buffer: ArrayBuffer, source: "alipay" | "wechat", isExcel: boolean): Promise<ImportCandidate[]> {
  const matrix = isExcel ? sheetMatrix(await parseWorkbook(buffer)) : parseCsvMatrix(buffer, source);
  const columns = source === "alipay" ? ALIPAY_COLUMNS : WECHAT_COLUMNS;
  const header = findHeader(matrix, source === "alipay" ? ALIPAY_KEYS : WECHAT_KEYS);
  const accountName = source === "alipay" ? "支付宝" : "微信";
  const candidates: ImportCandidate[] = [];
  for (const row of rowsToObjects(matrix, header)) {
    try {
      candidates.push(await buildCandidate(source, {
        occurredAt: row[columns.time],
        accountName,
        tradeType: row[columns.type],
        amount: row[columns.amount],
        sourceCategory: row[columns.category],
        remark: row[columns.remark],
        counterparty: row[columns.counterparty],
        paymentChannel: row[columns.payment],
        sourceStatus: row["交易状态"],
        isExcelDate: isExcel,
      }));
    } catch (error) {
      if (text(row[columns.time]) || text(row[columns.amount])) throw error;
    }
  }
  return candidates;
}

async function parseCanonicalCsv(buffer: ArrayBuffer): Promise<ImportCandidate[]> {
  const parsed = Papa.parse<Record<string, string>>(new TextDecoder("utf-8").decode(buffer), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
  });
  if (parsed.errors.length) throw new Error(parsed.errors[0].message);
  const missing = CANONICAL_HEADERS.filter((header) => !parsed.meta.fields?.includes(header));
  if (missing.length) throw new Error(`标准 CSV 缺少列：${missing.join("、")}`);
  return Promise.all(parsed.data.map((row) => buildCandidate("canonical_csv", {
    occurredAt: row.occurred_at,
    accountName: row.account,
    tradeType: row.trade_type,
    amount: row.amount,
    sourceCategory: row.source_category || row.category,
    sourceTag: row.tag,
    statusCode: row.status,
    remark: row.remark,
    counterparty: row.counterparty,
    paymentChannel: row.payment_channel,
  })));
}

export class ImportService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly options: OptionRepository,
    private readonly mappings: SourceMappingRepository,
  ) {}

  async preview(file: File, source: ExternalSource, bookId: string): Promise<ImportPreview> {
    const buffer = await file.arrayBuffer();
    const extension = file.name.split(".").pop()?.toLocaleLowerCase();
    let candidates: ImportCandidate[];
    if (source === "alipay" || source === "wechat") {
      candidates = await parsePlatform(buffer, source, extension === "xlsx" || extension === "xls");
    } else {
      candidates = await parseCanonicalCsv(buffer);
    }

    const [savedMappings, categories, tags, accounts, existingTransactions] = await Promise.all([
      this.mappings.list(bookId, source),
      this.options.listCategories(bookId, true),
      this.options.listTags(bookId, true),
      this.options.listAccounts(bookId, true),
      this.transactions.list({ bookId, sortBy: "occurredAt", sortDirection: "asc" }),
    ]);
    const mappingMap = new Map(savedMappings.map((mapping) => [`${mapping.tradeType}:${mapping.sourceCategory}`, mapping.categoryId]));
    candidates = candidates.map((candidate) => {
      const kind = candidate.tradeType === "income" ? "income" : "expense";
      const exactCategory = categories.find((category) => category.kind === kind && category.name === candidate.sourceCategory);
      const exactTag = tags.find((tag) => tag.kind === kind && tag.name === candidate.sourceTag);
      return {
        ...candidate,
        categoryId: mappingMap.get(`${candidate.tradeType}:${candidate.sourceCategory}`) ?? exactCategory?.id ?? null,
        tagId: exactTag?.id ?? null,
      };
    });
    const accountIdsByName = new Map(accounts.map((account) => [account.name.trim(), account.id]));
    const accountIdentity = (accountName: string) => accountIdsByName.get(accountName.trim()) ?? `name:${accountName.trim()}`;
    candidates = await Promise.all(candidates.map(async (candidate) => ({
      ...candidate,
      fingerprint: await createImportFingerprint(candidate, accountIdentity(candidate.accountName)),
    })));
    const existingKeys = new Set(existingTransactions.map((transaction) => importBusinessKey(transaction, transaction.accountId)));
    const seenKeys = new Set<string>();
    const withDuplicateReasons = candidates.map((candidate) => {
      const key = importBusinessKey(candidate, accountIdentity(candidate.accountName));
      const duplicate = existingKeys.has(key) || seenKeys.has(key);
      seenKeys.add(key);
      if (candidate.excludedReason || !duplicate) return candidate;
      return { ...candidate, excludedReason: "记录重复" };
    });
    return {
      candidates: withDuplicateReasons.filter((candidate) => !candidate.excludedReason),
      excluded: withDuplicateReasons.filter((candidate) => Boolean(candidate.excludedReason)),
      sourceCategories: [...new Set(withDuplicateReasons.map((candidate) => candidate.sourceCategory).filter(Boolean))].sort(),
    };
  }

  async saveMapping(bookId: string, candidate: ImportCandidate, categoryId: string): Promise<void> {
    await this.mappings.upsert(bookId, candidate.source, candidate.sourceCategory, candidate.tradeType, categoryId);
  }

  async commit(bookId: string, candidates: ImportCandidate[]): Promise<ImportCommitResult> {
    return this.transactions.commitImport(bookId, candidates.filter((candidate) => !candidate.excludedReason));
  }

  async canonicalCsv(bookId: string): Promise<string> {
    const [transactions, categories, tags] = await Promise.all([
      this.transactions.list({ bookId, sortBy: "occurredAt", sortDirection: "asc" }),
      this.options.listCategories(bookId, true),
      this.options.listTags(bookId, true),
    ]);
    const categoryById = new Map(categories.map((category) => [category.id, category.name]));
    const tagById = new Map(tags.map((tag) => [tag.id, tag.name]));
    const rows = transactions.map((transaction) => ({
      occurred_at: transaction.occurredAt,
      account: protectSpreadsheetText(transaction.accountName),
      trade_type: transaction.tradeType,
      amount: (transaction.amountMinor / 100).toFixed(2),
      category: protectSpreadsheetText(transaction.categoryId ? categoryById.get(transaction.categoryId) ?? "" : ""),
      tag: protectSpreadsheetText(transaction.tagId ? tagById.get(transaction.tagId) ?? "" : ""),
      status: protectSpreadsheetText(transaction.statusCode ?? ""),
      remark: protectSpreadsheetText(transaction.remark),
      counterparty: protectSpreadsheetText(transaction.counterparty),
      payment_channel: protectSpreadsheetText(transaction.paymentChannel),
      source_category: protectSpreadsheetText(transaction.sourceCategory ?? ""),
    }));
    return `\uFEFF${Papa.unparse(rows, { columns: [...CANONICAL_HEADERS] })}`;
  }
}

export function exportableTransactionCount(transactions: Transaction[]): number {
  return transactions.length;
}
