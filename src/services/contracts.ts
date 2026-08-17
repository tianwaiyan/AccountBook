import type {
  Account,
  Category,
  ChartDatum,
  ImportCandidate,
  ImportCommitResult,
  MonthSummary,
  MonthlyTrendDatum,
  Tag,
  TrackingRecord,
  Transaction,
  TransactionQuery,
  TransactionInput,
  YearlyCategoryDatum,
} from "@/types/domain";
import type {
  MonthlyPreset,
  MonthlyPresetGenerationResult,
  MonthlyPresetInput,
} from "@/types/recurrence";

export interface TransactionRepository {
  list(query: TransactionQuery): Promise<Transaction[]>;
  listAvailableMonths(bookId: string): Promise<string[]>;
  get(id: string): Promise<Transaction | null>;
  create(bookId: string, input: TransactionInput): Promise<Transaction>;
  update(id: string, input: TransactionInput): Promise<void>;
  bulkUpdate(entries: Array<{ id: string; input: TransactionInput }>): Promise<void>;
  softDelete(ids: string[]): Promise<number>;
  commitImport(bookId: string, candidates: ImportCandidate[]): Promise<ImportCommitResult>;
}

export interface OptionRepository {
  listAccounts(bookId: string, includeInactive?: boolean): Promise<Account[]>;
  listCategories(bookId: string, includeInactive?: boolean): Promise<Category[]>;
  listTags(bookId: string, includeInactive?: boolean): Promise<Tag[]>;
  getCategory(id: string): Promise<Category | null>;
  getTag(id: string): Promise<Tag | null>;
  createAccount(bookId: string, name: string): Promise<void>;
  createCategory(bookId: string, kind: Category["kind"], name: string): Promise<void>;
  createTag(bookId: string, kind: Tag["kind"], name: string): Promise<void>;
  updateAccount(account: Account): Promise<void>;
  updateCategory(category: Category): Promise<void>;
  updateTag(tag: Tag): Promise<void>;
  reorder(entity: "accounts" | "categories" | "tags", orderedIds: string[]): Promise<void>;
}

export interface AnalyticsRepository {
  monthSummary(bookId: string, yearMonth: string): Promise<MonthSummary>;
  monthlyTrend(bookId: string): Promise<MonthlyTrendDatum[]>;
  categoryTotals(bookId: string, yearMonth: string): Promise<ChartDatum[]>;
  tagTotals(bookId: string, yearMonth: string, kind: "expense" | "income"): Promise<ChartDatum[]>;
  yearlyCategoryTotals(bookId: string, year: string): Promise<YearlyCategoryDatum[]>;
  pendingReimbursements(bookId: string): Promise<TrackingRecord[]>;
  pendingTransfers(bookId: string): Promise<TrackingRecord[]>;
}

export interface SourceCategoryMapping {
  id: string;
  source: string;
  sourceCategory: string;
  tradeType: string;
  categoryId: string;
}

export interface SourceMappingRepository {
  list(bookId: string, source: string): Promise<SourceCategoryMapping[]>;
  upsert(
    bookId: string,
    source: string,
    sourceCategory: string,
    tradeType: string,
    categoryId: string,
  ): Promise<void>;
}

export interface MonthlyPresetRepository {
  list(bookId: string, includeInactive?: boolean): Promise<MonthlyPreset[]>;
  create(bookId: string, input: MonthlyPresetInput): Promise<MonthlyPreset>;
  update(id: string, input: MonthlyPresetInput): Promise<void>;
  generateForMonth(
    bookId: string,
    yearMonth: string,
    presetIds: string[],
    entries: Array<{ presetId: string; occurredAt: string; input: TransactionInput }>,
  ): Promise<MonthlyPresetGenerationResult>;
}

export interface SyncStatus {
  mode: "local-only" | "connected" | "error";
  lastSyncedAt: string | null;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
}

export interface SyncService {
  getStatus(): Promise<SyncStatus>;
  sync(bookId: string): Promise<SyncResult>;
}
