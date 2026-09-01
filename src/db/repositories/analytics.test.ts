import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ getDatabase: vi.fn() }));

import { getDatabase } from "@/db/client";
import { SqliteAnalyticsRepository } from "@/db/repositories/analytics";

describe("SqliteAnalyticsRepository refund aggregation", () => {
  const select = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    select.mockResolvedValue([]);
    vi.mocked(getDatabase).mockResolvedValue({ select } as never);
  });

  it("uses signed refund contributions for personal and special metrics", async () => {
    const repository = new SqliteAnalyticsRepository();
    await repository.monthSummary("book-default", "2099-01");

    const [personalSql] = select.mock.calls[0];
    const [specialSql] = select.mock.calls[1];
    expect(String(personalSql)).toContain("t.trade_type = 'refund' THEN -ABS(t.amount_minor)");
    expect(String(specialSql)).toContain("c.system_key = 'public_expense' AND t.status_code = 'pending_reimbursement'");
    expect(String(specialSql)).toContain("t.trade_type = 'refund' THEN -ABS(t.amount_minor)");
  });

  it("retains non-zero negative category, tag and yearly net rows", async () => {
    const repository = new SqliteAnalyticsRepository();
    await repository.categoryTotals("book-default", "2099-01");
    await repository.tagTotals("book-default", "2099-01", "expense");
    await repository.yearlyCategoryTotals("book-default", "2099");

    expect(String(select.mock.calls[0][0])).toContain("HAVING value != 0");
    expect(String(select.mock.calls[1][0])).toContain("HAVING value != 0");
    expect(String(select.mock.calls[2][0])).toContain("HAVING totalMinor != 0");
  });

  it("keeps tracking amounts positive and limits reimbursement rows to the public category", async () => {
    await new SqliteAnalyticsRepository().pendingReimbursements("book-default");
    const [sql, params] = select.mock.calls[0];
    expect(String(sql)).toContain("ABS(t.amount_minor) AS amountMinor");
    expect(String(sql)).toContain("c.system_key = ?");
    expect(params).toEqual(["book-default", "public_expense", "pending_reimbursement"]);
  });
});
