import type { TransactionQuery } from "@/types/domain";
import { parseKeywordExpression } from "@/utils/transaction-search";

export interface TransactionSqlParts {
  conditions: string[];
  params: unknown[];
  orderBy: string;
}

function placeholders(values: unknown[]): string {
  return values.map(() => "?").join(", ");
}

export function buildTransactionSql(query: TransactionQuery): TransactionSqlParts {
  const conditions = ["t.book_id = ?", "t.deleted_at IS NULL"];
  const params: unknown[] = [query.bookId];
  const keyword = query.keyword?.trim() ?? "";

  if (query.yearMonth && !keyword) {
    conditions.push("substr(t.occurred_at, 1, 7) = ?");
    params.push(query.yearMonth);
  }

  if (keyword) {
    const groups = parseKeywordExpression(keyword);
    if (groups.length) {
      const groupSql = groups.map((terms) => {
        const termSql = terms.map((term) => {
          const like = `%${term}%`;
          params.push(like, like, like);
          return "(t.remark LIKE ? OR t.counterparty LIKE ? OR t.payment_channel LIKE ?)";
        });
        return `(${termSql.join(" AND ")})`;
      });
      conditions.push(`(${groupSql.join(" OR ")})`);
    }
  }

  if (query.accountIds?.length) {
    conditions.push(`t.account_id IN (${placeholders(query.accountIds)})`);
    params.push(...query.accountIds);
  }
  if (query.tradeTypes?.length) {
    conditions.push(`t.trade_type IN (${placeholders(query.tradeTypes)})`);
    params.push(...query.tradeTypes);
  }
  if (query.categoryIds?.length) {
    conditions.push(`t.category_id IN (${placeholders(query.categoryIds)})`);
    params.push(...query.categoryIds);
  }
  if (query.tagIds?.length) {
    conditions.push(`t.tag_id IN (${placeholders(query.tagIds)})`);
    params.push(...query.tagIds);
  }
  if (query.statuses?.length) {
    const statuses = query.statuses.filter((status) => status !== "blank");
    const statusConditions: string[] = [];
    if (statuses.length) {
      statusConditions.push(`t.status_code IN (${placeholders(statuses)})`);
      params.push(...statuses);
    }
    if (query.statuses.includes("blank")) statusConditions.push("t.status_code IS NULL");
    if (statusConditions.length) conditions.push(`(${statusConditions.join(" OR ")})`);
  }
  if (query.amountMinMinor != null) {
    conditions.push("ABS(t.amount_minor) >= ?");
    params.push(query.amountMinMinor);
  }
  if (query.amountMaxMinor != null) {
    conditions.push("ABS(t.amount_minor) <= ?");
    params.push(query.amountMaxMinor);
  }

  const sortColumn = query.sortBy === "amount" ? "ABS(t.amount_minor)" : query.sortBy === "occurredAt" ? "t.occurred_at" : null;
  const sortDirection = query.sortDirection === "asc" ? "ASC" : "DESC";
  const orderBy = sortColumn ? ` ORDER BY ${sortColumn} ${sortDirection}, t.id DESC` : " ORDER BY t.rowid ASC";
  return { conditions, params, orderBy };
}
