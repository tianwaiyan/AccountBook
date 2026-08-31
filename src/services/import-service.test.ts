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
import type { Category, Transaction } from "@/types/domain";

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

function service() {
  const transactionRepository = {
    commitImport: vi.fn(async (_bookId, candidates) => ({ inserted: candidates.length, skipped: 0 })),
  } as unknown as TransactionRepository;
  const optionRepository = {
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
      .toEqual({ tradeType: "expense", excludedNeutral: true });
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
