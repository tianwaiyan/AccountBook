import { getDatabase } from "@/db/client";
import type {
  OptionRepository,
  SourceCategoryMapping,
  SourceMappingRepository,
} from "@/services/contracts";
import type { Account, Category, CategoryKind, Tag } from "@/types/domain";

type RawAccount = Omit<Account, "isActive"> & { isActive: number };
type RawCategory = Omit<Category, "isActive"> & { isActive: number };
type RawTag = Omit<Tag, "isActive"> & { isActive: number };

const toAccount = (row: RawAccount): Account => ({ ...row, isActive: Boolean(row.isActive) });
const toCategory = (row: RawCategory): Category => ({ ...row, isActive: Boolean(row.isActive) });
const toTag = (row: RawTag): Tag => ({ ...row, isActive: Boolean(row.isActive) });

export class SqliteOptionRepository implements OptionRepository {
  async listAccounts(bookId: string, includeInactive = false): Promise<Account[]> {
    const database = await getDatabase();
    const rows = await database.select<RawAccount[]>(
      `SELECT id, book_id AS bookId, name, sort_order AS sortOrder, is_active AS isActive
       FROM accounts WHERE book_id = ? AND deleted_at IS NULL ${includeInactive ? "" : "AND is_active = 1"}
       ORDER BY sort_order, name`,
      [bookId],
    );
    return rows.map(toAccount);
  }

  async listCategories(bookId: string, includeInactive = false): Promise<Category[]> {
    const database = await getDatabase();
    const rows = await database.select<RawCategory[]>(
      `SELECT id, book_id AS bookId, kind, name, system_key AS systemKey,
              default_tag_id AS defaultTagId, sort_order AS sortOrder, is_active AS isActive
       FROM categories WHERE book_id = ? AND deleted_at IS NULL ${includeInactive ? "" : "AND is_active = 1"}
       ORDER BY kind, sort_order, name`,
      [bookId],
    );
    return rows.map(toCategory);
  }

  async listTags(bookId: string, includeInactive = false): Promise<Tag[]> {
    const database = await getDatabase();
    const rows = await database.select<RawTag[]>(
      `SELECT id, book_id AS bookId, kind, name, sort_order AS sortOrder, is_active AS isActive
       FROM tags WHERE book_id = ? AND deleted_at IS NULL ${includeInactive ? "" : "AND is_active = 1"}
       ORDER BY kind, sort_order, name`,
      [bookId],
    );
    return rows.map(toTag);
  }

  async getCategory(id: string): Promise<Category | null> {
    const database = await getDatabase();
    const rows = await database.select<RawCategory[]>(
      `SELECT id, book_id AS bookId, kind, name, system_key AS systemKey,
              default_tag_id AS defaultTagId, sort_order AS sortOrder, is_active AS isActive
       FROM categories WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [id],
    );
    return rows[0] ? toCategory(rows[0]) : null;
  }

  async getTag(id: string): Promise<Tag | null> {
    const database = await getDatabase();
    const rows = await database.select<RawTag[]>(
      `SELECT id, book_id AS bookId, kind, name, sort_order AS sortOrder, is_active AS isActive
       FROM tags WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [id],
    );
    return rows[0] ? toTag(rows[0]) : null;
  }

  async createAccount(bookId: string, name: string): Promise<void> {
    await this.createOption("accounts", bookId, null, name);
  }

  async createCategory(bookId: string, kind: CategoryKind, name: string): Promise<void> {
    await this.createOption("categories", bookId, kind, name);
  }

  async createTag(bookId: string, kind: CategoryKind, name: string): Promise<void> {
    await this.createOption("tags", bookId, kind, name);
  }

  private async createOption(
    table: "accounts" | "categories" | "tags",
    bookId: string,
    kind: CategoryKind | null,
    name: string,
  ): Promise<void> {
    const cleanName = name.trim();
    if (!cleanName) throw new Error("名称不能为空");
    const database = await getDatabase();
    const kindColumns = kind ? "kind, " : "";
    const kindValue = kind ? "?, " : "";
    const params: unknown[] = [crypto.randomUUID(), bookId];
    if (kind) params.push(kind);
    params.push(cleanName, bookId);
    await database.execute(
      `INSERT INTO ${table}(id, book_id, ${kindColumns}name, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ${kindValue}?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM ${table} WHERE book_id = ?), 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      params,
    );
  }

  async updateAccount(account: Account): Promise<void> {
    const database = await getDatabase();
    await database.execute(
      "UPDATE accounts SET name = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [account.name.trim(), account.isActive ? 1 : 0, account.id],
    );
  }

  async updateCategory(category: Category): Promise<void> {
    const database = await getDatabase();
    await database.execute(
      `UPDATE categories SET name = ?, default_tag_id = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [category.name.trim(), category.defaultTagId, category.isActive ? 1 : 0, category.id],
    );
  }

  async updateTag(tag: Tag): Promise<void> {
    const database = await getDatabase();
    await database.execute(
      "UPDATE tags SET name = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [tag.name.trim(), tag.isActive ? 1 : 0, tag.id],
    );
  }

  async reorder(entity: "accounts" | "categories" | "tags", orderedIds: string[]): Promise<void> {
    const database = await getDatabase();
    await database.execute("BEGIN IMMEDIATE");
    try {
      for (const [index, id] of orderedIds.entries()) {
        await database.execute(`UPDATE ${entity} SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [index, id]);
      }
      await database.execute("COMMIT");
    } catch (error) {
      await database.execute("ROLLBACK");
      throw error;
    }
  }
}

export class SqliteSourceMappingRepository implements SourceMappingRepository {
  async list(bookId: string, source: string): Promise<SourceCategoryMapping[]> {
    const database = await getDatabase();
    return database.select<SourceCategoryMapping[]>(
      `SELECT id, source, source_category AS sourceCategory, trade_type AS tradeType, category_id AS categoryId
       FROM source_category_mappings WHERE book_id = ? AND source = ?`,
      [bookId, source],
    );
  }

  async upsert(
    bookId: string,
    source: string,
    sourceCategory: string,
    tradeType: string,
    categoryId: string,
  ): Promise<void> {
    const database = await getDatabase();
    await database.execute(
      `INSERT INTO source_category_mappings(
        id, book_id, source, source_category, trade_type, category_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(book_id, source, source_category, trade_type)
       DO UPDATE SET category_id = excluded.category_id, updated_at = CURRENT_TIMESTAMP`,
      [crypto.randomUUID(), bookId, source, sourceCategory, tradeType, categoryId],
    );
  }
}

