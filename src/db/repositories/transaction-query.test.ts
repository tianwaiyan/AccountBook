import { describe, expect, it } from "vitest";
import { buildTransactionSql } from "@/db/repositories/transaction-query";

describe("buildTransactionSql", () => {
  it("combines month, multi-select fields, status blank and inclusive amount bounds", () => {
    const result = buildTransactionSql({
      bookId: "book-default",
      yearMonth: "2026-08",
      accountIds: ["cash", "bank"],
      tradeTypes: ["expense", "income"],
      categoryIds: ["food"],
      tagIds: ["essential"],
      statuses: ["pending_reimbursement", "blank"],
      amountMinMinor: 100,
      amountMaxMinor: 2_000,
    });

    expect(result.conditions).toEqual([
      "t.book_id = ?",
      "t.deleted_at IS NULL",
      "substr(t.occurred_at, 1, 7) = ?",
      "t.account_id IN (?, ?)",
      "t.trade_type IN (?, ?)",
      "t.category_id IN (?)",
      "t.tag_id IN (?)",
      "(t.status_code IN (?) OR t.status_code IS NULL)",
      "ABS(t.amount_minor) >= ?",
      "ABS(t.amount_minor) <= ?",
    ]);
    expect(result.params).toEqual([
      "book-default",
      "2026-08",
      "cash",
      "bank",
      "expense",
      "income",
      "food",
      "essential",
      "pending_reimbursement",
      100,
      2_000,
    ]);
    expect(result.orderBy).toBe(" ORDER BY t.rowid ASC");
  });

  it("uses keyword search as a full-library query and keeps values parameterized", () => {
    const result = buildTransactionSql({
      bookId: "book-default",
      yearMonth: "2026-08",
      keyword: "水果 AND 超市 OR 咖啡",
      accountIds: ["cash"],
      sortBy: "occurredAt",
      sortDirection: "asc",
    });

    expect(result.conditions).not.toContain("substr(t.occurred_at, 1, 7) = ?");
    expect(result.conditions.some((condition) => condition.includes("t.counterparty LIKE ?"))).toBe(true);
    expect(result.conditions.some((condition) => condition.includes("t.payment_channel LIKE ?"))).toBe(true);
    expect(result.conditions.some((condition) => condition.includes("c.name"))).toBe(false);
    expect(result.conditions.some((condition) => condition.includes("source_category"))).toBe(false);
    expect(result.params).toEqual([
      "book-default",
      "%水果%", "%水果%", "%水果%",
      "%超市%", "%超市%", "%超市%",
      "%咖啡%", "%咖啡%", "%咖啡%",
      "cash",
    ]);
    expect(result.orderBy).toBe(" ORDER BY t.occurred_at ASC, t.id DESC");
  });
});
