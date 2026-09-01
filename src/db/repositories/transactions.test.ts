import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ getDatabase: vi.fn() }));

import { getDatabase } from "@/db/client";
import { SqliteTransactionRepository } from "@/db/repositories/transactions";
import type { ImportCandidate, TransactionInput } from "@/types/domain";

const input: TransactionInput = {
  occurredAt: "2026-08-09 12:00:00",
  accountId: "account-cash",
  tradeType: "expense",
  amountMinor: -1_200,
  categoryId: "category-expense-food",
  tagId: "tag-expense-quality",
  statusCode: null,
  remark: "测试流水",
  counterparty: "测试商户",
  paymentChannel: "现金",
};

const importCandidate: ImportCandidate = {
  rowId: "candidate-1",
  source: "canonical_csv",
  occurredAt: "2026-08-09 12:00:00",
  accountName: "现金",
  tradeType: "expense",
  amountMinor: -1_200,
  sourceCategory: "餐饮",
  sourceTag: "",
  categoryId: null,
  tagId: null,
  statusCode: null,
  remark: "修改后的备注",
  counterparty: "测试商户",
  paymentChannel: "现金",
  fingerprint: "v2-candidate-fingerprint",
  excludedReason: null,
};

describe("SqliteTransactionRepository.bulkUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("commits all updates as one transaction", async () => {
    const execute = vi.fn().mockResolvedValue({ rowsAffected: 1 });
    vi.mocked(getDatabase).mockResolvedValue({ execute } as never);

    await new SqliteTransactionRepository().bulkUpdate([
      { id: "first", input },
      { id: "second", input: { ...input, amountMinor: -2_400 } },
    ]);

    expect(execute.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0])).toEqual([
      "BEGIN",
      "UPDATE",
      "UPDATE",
      "COMMIT",
    ]);
  });

  it("rolls back when one update fails", async () => {
    const failure = new Error("simulated constraint failure");
    const execute = vi.fn()
      .mockResolvedValueOnce({ rowsAffected: 0 })
      .mockResolvedValueOnce({ rowsAffected: 1 })
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ rowsAffected: 0 });
    vi.mocked(getDatabase).mockResolvedValue({ execute } as never);

    await expect(new SqliteTransactionRepository().bulkUpdate([
      { id: "first", input },
      { id: "second", input },
    ])).rejects.toThrow("simulated constraint failure");

    expect(execute.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0])).toEqual([
      "BEGIN",
      "UPDATE",
      "UPDATE",
      "ROLLBACK",
    ]);
  });
});

describe("SqliteTransactionRepository.commitImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates against active rows by the five business fields", async () => {
    const execute = vi.fn().mockResolvedValue({ rowsAffected: 0 });
    const select = vi.fn()
      .mockResolvedValueOnce([{ id: "account-cash" }])
      .mockResolvedValueOnce([{ count: 1 }]);
    vi.mocked(getDatabase).mockResolvedValue({ execute, select } as never);

    const result = await new SqliteTransactionRepository().commitImport("book-default", [importCandidate]);

    expect(result).toEqual({ inserted: 0, skipped: 1 });
    expect(String(select.mock.calls[1][0])).toContain("deleted_at IS NULL");
    expect(String(select.mock.calls[1][0])).toContain("occurred_at = ?");
    expect(String(select.mock.calls[1][0])).toContain("account_id = ?");
    expect(String(select.mock.calls[1][0])).toContain("amount_minor = ?");
    expect(String(select.mock.calls[1][0])).toContain("TRIM(payment_channel) = ?");
    expect(String(select.mock.calls[1][0])).toContain("TRIM(counterparty) = ?");
    expect(String(select.mock.calls[1][0])).not.toContain("import_fingerprint");
    expect(select.mock.calls[1][1]).toEqual([
      "book-default",
      importCandidate.occurredAt,
      "account-cash",
      importCandidate.amountMinor,
      importCandidate.paymentChannel,
      importCandidate.counterparty,
    ]);
    expect(execute.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0])).toEqual(["BEGIN", "COMMIT"]);
  });

  it("writes v2 fingerprint metadata for a new row", async () => {
    const execute = vi.fn().mockResolvedValue({ rowsAffected: 1 });
    const select = vi.fn()
      .mockResolvedValueOnce([{ id: "account-cash" }])
      .mockResolvedValueOnce([{ count: 0 }]);
    vi.mocked(getDatabase).mockResolvedValue({ execute, select } as never);

    const result = await new SqliteTransactionRepository().commitImport("book-default", [importCandidate]);

    expect(result).toEqual({ inserted: 1, skipped: 0 });
    expect(execute.mock.calls[1][1]).toEqual(expect.arrayContaining([importCandidate.fingerprint, 2]));
  });

  it("allows a matching soft-deleted row to be imported again", async () => {
    const execute = vi.fn().mockResolvedValue({ rowsAffected: 1 });
    const select = vi.fn()
      .mockResolvedValueOnce([{ id: "account-cash" }])
      .mockResolvedValueOnce([{ count: 0 }]);
    vi.mocked(getDatabase).mockResolvedValue({ execute, select } as never);

    const result = await new SqliteTransactionRepository().commitImport("book-default", [importCandidate]);

    expect(result).toEqual({ inserted: 1, skipped: 0 });
    expect(String(select.mock.calls[1][0])).toContain("deleted_at IS NULL");
    expect(execute.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0])).toEqual(["BEGIN", "INSERT", "COMMIT"]);
  });

  it("skips duplicate candidates encountered later in the same batch", async () => {
    const execute = vi.fn().mockResolvedValue({ rowsAffected: 1 });
    const select = vi.fn()
      .mockResolvedValueOnce([{ id: "account-cash" }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ id: "account-cash" }])
      .mockResolvedValueOnce([{ count: 1 }]);
    vi.mocked(getDatabase).mockResolvedValue({ execute, select } as never);

    const result = await new SqliteTransactionRepository().commitImport("book-default", [
      importCandidate,
      { ...importCandidate, rowId: "candidate-2", fingerprint: "v2-candidate-fingerprint-2", remark: "另一条备注" },
    ]);

    expect(result).toEqual({ inserted: 1, skipped: 1 });
    expect(execute.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0])).toEqual(["BEGIN", "INSERT", "COMMIT"]);
  });
});
