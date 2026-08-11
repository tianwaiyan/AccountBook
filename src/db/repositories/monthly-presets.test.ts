import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ getDatabase: vi.fn() }));

import { getDatabase } from "@/db/client";
import { SqliteMonthlyPresetRepository } from "@/db/repositories/monthly-presets";

const entry = {
  presetId: "preset-1",
  occurredAt: "2026-08-03 09:00:00",
  input: {
    occurredAt: "2026-08-03 09:00:00",
    accountId: "account-bank",
    tradeType: "income" as const,
    amountMinor: 1850000,
    categoryId: "category-income-salary",
    tagId: "tag-income-labor",
    statusCode: null,
    remark: "工资",
    counterparty: "公司",
    paymentChannel: "银行卡",
    source: "preset" as const,
  },
};

describe("SqliteMonthlyPresetRepository.generateForMonth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes a run, all transactions and run items in one transaction", async () => {
    const execute = vi.fn().mockResolvedValue({ rowsAffected: 1 });
    const select = vi.fn().mockResolvedValue([]);
    vi.mocked(getDatabase).mockResolvedValue({ execute, select } as never);

    const result = await new SqliteMonthlyPresetRepository().generateForMonth("book-default", "2026-08", ["preset-1"], [entry]);

    expect(result).toEqual({ generated: 1, skippedPresets: 0, emptyPresets: 0 });
    expect(execute.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0])).toEqual(["BEGIN", "INSERT", "INSERT", "INSERT", "COMMIT"]);
  });

  it("rolls back the whole generation when a transaction insert fails", async () => {
    const failure = new Error("simulated preset failure");
    const execute = vi.fn()
      .mockResolvedValueOnce({ rowsAffected: 1 })
      .mockResolvedValueOnce({ rowsAffected: 1 })
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ rowsAffected: 1 });
    const select = vi.fn().mockResolvedValue([]);
    vi.mocked(getDatabase).mockResolvedValue({ execute, select } as never);

    await expect(new SqliteMonthlyPresetRepository().generateForMonth("book-default", "2026-08", ["preset-1"], [entry])).rejects.toThrow("simulated preset failure");
    expect(execute.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0])).toEqual(["BEGIN", "INSERT", "INSERT", "ROLLBACK"]);
  });
});
