import { describe, expect, it, vi } from "vitest";
import { MonthlyPresetService } from "@/services/monthly-preset-service";
import type { MonthlyPreset, MonthlyPresetInput } from "@/types/recurrence";

const input: MonthlyPresetInput = {
  name: "每周工资",
  rule: { frequency: "weekly", weekday: 1 },
  entryTime: "09:00",
  accountId: "account-bank",
  tradeType: "income",
  amountMinor: 1850000,
  categoryId: "category-income-salary",
  tagId: "tag-income-labor",
  statusCode: null,
  remark: "工资",
  counterparty: "公司",
  paymentChannel: "银行卡",
  defaultSelected: true,
  isActive: true,
};

function preset(overrides: Partial<MonthlyPreset> = {}): MonthlyPreset {
  return { ...input, id: "preset-1", bookId: "book-default", latestGeneratedMonth: null, createdAt: "2026-08-11", updatedAt: "2026-08-11", deletedAt: null, ...overrides };
}

describe("MonthlyPresetService", () => {
  it("expands all weekly dates in the target month", async () => {
    const repository = {
      list: vi.fn(async () => [preset()]),
      create: vi.fn(),
      update: vi.fn(),
      generateForMonth: vi.fn(async (_bookId: string, _month: string, _ids: string[], entries: Array<{ occurredAt: string; input: { source?: string } }>) => ({ generated: entries.length, skippedPresets: 0, emptyPresets: 0 })),
    };
    const transactions = { normalizeForBatch: vi.fn(async (value) => value) };
    const service = new MonthlyPresetService(repository, transactions as never);

    const result = await service.generateForMonth("book-default", "2026-08", ["preset-1"]);

    expect(result.generated).toBe(5);
    expect(repository.generateForMonth).toHaveBeenCalledWith("book-default", "2026-08", ["preset-1"], expect.arrayContaining([
      expect.objectContaining({ occurredAt: "2026-08-03 09:00:00", input: expect.objectContaining({ source: "preset" }) }),
      expect.objectContaining({ occurredAt: "2026-08-31 09:00:00", input: expect.objectContaining({ source: "preset" }) }),
    ]));
  });

  it("normalizes and stores preset values before creating", async () => {
    const repository = { list: vi.fn(), create: vi.fn(async (_bookId: string, value: MonthlyPresetInput) => preset(value)), update: vi.fn(), generateForMonth: vi.fn() };
    const transactions = { normalizeForBatch: vi.fn(async (value) => ({ ...value, amountMinor: 1234, remark: " 已清理 ", counterparty: " 对方 " })) };
    const service = new MonthlyPresetService(repository, transactions as never);

    await service.create("book-default", { ...input, amountMinor: -10, entryTime: "9:05" });

    expect(repository.create).toHaveBeenCalledWith("book-default", expect.objectContaining({ amountMinor: 1234, entryTime: "09:05:00", remark: " 已清理 ", counterparty: " 对方 " }));
  });

  it("rejects an incomplete fixed-date rule before writing", async () => {
    const repository = { list: vi.fn(), create: vi.fn(), update: vi.fn(), generateForMonth: vi.fn() };
    const transactions = { normalizeForBatch: vi.fn() };
    const service = new MonthlyPresetService(repository, transactions as never);

    await expect(service.create("book-default", { ...input, rule: { frequency: "monthly", kind: "day", day: 31 } })).rejects.toThrow("处理方式");
    expect(repository.create).not.toHaveBeenCalled();
  });
});
