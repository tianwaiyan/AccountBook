import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { OptionRepository, SourceMappingRepository, TransactionRepository } from "@/services/contracts";
import {
  ImportService,
  inferPlatformTradeType,
  normalizeCsvLineEndings,
  protectSpreadsheetText,
} from "@/services/import-service";
import type { Account, Category, Transaction } from "@/types/domain";
import { createImportFingerprint, FINGERPRINT_VERSION } from "@/utils/fingerprint";

const foodCategory: Category = {
  id: "food",
  bookId: "book-default",
  kind: "expense",
  name: "伙食费用",
  systemKey: null,
  defaultTagId: null,
  sortOrder: 0,
  isActive: true,
};

const importAccounts: Account[] = [
  { id: "account-alipay", bookId: "book-default", name: "支付宝", sortOrder: 0, isActive: true },
  { id: "account-wechat", bookId: "book-default", name: "微信", sortOrder: 1, isActive: true },
];

function service(existingTransactions: Transaction[] = []) {
  const transactionRepository = {
    list: vi.fn(async () => existingTransactions),
    commitImport: vi.fn(async (_bookId, candidates) => ({ inserted: candidates.length, skipped: 0 })),
  } as unknown as TransactionRepository;
  const optionRepository = {
    listAccounts: vi.fn(async () => importAccounts),
    listCategories: vi.fn(async () => [foodCategory]),
    listTags: vi.fn(async () => []),
  } as unknown as OptionRepository;
  const mappingRepository = {
    list: vi.fn(async () => []),
    upsert: vi.fn(),
  } as unknown as SourceMappingRepository;
  return new ImportService(transactionRepository, optionRepository, mappingRepository);
}

function exportService(transaction: Transaction) {
  const transactionRepository = {
    list: vi.fn(async () => [transaction]),
  } as unknown as TransactionRepository;
  const optionRepository = {
    listCategories: vi.fn(async () => []),
    listTags: vi.fn(async () => []),
  } as unknown as OptionRepository;
  const mappingRepository = {} as SourceMappingRepository;
  return new ImportService(transactionRepository, optionRepository, mappingRepository);
}

function realRecord(prefix: string): string | null {
  const directory = resolve(process.cwd(), "records");
  if (!existsSync(directory)) return null;
  const name = readdirSync(directory).find((entry) => entry.startsWith(prefix));
  return name ? resolve(directory, name) : null;
}

function localFile(path: string, type: string): File {
  return new File([new Uint8Array(readFileSync(path))], basename(path), { type });
}

function alipayFile(csv: string): File {
  return new File([new TextEncoder().encode(`\uFEFF${csv}`)], "alipay.csv", { type: "text/csv" });
}

describe("ImportService", () => {
  it("parses WeChat CSV and filters transfers to 零钱通", async () => {
    const csv = [
      "交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式",
      "2026-08-08 08:00:00,餐饮美食,早餐店,早餐,支出,12.50,零钱",
      "2026-08-08 09:00:00,转入零钱通,零钱通,转入零钱通,不计收支,100.00,零钱",
    ].join("\n");
    const file = new File([csv], "wechat.csv", { type: "text/csv" });
    const preview = await service().preview(file, "wechat", "book-default");
    expect(preview.candidates).toHaveLength(1);
    expect(preview.candidates[0].amountMinor).toBe(-1250);
    expect(preview.excluded).toHaveLength(1);
    expect(preview.excluded[0].excludedReason).toBe("转入零钱通");
  });

  it("normalizes mixed line endings and distinguishes Alipay refunds from neutral rows", () => {
    expect(normalizeCsvLineEndings("说明\r\n表头\n正文\r尾部")).toBe("说明\n表头\n正文\n尾部");
    expect(inferPlatformTradeType("alipay", "不计收支", "退款", "退款-早餐", "退款成功"))
      .toEqual({ tradeType: "refund", excludedNeutral: false });
    expect(inferPlatformTradeType("alipay", "不计收支", "餐饮美食", "小荷包付款", "交易成功"))
      .toEqual({ tradeType: "expense", excludedNeutral: false });
    expect(inferPlatformTradeType("alipay", "不计收支", "余额宝", "余额宝收益", "交易成功"))
      .toEqual({ tradeType: "expense", excludedNeutral: true });
    expect(inferPlatformTradeType("wechat", "不计收支", "普通转账", "余额调整", "交易成功"))
      .toEqual({ tradeType: null, excludedNeutral: false });
  });

  it("keeps ordinary Alipay neutral rows as candidates and filters only Yu'ebao income", async () => {
    const csv = [
      "交易时间,交易分类,交易对方,商品说明,收/支,金额,收/付款方式,交易状态",
      "2026-08-08 08:00:00,余额调整,账户,银行卡余额调整,不计收支,10.00,余额,交易成功",
      "2026-08-08 09:00:00,余额宝,余额宝,余额宝收益发放,不计收支,0.10,余额宝,交易成功",
    ].join("\n");
    const preview = await service().preview(alipayFile(csv), "alipay", "book-default");

    expect(preview.candidates).toHaveLength(1);
    expect(preview.candidates[0].remark).toBe("银行卡余额调整");
    expect(preview.candidates[0].tradeType).toBe("expense");
    expect(preview.excluded).toHaveLength(1);
    expect(preview.excluded[0].excludedReason).toBe("余额宝收益发放");
  });

  it("preserves explicit platform exclusion rules", async () => {
    const csv = [
      "交易时间,交易分类,交易对方,商品说明,收/支,金额,收/付款方式,交易状态",
      "2026-08-08 08:00:00,消费,花呗,花呗还款,支出,10.00,花呗,交易成功",
      "2026-08-08 09:00:00,转账,银行卡,银行卡定时转入,支出,20.00,银行卡,交易成功",
      "2026-08-08 10:00:00,消费,商户,已关闭订单,支出,30.00,支付宝,交易关闭",
    ].join("\n");
    const preview = await service().preview(alipayFile(csv), "alipay", "book-default");

    expect(preview.candidates).toHaveLength(0);
    expect(preview.excluded.map((row) => row.excludedReason)).toEqual([
      "花呗自动还款",
      "银行卡定时转入",
      "交易状态：交易关闭",
    ]);
  });

  it("does not add platform exclusions to standard CSV", async () => {
    const csv = [
      "occurred_at,account,trade_type,amount,category,tag,status,remark,counterparty,payment_channel,source_category",
      "2026-08-08 08:00:00,支付宝,expense,-1.00,余额调整,,,,账户,余额,余额调整",
    ].join("\n");
    const preview = await service().preview(new File([csv], "canonical.csv", { type: "text/csv" }), "canonical_csv", "book-default");

    expect(preview.candidates).toHaveLength(1);
    expect(preview.excluded).toHaveLength(0);
  });

  it("builds v2 fingerprints from business fields and ignores remarks", async () => {
    const base = {
      accountName: "支付宝",
      occurredAt: "2026-08-08 08:00:00",
      amountMinor: -100,
      paymentChannel: "余额",
      counterparty: "早餐店",
    };
    const editedRemark = { ...base, remark: "修改后的备注" };

    expect(FINGERPRINT_VERSION).toBe(2);
    expect(await createImportFingerprint(base)).toBe(await createImportFingerprint(editedRemark));
    for (const changed of [
      { ...base, occurredAt: "2026-08-08 08:00:01" },
      { ...base, accountName: "微信" },
      { ...base, amountMinor: -200 },
      { ...base, paymentChannel: "银行卡" },
      { ...base, counterparty: "午餐店" },
    ]) {
      expect(await createImportFingerprint(changed)).not.toBe(await createImportFingerprint(base));
    }
  });

  it("filters existing and same-batch duplicates by business fields while ignoring remarks", async () => {
    const csv = [
      "occurred_at,account,trade_type,amount,category,tag,status,remark,counterparty,payment_channel,source_category",
      "2026-08-08 08:00:00,支付宝,expense,-1.00,伙食费用,,,,早餐店,余额,餐饮",
      "2026-08-08 08:00:00,支付宝,expense,-1.00,伙食费用,,,,早餐店,余额,餐饮",
      "2026-08-08 09:00:00,支付宝,expense,-2.00,伙食费用,,,,午餐店,余额,餐饮",
    ].join("\n");
    const existing: Transaction = {
      id: "existing",
      bookId: "book-default",
      occurredAt: "2026-08-08 09:00:00",
      accountId: "account-alipay",
      accountName: "支付宝",
      tradeType: "expense",
      amountMinor: -200,
      categoryId: "food",
      categoryName: "伙食费用",
      categorySystemKey: null,
      tagId: null,
      tagName: null,
      statusCode: null,
      remark: "旧备注",
      counterparty: "午餐店",
      paymentChannel: "余额",
      source: "manual",
      sourceCategory: null,
      importFingerprint: "v1-old",
      fingerprintVersion: 1,
      createdAt: "2026-08-08T00:00:00Z",
      updatedAt: "2026-08-08T00:00:00Z",
    };

    const preview = await service([existing]).preview(new File([csv], "canonical.csv", { type: "text/csv" }), "canonical_csv", "book-default");
    expect(preview.candidates).toHaveLength(1);
    expect(preview.candidates[0].occurredAt).toBe("2026-08-08 08:00:00");
    expect(preview.excluded.map((row) => row.excludedReason)).toEqual(["记录重复", "记录重复"]);
  });

  it("allows import when any duplicate business field changes", async () => {
    const existing: Transaction = {
      id: "existing-fields",
      bookId: "book-default",
      occurredAt: "2026-08-08 08:00:00",
      accountId: "account-alipay",
      accountName: "支付宝",
      tradeType: "expense",
      amountMinor: -100,
      categoryId: null,
      categoryName: null,
      categorySystemKey: null,
      tagId: null,
      tagName: null,
      statusCode: null,
      remark: "旧备注",
      counterparty: "早餐店",
      paymentChannel: "余额",
      source: "manual",
      sourceCategory: null,
      importFingerprint: "v1-old",
      fingerprintVersion: 1,
      createdAt: "2026-08-08T00:00:00Z",
      updatedAt: "2026-08-08T00:00:00Z",
    };
    const csv = [
      "occurred_at,account,trade_type,amount,category,tag,status,remark,counterparty,payment_channel,source_category",
      "2026-08-08 08:00:01,支付宝,expense,-1.00,,,,新备注,早餐店,余额,",
      "2026-08-08 08:00:00,微信,expense,-1.00,,,,备注,早餐店,零钱,",
      "2026-08-08 08:00:00,支付宝,expense,-2.00,,,,备注,早餐店,余额,",
      "2026-08-08 08:00:00,支付宝,expense,-1.00,,,,备注,午餐店,余额,",
      "2026-08-08 08:00:00,支付宝,expense,-1.00,,,,备注,早餐店,银行卡,",
    ].join("\n");

    const preview = await service([existing]).preview(new File([csv], "canonical.csv", { type: "text/csv" }), "canonical_csv", "book-default");
    expect(preview.candidates).toHaveLength(5);
    expect(preview.excluded).toHaveLength(0);
  });

  it("protects spreadsheet formula text while preserving ordinary text", () => {
    expect(protectSpreadsheetText("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(protectSpreadsheetText(" +SUM(A1:A2)")).toBe("' +SUM(A1:A2)");
    expect(protectSpreadsheetText("\t@command")).toBe("'\t@command");
    expect(protectSpreadsheetText("早餐")).toBe("早餐");
    expect(protectSpreadsheetText("")).toBe("");
  });

  it("protects user text fields in canonical CSV without changing structured fields", async () => {
    const transaction = {
      id: "transaction-1",
      bookId: "book-default",
      occurredAt: "2026-08-08 08:00:00",
      accountId: "account-1",
      accountName: "=Account",
      tradeType: "expense",
      amountMinor: -1234,
      categoryId: null,
      categoryName: null,
      categorySystemKey: null,
      tagId: null,
      tagName: null,
      statusCode: null,
      remark: "+SUM(1,1)",
      counterparty: "@command",
      paymentChannel: "-channel",
      source: "manual",
      sourceCategory: "=source",
      importFingerprint: null,
      fingerprintVersion: null,
      createdAt: "2026-08-08 08:00:00",
      updatedAt: "2026-08-08 08:00:00",
    } satisfies Transaction;

    const csv = await exportService(transaction).canonicalCsv("book-default");
    expect(csv).toContain("2026-08-08 08:00:00");
    expect(csv).toContain("expense,-12.34");
    expect(csv).not.toContain("expense,'-12.34");
    expect(csv).toContain("'=Account");
    expect(csv).toContain("'+SUM(1,1)");
    expect(csv).toContain("'@command");
    expect(csv).toContain("'-channel");
    expect(csv).toContain("'=source");
  });

  const wechatPath = realRecord("微信支付账单流水文件");
  (wechatPath ? it : it.skip)("validates the local real WeChat workbook", async () => {
    const preview = await service().preview(localFile(wechatPath!, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), "wechat", "book-default");
    expect(preview.candidates).toHaveLength(41);
    expect(preview.excluded).toHaveLength(2);
    expect(preview.candidates.filter((row) => row.tradeType === "income")).toHaveLength(14);
    expect(preview.candidates.filter((row) => row.tradeType === "expense")).toHaveLength(27);
    expect(preview.candidates.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(10684);
  });

  const alipayPath = realRecord("支付宝交易明细");
  (alipayPath ? it : it.skip)("validates the local real Alipay CSV", async () => {
    const preview = await service().preview(localFile(alipayPath!, "text/csv"), "alipay", "book-default");
    expect(preview.candidates).toHaveLength(82);
    expect(preview.excluded).toHaveLength(46);
    expect(preview.candidates.filter((row) => row.tradeType === "income")).toHaveLength(2);
    expect(preview.candidates.filter((row) => row.tradeType === "expense")).toHaveLength(77);
    expect(preview.candidates.filter((row) => row.tradeType === "refund")).toHaveLength(3);
    expect(preview.candidates.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(-53089);
  });
});
