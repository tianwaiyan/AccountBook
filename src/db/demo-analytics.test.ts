import { afterEach, describe, expect, it } from "vitest";
import { DemoAnalyticsRepository, DemoTransactionRepository } from "@/db/demo";
import type { TransactionInput } from "@/types/domain";
import { DEFAULT_BOOK_ID } from "@/types/domain";

const createdIds: string[] = [];

function input(overrides: Partial<TransactionInput>): TransactionInput {
  return {
    occurredAt: "2099-01-02 03:04:05",
    accountId: "account-cash",
    tradeType: "expense",
    amountMinor: -1_000,
    categoryId: "cat-food",
    tagId: "tag-quality",
    statusCode: null,
    remark: "分析回归测试",
    counterparty: "测试商户",
    paymentChannel: "现金",
    source: "manual",
    ...overrides,
  };
}

afterEach(async () => {
  if (createdIds.length) await new DemoTransactionRepository().softDelete(createdIds.splice(0));
});

describe("DemoAnalyticsRepository refund aggregation", () => {
  it("keeps negative ordinary refund net values in all overview aggregates", async () => {
    const transactions = new DemoTransactionRepository();
    const expense = await transactions.create(DEFAULT_BOOK_ID, input({ amountMinor: -1_000 }));
    const refund = await transactions.create(DEFAULT_BOOK_ID, input({ tradeType: "refund", amountMinor: 1_500 }));
    createdIds.push(expense.id, refund.id);
    const analytics = new DemoAnalyticsRepository();

    const summary = await analytics.monthSummary(DEFAULT_BOOK_ID, "2099-01");
    expect(summary.expenseMinor).toBe(-500);
    expect(summary.balanceMinor).toBe(500);
    expect((await analytics.monthlyTrend(DEFAULT_BOOK_ID)).find((row) => row.month === "2099-01")?.expenseMinor).toBe(-500);
    expect(await analytics.categoryTotals(DEFAULT_BOOK_ID, "2099-01")).toEqual([{ name: "伙食费用", value: -500, count: 2 }]);
    expect(await analytics.tagTotals(DEFAULT_BOOK_ID, "2099-01", "expense")).toEqual([{ name: "品质生活", value: -500, count: 2 }]);
    expect(await analytics.yearlyCategoryTotals(DEFAULT_BOOK_ID, "2099")).toEqual([{ categoryId: "cat-food", categoryName: "伙食费用", month: 1, totalMinor: -500 }]);
  });

  it("offsets special metrics while keeping pending refund rows positive and settled rows out", async () => {
    const transactions = new DemoTransactionRepository();
    const analytics = new DemoAnalyticsRepository();
    const before = await analytics.monthSummary(DEFAULT_BOOK_ID, "2099-01");
    const pendingRefund = await transactions.create(DEFAULT_BOOK_ID, input({
      tradeType: "refund",
      amountMinor: 300,
      categoryId: "cat-public",
      tagId: null,
      statusCode: "pending_reimbursement",
    }));
    const settledRefund = await transactions.create(DEFAULT_BOOK_ID, input({
      tradeType: "refund",
      amountMinor: 700,
      categoryId: "cat-public",
      tagId: null,
      statusCode: "settled",
    }));
    createdIds.push(pendingRefund.id, settledRefund.id);

    const after = await analytics.monthSummary(DEFAULT_BOOK_ID, "2099-01");
    expect(after.pendingReimbursementMinor).toBe(before.pendingReimbursementMinor - 300);
    expect(after.settledReimbursementMinor).toBe(before.settledReimbursementMinor - 700);
    expect(await analytics.pendingReimbursements(DEFAULT_BOOK_ID)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: pendingRefund.id, amountMinor: 300, statusCode: "pending_reimbursement" }),
    ]));
    expect((await analytics.pendingReimbursements(DEFAULT_BOOK_ID)).some((row) => row.id === settledRefund.id)).toBe(false);
  });
});
