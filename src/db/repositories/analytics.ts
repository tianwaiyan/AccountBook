import { getDatabase } from "@/db/client";
import type { AnalyticsRepository } from "@/services/contracts";
import type {
  ChartDatum,
  MonthSummary,
  MonthlyTrendDatum,
  TrackingRecord,
  YearlyCategoryDatum,
} from "@/types/domain";

const PERSONAL_EXCLUDED = "('public_expense', 'reimbursement', 'pass_through_expense', 'pass_through_income')";

export class SqliteAnalyticsRepository implements AnalyticsRepository {
  async monthSummary(bookId: string, yearMonth: string): Promise<MonthSummary> {
    const database = await getDatabase();
    const personalRows = await database.select<Array<{
      incomeMinor: number;
      expenseMinor: number;
      count: number;
    }>>(
      `SELECT
        COALESCE(SUM(CASE WHEN t.trade_type = 'income' THEN ABS(t.amount_minor) ELSE 0 END), 0) AS incomeMinor,
        COALESCE(SUM(CASE WHEN t.trade_type = 'expense' THEN ABS(t.amount_minor) WHEN t.trade_type = 'refund' THEN -ABS(t.amount_minor) ELSE 0 END), 0) AS expenseMinor,
        COUNT(*) AS count
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.book_id = ? AND substr(t.occurred_at, 1, 7) = ? AND t.deleted_at IS NULL
         AND COALESCE(c.system_key, '') NOT IN ${PERSONAL_EXCLUDED}`,
      [bookId, yearMonth],
    );
    const specialRows = await database.select<Array<{
      passThroughOutgoingMinor: number;
      passThroughIncomingMinor: number;
      pendingReimbursementMinor: number;
      settledReimbursementMinor: number;
    }>>(
      `SELECT
        COALESCE(SUM(CASE WHEN c.system_key = 'pass_through_expense' THEN CASE WHEN t.trade_type = 'refund' THEN -ABS(t.amount_minor) ELSE ABS(t.amount_minor) END ELSE 0 END), 0) AS passThroughOutgoingMinor,
        COALESCE(SUM(CASE WHEN c.system_key = 'pass_through_income' THEN CASE WHEN t.trade_type = 'refund' THEN -ABS(t.amount_minor) ELSE ABS(t.amount_minor) END ELSE 0 END), 0) AS passThroughIncomingMinor,
        COALESCE(SUM(CASE WHEN c.system_key = 'public_expense' AND t.status_code = 'pending_reimbursement' THEN CASE WHEN t.trade_type = 'refund' THEN -ABS(t.amount_minor) ELSE ABS(t.amount_minor) END ELSE 0 END), 0) AS pendingReimbursementMinor,
        COALESCE(SUM(CASE WHEN c.system_key = 'public_expense' AND t.status_code = 'settled' THEN CASE WHEN t.trade_type = 'refund' THEN -ABS(t.amount_minor) ELSE ABS(t.amount_minor) END ELSE 0 END), 0) AS settledReimbursementMinor
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.book_id = ? AND t.deleted_at IS NULL`,
      [bookId],
    );
    const personal = personalRows[0] ?? { incomeMinor: 0, expenseMinor: 0, count: 0 };
    const special = specialRows[0] ?? {
      passThroughOutgoingMinor: 0,
      passThroughIncomingMinor: 0,
      pendingReimbursementMinor: 0,
      settledReimbursementMinor: 0,
    };
    return {
      ...personal,
      ...special,
      balanceMinor: personal.incomeMinor - personal.expenseMinor,
    };
  }

  async monthlyTrend(bookId: string): Promise<MonthlyTrendDatum[]> {
    const database = await getDatabase();
    return database.select<MonthlyTrendDatum[]>(
      `SELECT substr(t.occurred_at, 1, 7) AS month,
        COALESCE(SUM(CASE WHEN t.trade_type = 'income' THEN ABS(t.amount_minor) ELSE 0 END), 0) AS incomeMinor,
        COALESCE(SUM(CASE WHEN t.trade_type = 'expense' THEN ABS(t.amount_minor) WHEN t.trade_type = 'refund' THEN -ABS(t.amount_minor) ELSE 0 END), 0) AS expenseMinor,
        COUNT(*) AS count
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.book_id = ? AND t.deleted_at IS NULL
         AND COALESCE(c.system_key, '') NOT IN ${PERSONAL_EXCLUDED}
       GROUP BY month ORDER BY month`,
      [bookId],
    );
  }

  async categoryTotals(bookId: string, yearMonth: string): Promise<ChartDatum[]> {
    const database = await getDatabase();
    return database.select<ChartDatum[]>(
      `SELECT COALESCE(c.name, '待分类') AS name,
        SUM(CASE WHEN t.trade_type = 'expense' THEN ABS(t.amount_minor) WHEN t.trade_type = 'refund' THEN -ABS(t.amount_minor) ELSE 0 END) AS value,
        COUNT(*) AS count
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.book_id = ? AND substr(t.occurred_at, 1, 7) = ? AND t.deleted_at IS NULL
         AND t.trade_type IN ('expense', 'refund')
         AND t.category_id IS NOT NULL
         AND COALESCE(c.system_key, '') NOT IN ${PERSONAL_EXCLUDED}
       GROUP BY COALESCE(c.name, '待分类') HAVING value != 0 ORDER BY value DESC`,
      [bookId, yearMonth],
    );
  }

  async tagTotals(bookId: string, yearMonth: string, kind: "expense" | "income"): Promise<ChartDatum[]> {
    const database = await getDatabase();
    const expression = kind === "income"
      ? "SUM(ABS(t.amount_minor))"
      : "SUM(CASE WHEN t.trade_type = 'expense' THEN ABS(t.amount_minor) WHEN t.trade_type = 'refund' THEN -ABS(t.amount_minor) ELSE 0 END)";
    const types = kind === "income" ? "('income')" : "('expense', 'refund')";
    return database.select<ChartDatum[]>(
      `SELECT COALESCE(g.name, '未设置') AS name, ${expression} AS value, COUNT(*) AS count
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN tags g ON g.id = t.tag_id
       WHERE t.book_id = ? AND substr(t.occurred_at, 1, 7) = ? AND t.deleted_at IS NULL
         AND t.trade_type IN ${types}
         AND t.tag_id IS NOT NULL
         AND COALESCE(c.system_key, '') NOT IN ${PERSONAL_EXCLUDED}
       GROUP BY COALESCE(g.name, '未设置') HAVING value != 0 ORDER BY value DESC`,
      [bookId, yearMonth],
    );
  }

  async yearlyCategoryTotals(bookId: string, year: string): Promise<YearlyCategoryDatum[]> {
    const database = await getDatabase();
    return database.select<YearlyCategoryDatum[]>(
      `SELECT COALESCE(c.id, 'unclassified') AS categoryId, COALESCE(c.name, '待分类') AS categoryName,
        CAST(substr(t.occurred_at, 6, 2) AS INTEGER) AS month,
        SUM(CASE WHEN t.trade_type = 'expense' THEN ABS(t.amount_minor) WHEN t.trade_type = 'refund' THEN -ABS(t.amount_minor) ELSE 0 END) AS totalMinor
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.book_id = ? AND substr(t.occurred_at, 1, 4) = ? AND t.deleted_at IS NULL
         AND t.trade_type IN ('expense', 'refund')
         AND t.category_id IS NOT NULL
         AND COALESCE(c.system_key, '') NOT IN ${PERSONAL_EXCLUDED}
       GROUP BY categoryId, categoryName, month HAVING totalMinor != 0
       ORDER BY categoryName, month`,
      [bookId, year],
    );
  }

  async pendingReimbursements(bookId: string): Promise<TrackingRecord[]> {
    return this.tracking(bookId, "public_expense", "pending_reimbursement");
  }

  async pendingTransfers(bookId: string): Promise<TrackingRecord[]> {
    return this.tracking(bookId, "pass_through_income", "pending_transfer");
  }

  private async tracking(bookId: string, systemKey: string, statusCode: string): Promise<TrackingRecord[]> {
    const database = await getDatabase();
    return database.select<TrackingRecord[]>(
      `SELECT t.id, t.occurred_at AS occurredAt, t.counterparty, t.remark,
              ABS(t.amount_minor) AS amountMinor, t.status_code AS statusCode
       FROM transactions t JOIN categories c ON c.id = t.category_id
       WHERE t.book_id = ? AND c.system_key = ? AND t.status_code = ? AND t.deleted_at IS NULL
       ORDER BY t.occurred_at DESC`,
      [bookId, systemKey, statusCode],
    );
  }
}
