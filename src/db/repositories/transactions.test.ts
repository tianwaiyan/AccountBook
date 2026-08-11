import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ getDatabase: vi.fn() }));

import { getDatabase } from "@/db/client";
import { SqliteTransactionRepository } from "@/db/repositories/transactions";
import type { TransactionInput } from "@/types/domain";

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
