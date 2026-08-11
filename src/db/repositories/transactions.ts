import { getDatabase, type PortableDatabaseClient } from "@/db/client";
import type { TransactionRepository } from "@/services/contracts";
import type {
  ImportCandidate,
  ImportCommitResult,
  Transaction,
  TransactionFilters,
  TransactionInput,
} from "@/types/domain";
import { parseKeywordExpression } from "@/utils/search";

const BASE_SELECT = `
  SELECT
    t.id,
    t.book_id AS bookId,
    t.occurred_at AS occurredAt,
    t.account_id AS accountId,
    a.name AS accountName,
    t.trade_type AS tradeType,
    t.amount_minor AS amountMinor,
    t.category_id AS categoryId,
    c.name AS categoryName,
    c.system_key AS categorySystemKey,
    t.tag_id AS tagId,
    g.name AS tagName,
    t.status_code AS statusCode,
    t.remark,
    t.counterparty,
    t.payment_channel AS paymentChannel,
    t.source,
    t.source_category AS sourceCategory,
    t.import_fingerprint AS importFingerprint,
    t.fingerprint_version AS fingerprintVersion,
    t.created_at AS createdAt,
    t.updated_at AS updatedAt
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN tags g ON g.id = t.tag_id
`;

function placeholders(values: unknown[]): string {
  return values.map(() => "?").join(", ");
}

async function ensureAccount(database: PortableDatabaseClient, bookId: string, name: string): Promise<string> {
  const rows = await database.select<Array<{ id: string }>>(
    "SELECT id FROM accounts WHERE book_id = ? AND name = ? LIMIT 1",
    [bookId, name],
  );
  if (rows[0]) return rows[0].id;
  const id = crypto.randomUUID();
  await database.execute(
    `INSERT INTO accounts(id, book_id, name, sort_order, is_active, created_at, updated_at)
     VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM accounts WHERE book_id = ?), 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [id, bookId, name || "未命名账户", bookId],
  );
  return id;
}

export class SqliteTransactionRepository implements TransactionRepository {
  async list(filters: TransactionFilters): Promise<Transaction[]> {
    const database = await getDatabase();
    const conditions = ["t.book_id = ?", "t.deleted_at IS NULL"];
    const params: unknown[] = [filters.bookId];

    if (filters.yearMonth && !filters.keyword?.trim()) {
      conditions.push("substr(t.occurred_at, 1, 7) = ?");
      params.push(filters.yearMonth);
    }
    if (filters.keyword?.trim()) {
      const groups = parseKeywordExpression(filters.keyword);
      if (groups.length) {
        const groupSql = groups.map((terms) => {
          const termSql = terms.map((term) => {
            const like = `%${term}%`;
            params.push(like, like, like);
            return "(t.remark LIKE ? OR COALESCE(c.name, t.source_category, '') LIKE ? OR t.counterparty LIKE ?)";
          });
          return `(${termSql.join(" AND ")})`;
        });
        conditions.push(`(${groupSql.join(" OR ")})`);
      }
    }
    if (filters.accountIds?.length) {
      conditions.push(`t.account_id IN (${placeholders(filters.accountIds)})`);
      params.push(...filters.accountIds);
    }
    if (filters.tradeTypes?.length) {
      conditions.push(`t.trade_type IN (${placeholders(filters.tradeTypes)})`);
      params.push(...filters.tradeTypes);
    }
    if (filters.categoryIds?.length) {
      conditions.push(`t.category_id IN (${placeholders(filters.categoryIds)})`);
      params.push(...filters.categoryIds);
    }
    if (filters.tagIds?.length) {
      conditions.push(`t.tag_id IN (${placeholders(filters.tagIds)})`);
      params.push(...filters.tagIds);
    }
    if (filters.statuses?.length) {
      const statuses = filters.statuses.filter((status) => status !== "blank");
      const clauses: string[] = [];
      if (statuses.length) {
        clauses.push(`t.status_code IN (${placeholders(statuses)})`);
        params.push(...statuses);
      }
      if (filters.statuses.includes("blank")) clauses.push("t.status_code IS NULL");
      conditions.push(`(${clauses.join(" OR ")})`);
    }
    if (filters.amountMinMinor != null) {
      conditions.push("ABS(t.amount_minor) >= ?");
      params.push(filters.amountMinMinor);
    }
    if (filters.amountMaxMinor != null) {
      conditions.push("ABS(t.amount_minor) <= ?");
      params.push(filters.amountMaxMinor);
    }

    const sortColumn = filters.sortBy === "amount" ? "ABS(t.amount_minor)" : filters.sortBy === "occurredAt" ? "t.occurred_at" : null;
    const sortDirection = filters.sortDirection === "asc" ? "ASC" : "DESC";
    const orderBy = sortColumn ? ` ORDER BY ${sortColumn} ${sortDirection}, t.id DESC` : " ORDER BY t.rowid ASC";
    return database.select<Transaction[]>(
      `${BASE_SELECT} WHERE ${conditions.join(" AND ")}${orderBy}`,
      params,
    );
  }

  async listAvailableMonths(bookId: string): Promise<string[]> {
    const database = await getDatabase();
    const rows = await database.select<Array<{ month: string }>>(
      `SELECT DISTINCT substr(occurred_at, 1, 7) AS month
       FROM transactions WHERE book_id = ? AND deleted_at IS NULL
       ORDER BY month DESC`,
      [bookId],
    );
    return rows.map((row) => row.month);
  }

  async get(id: string): Promise<Transaction | null> {
    const database = await getDatabase();
    const rows = await database.select<Transaction[]>(
      `${BASE_SELECT} WHERE t.id = ? AND t.deleted_at IS NULL LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(bookId: string, input: TransactionInput): Promise<Transaction> {
    const database = await getDatabase();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await database.execute(
      `INSERT INTO transactions(
        id, book_id, occurred_at, account_id, trade_type, amount_minor,
        category_id, tag_id, status_code, remark, counterparty, payment_channel,
        source, source_category, import_fingerprint, fingerprint_version,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        bookId,
        input.occurredAt,
        input.accountId,
        input.tradeType,
        input.amountMinor,
        input.categoryId,
        input.tagId,
        input.statusCode,
        input.remark,
        input.counterparty,
        input.paymentChannel,
        input.source ?? "manual",
        input.sourceCategory ?? null,
        input.importFingerprint ?? null,
        input.fingerprintVersion ?? null,
        now,
        now,
      ],
    );
    const created = await this.get(id);
    if (!created) throw new Error("流水写入后未能读取");
    return created;
  }

  async update(id: string, input: TransactionInput): Promise<void> {
    const database = await getDatabase();
    await database.execute(
      `UPDATE transactions SET
        occurred_at = ?, account_id = ?, trade_type = ?, amount_minor = ?,
        category_id = ?, tag_id = ?, status_code = ?, remark = ?, counterparty = ?,
        payment_channel = ?, source_category = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        input.occurredAt,
        input.accountId,
        input.tradeType,
        input.amountMinor,
        input.categoryId,
        input.tagId,
        input.statusCode,
        input.remark,
        input.counterparty,
        input.paymentChannel,
        input.sourceCategory ?? null,
        new Date().toISOString(),
        id,
      ],
    );
  }

  async bulkUpdate(entries: Array<{ id: string; input: TransactionInput }>): Promise<void> {
    if (!entries.length) return;
    const database = await getDatabase();
    await database.execute("BEGIN IMMEDIATE");
    try {
      for (const { id, input } of entries) {
        await database.execute(
          `UPDATE transactions SET
            occurred_at = ?, account_id = ?, trade_type = ?, amount_minor = ?,
            category_id = ?, tag_id = ?, status_code = ?, remark = ?, counterparty = ?,
            payment_channel = ?, source_category = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`,
          [
            input.occurredAt, input.accountId, input.tradeType, input.amountMinor,
            input.categoryId, input.tagId, input.statusCode, input.remark,
            input.counterparty, input.paymentChannel, input.sourceCategory ?? null,
            new Date().toISOString(), id,
          ],
        );
      }
      await database.execute("COMMIT");
    } catch (error) {
      await database.execute("ROLLBACK");
      throw error;
    }
  }

  async softDelete(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const database = await getDatabase();
    const result = await database.execute(
      `UPDATE transactions SET deleted_at = ?, updated_at = ?
       WHERE id IN (${placeholders(ids)}) AND deleted_at IS NULL`,
      [new Date().toISOString(), new Date().toISOString(), ...ids],
    );
    return result.rowsAffected;
  }

  async commitImport(bookId: string, candidates: ImportCandidate[]): Promise<ImportCommitResult> {
    if (!candidates.length) return { inserted: 0, skipped: 0 };
    const database = await getDatabase();
    let inserted = 0;
    await database.execute("BEGIN IMMEDIATE");
    try {
      for (const candidate of candidates) {
        const accountId = await ensureAccount(database, bookId, candidate.accountName);
        const duplicate = await database.select<Array<{ count: number }>>(
          `SELECT COUNT(*) AS count FROM transactions
           WHERE book_id = ? AND deleted_at IS NULL
             AND import_fingerprint = ?`,
          [bookId, candidate.fingerprint],
        );
        if ((duplicate[0]?.count ?? 0) > 0) continue;
        const result = await database.execute(
          `INSERT OR IGNORE INTO transactions(
            id, book_id, occurred_at, account_id, trade_type, amount_minor,
            category_id, tag_id, status_code, remark, counterparty, payment_channel,
            source, source_category, import_fingerprint, fingerprint_version,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            crypto.randomUUID(),
            bookId,
            candidate.occurredAt,
            accountId,
            candidate.tradeType,
            candidate.amountMinor,
            candidate.categoryId,
            candidate.tagId,
            candidate.statusCode,
            candidate.remark,
            candidate.counterparty,
            candidate.paymentChannel,
            candidate.source,
            candidate.sourceCategory,
            candidate.fingerprint,
          ],
        );
        inserted += result.rowsAffected;
      }
      await database.execute("COMMIT");
    } catch (error) {
      await database.execute("ROLLBACK");
      throw error;
    }
    return { inserted, skipped: candidates.length - inserted };
  }
}
