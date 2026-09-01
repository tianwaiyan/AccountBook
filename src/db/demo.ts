import type {
  AnalyticsRepository,
  MonthlyPresetRepository,
  OptionRepository,
  SourceCategoryMapping,
  SourceMappingRepository,
  TransactionRepository,
} from "@/services/contracts";
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
import { DEFAULT_BOOK_ID } from "@/types/domain";
import type { MonthlyPreset, MonthlyPresetGenerationResult, MonthlyPresetInput } from "@/types/recurrence";
import { recurrenceRuleService } from "@/services/recurrence-rule-service";
import { matchesKeyword } from "@/utils/transaction-search";
import { FINGERPRINT_VERSION } from "@/utils/fingerprint";

const accounts: Account[] = [
  ["account-alipay", "支付宝"], ["account-wechat", "微信"], ["account-cash", "现金"],
  ["account-bank", "银行卡"], ["account-meituan", "美团月付"],
].map(([id, name], index) => ({ id, name, bookId: DEFAULT_BOOK_ID, sortOrder: index, isActive: true }));

const tags: Tag[] = [
  ["tag-essential", "expense", "生存刚需"], ["tag-quality", "expense", "品质生活"],
  ["tag-growth", "expense", "自我投资"], ["tag-social", "expense", "人情往来"],
  ["tag-labor", "income", "劳动收入"], ["tag-property", "income", "财产收入"],
  ["tag-transfer", "income", "转移收入"],
].map(([id, kind, name], index) => ({ id, kind: kind as Tag["kind"], name, bookId: DEFAULT_BOOK_ID, sortOrder: index, isActive: true }));

const categories: Category[] = [
  ["cat-food", "expense", "伙食费用", null, "tag-quality"],
  ["cat-transport", "expense", "交通出行", null, "tag-essential"],
  ["cat-living", "expense", "生活费用", null, "tag-essential"],
  ["cat-study", "expense", "办公学习", null, "tag-growth"],
  ["cat-leisure", "expense", "休闲娱乐", null, "tag-quality"],
  ["cat-public", "expense", "公费垫付", "public_expense", null],
  ["cat-pass-out", "expense", "过手转出", "pass_through_expense", null],
  ["cat-salary", "income", "工资收入", null, "tag-labor"],
  ["cat-bonus", "income", "奖金收入", null, "tag-labor"],
  ["cat-interest", "income", "银行利息", null, "tag-property"],
  ["cat-pass-in", "income", "过手转入", "pass_through_income", null],
  ["cat-reimburse", "income", "垫付报销", "reimbursement", null],
].map(([id, kind, name, systemKey, defaultTagId], index) => ({
  id: id as string,
  kind: kind as Category["kind"],
  name: name as string,
  systemKey: systemKey as string | null,
  defaultTagId: defaultTagId as string | null,
  bookId: DEFAULT_BOOK_ID,
  sortOrder: index,
  isActive: true,
}));

function makeTransaction(
  id: string,
  occurredAt: string,
  accountId: string,
  tradeType: Transaction["tradeType"],
  amountMinor: number,
  categoryId: string | null,
  tagId: string | null,
  remark: string,
  counterparty: string,
  statusCode: Transaction["statusCode"] = null,
): Transaction {
  const account = accounts.find((item) => item.id === accountId)!;
  const category = categories.find((item) => item.id === categoryId);
  const tag = tags.find((item) => item.id === tagId);
  return {
    id, bookId: DEFAULT_BOOK_ID, occurredAt, accountId, accountName: account.name,
    tradeType, amountMinor, categoryId, categoryName: category?.name ?? null,
    categorySystemKey: category?.systemKey ?? null, tagId, tagName: tag?.name ?? null,
    statusCode, remark, counterparty, paymentChannel: account.name,
    source: "manual", sourceCategory: null, importFingerprint: null,
    fingerprintVersion: null,
    createdAt: "2026-08-08T00:00:00Z", updatedAt: "2026-08-08T00:00:00Z",
  };
}

let transactions: Transaction[] = [
  makeTransaction("t01", "2026-08-08 08:10:00", "account-wechat", "expense", -1850, "cat-food", "tag-quality", "早餐", "社区早餐店"),
  makeTransaction("t02", "2026-08-08 07:35:00", "account-alipay", "expense", -650, "cat-transport", "tag-essential", "地铁通勤", "地铁"),
  makeTransaction("t03", "2026-08-07 19:20:00", "account-wechat", "expense", -6800, "cat-food", "tag-quality", "晚餐", "川菜馆"),
  makeTransaction("t04", "2026-08-07 14:00:00", "account-bank", "income", 1850000, "cat-salary", "tag-labor", "八月工资", "公司"),
  makeTransaction("t05", "2026-08-06 20:10:00", "account-alipay", "refund", 3200, "cat-leisure", "tag-quality", "电影票退款", "影院"),
  makeTransaction("t06", "2026-08-06 12:30:00", "account-wechat", "expense", -12600, "cat-public", null, "团队午餐", "餐厅", "pending_reimbursement"),
  makeTransaction("t07", "2026-08-05 17:40:00", "account-bank", "income", 50000, "cat-pass-in", null, "代收款", "同事", "pending_transfer"),
  makeTransaction("t08", "2026-08-04 21:15:00", "account-alipay", "expense", -8900, "cat-study", "tag-growth", "专业书籍", "书店"),
  makeTransaction("t09", "2026-08-03 18:30:00", "account-wechat", "expense", -4200, null, null, "便利店", "便利店"),
  makeTransaction("t10", "2026-08-02 09:00:00", "account-bank", "income", 6800, "cat-interest", "tag-property", "银行利息", "银行"),
  makeTransaction("t11", "2026-07-28 19:20:00", "account-wechat", "expense", -5600, "cat-food", "tag-quality", "聚餐", "餐厅"),
  makeTransaction("t12", "2026-07-15 08:00:00", "account-bank", "income", 1850000, "cat-salary", "tag-labor", "七月工资", "公司"),
  makeTransaction("t13", "2026-06-20 20:00:00", "account-alipay", "expense", -12900, "cat-leisure", "tag-quality", "演出", "剧场"),
  makeTransaction("t14", "2026-06-15 08:00:00", "account-bank", "income", 1820000, "cat-salary", "tag-labor", "六月工资", "公司"),
  makeTransaction("t15", "2026-05-15 08:00:00", "account-bank", "income", 1820000, "cat-salary", "tag-labor", "五月工资", "公司"),
  makeTransaction("t16", "2026-05-08 18:00:00", "account-cash", "expense", -9800, "cat-living", "tag-essential", "生活用品", "超市"),
];

const sourceMappings: SourceCategoryMapping[] = [];
const settings = new Map<string, unknown>();
let monthlyPresets: MonthlyPreset[] = [];
const monthlyPresetRuns = new Set<string>();

export class DemoTransactionRepository implements TransactionRepository {
  async list(query: TransactionQuery): Promise<Transaction[]> {
    let result = transactions.filter((row) => row.bookId === query.bookId);
    const keyword = query.keyword?.trim() ?? "";
    if (keyword) result = result.filter((row) => matchesKeyword([row.remark, row.counterparty, row.paymentChannel], keyword));
    else if (query.yearMonth) result = result.filter((row) => row.occurredAt.startsWith(query.yearMonth!));
    if (query.accountIds?.length) result = result.filter((row) => query.accountIds!.includes(row.accountId));
    if (query.tradeTypes?.length) result = result.filter((row) => query.tradeTypes!.includes(row.tradeType));
    if (query.categoryIds?.length) result = result.filter((row) => row.categoryId && query.categoryIds!.includes(row.categoryId));
    if (query.tagIds?.length) result = result.filter((row) => row.tagId && query.tagIds!.includes(row.tagId));
    if (query.statuses?.length) result = result.filter((row) => row.statusCode ? query.statuses!.includes(row.statusCode) : query.statuses!.includes("blank"));
    if (query.amountMinMinor != null) result = result.filter((row) => Math.abs(row.amountMinor) >= query.amountMinMinor!);
    if (query.amountMaxMinor != null) result = result.filter((row) => Math.abs(row.amountMinor) <= query.amountMaxMinor!);
    if (!query.sortBy) return [...result];
    const direction = query.sortDirection === "asc" ? 1 : -1;
    return [...result].sort((left, right) => {
      const primary = query.sortBy === "amount" ? Math.abs(left.amountMinor) - Math.abs(right.amountMinor) : left.occurredAt.localeCompare(right.occurredAt);
      return primary !== 0 ? direction * primary : right.id > left.id ? 1 : right.id < left.id ? -1 : 0;
    });
  }
  async listAvailableMonths(): Promise<string[]> { return [...new Set(transactions.map((row) => row.occurredAt.slice(0, 7)))].sort().reverse(); }
  async get(id: string): Promise<Transaction | null> { return transactions.find((row) => row.id === id) ?? null; }
  async create(_bookId: string, input: TransactionInput): Promise<Transaction> { const row = fromInput(crypto.randomUUID(), input); transactions = [row, ...transactions]; return row; }
  async update(id: string, input: TransactionInput): Promise<void> { transactions = transactions.map((row) => row.id === id ? fromInput(id, input, row) : row); }
  async bulkUpdate(entries: Array<{ id: string; input: TransactionInput }>): Promise<void> { for (const entry of entries) await this.update(entry.id, entry.input); }
  async softDelete(ids: string[]): Promise<number> { const before = transactions.length; transactions = transactions.filter((row) => !ids.includes(row.id)); return before - transactions.length; }
  async commitImport(bookId: string, candidates: ImportCandidate[]): Promise<ImportCommitResult> {
    let inserted = 0;
    for (const candidate of candidates) {
      const accountId = accounts.find((item) => item.bookId === bookId && item.name.trim() === candidate.accountName.trim())?.id ?? accounts[0].id;
      const duplicate = transactions.some((row) => row.bookId === bookId
        && row.occurredAt === candidate.occurredAt
        && row.accountId === accountId
        && row.amountMinor === candidate.amountMinor
        && row.paymentChannel.trim() === candidate.paymentChannel.trim()
        && row.counterparty.trim() === candidate.counterparty.trim());
      if (duplicate) continue;
      transactions.push(fromInput(crypto.randomUUID(), {
        occurredAt: candidate.occurredAt,
        accountId,
        tradeType: candidate.tradeType,
        amountMinor: candidate.amountMinor,
        categoryId: candidate.categoryId,
        tagId: candidate.tagId,
        statusCode: candidate.statusCode,
        remark: candidate.remark,
        counterparty: candidate.counterparty,
        paymentChannel: candidate.paymentChannel,
        source: candidate.source,
        sourceCategory: candidate.sourceCategory,
        importFingerprint: candidate.fingerprint,
        fingerprintVersion: FINGERPRINT_VERSION,
      }));
      inserted += 1;
    }
    return { inserted, skipped: candidates.length - inserted };
  }
}

export class DemoOptionRepository implements OptionRepository {
  async listAccounts(_bookId: string, includeInactive = false) { return accounts.filter((row) => includeInactive || row.isActive); }
  async listCategories(_bookId: string, includeInactive = false) { return categories.filter((row) => includeInactive || row.isActive); }
  async listTags(_bookId: string, includeInactive = false) { return tags.filter((row) => includeInactive || row.isActive); }
  async getCategory(id: string) { return categories.find((row) => row.id === id) ?? null; }
  async getTag(id: string) { return tags.find((row) => row.id === id) ?? null; }
  async createAccount(bookId: string, name: string) { accounts.push({ id: crypto.randomUUID(), bookId, name, sortOrder: accounts.length, isActive: true }); }
  async createCategory(bookId: string, kind: Category["kind"], name: string) { categories.push({ id: crypto.randomUUID(), bookId, kind, name, systemKey: null, defaultTagId: null, sortOrder: categories.length, isActive: true }); }
  async createTag(bookId: string, kind: Tag["kind"], name: string) { tags.push({ id: crypto.randomUUID(), bookId, kind, name, sortOrder: tags.length, isActive: true }); }
  async updateAccount(account: Account) { Object.assign(accounts.find((row) => row.id === account.id)!, account); }
  async updateCategory(category: Category) { Object.assign(categories.find((row) => row.id === category.id)!, category); }
  async updateTag(tag: Tag) { Object.assign(tags.find((row) => row.id === tag.id)!, tag); }
  async reorder(entity: "accounts" | "categories" | "tags", orderedIds: string[]) { const collection = entity === "accounts" ? accounts : entity === "categories" ? categories : tags; orderedIds.forEach((id, index) => { const row = collection.find((item) => item.id === id); if (row) row.sortOrder = index; }); }
}

export class DemoMonthlyPresetRepository implements MonthlyPresetRepository {
  async list(bookId: string, includeInactive = false): Promise<MonthlyPreset[]> {
    return monthlyPresets.filter((preset) => preset.bookId === bookId && (includeInactive || preset.isActive)).map((preset) => ({ ...preset, rule: recurrenceRuleService.deserialize(preset.rule) }));
  }

  async create(bookId: string, input: MonthlyPresetInput): Promise<MonthlyPreset> {
    const now = "2026-08-11T00:00:00Z";
    const preset: MonthlyPreset = { ...input, id: crypto.randomUUID(), bookId, latestGeneratedMonth: null, createdAt: now, updatedAt: now, deletedAt: input.isActive ? null : now };
    monthlyPresets.push(preset);
    return { ...preset };
  }

  async update(id: string, input: MonthlyPresetInput): Promise<void> {
    monthlyPresets = monthlyPresets.map((preset) => preset.id === id ? { ...preset, ...input, updatedAt: "2026-08-11T00:00:00Z", deletedAt: input.isActive ? null : preset.deletedAt ?? "2026-08-11T00:00:00Z" } : preset);
  }

  async generateForMonth(bookId: string, yearMonth: string, presetIds: string[], entries: Array<{ presetId: string; occurredAt: string; input: TransactionInput }>): Promise<MonthlyPresetGenerationResult> {
    const beforeTransactions = transactions;
    const beforePresets = monthlyPresets;
    const beforeRuns = new Set(monthlyPresetRuns);
    let generated = 0;
    let skippedPresets = 0;
    let emptyPresets = 0;
    try {
      for (const presetId of presetIds) {
        const key = `${presetId}:${yearMonth}`;
        if (monthlyPresetRuns.has(key)) {
          skippedPresets += 1;
          continue;
        }
        const presetEntries = entries.filter((entry) => entry.presetId === presetId);
        if (!presetEntries.length) {
          emptyPresets += 1;
          continue;
        }
        for (const entry of presetEntries) {
          transactions = [fromInput(crypto.randomUUID(), entry.input), ...transactions];
          generated += 1;
        }
        monthlyPresetRuns.add(key);
        monthlyPresets = monthlyPresets.map((preset) => preset.id === presetId ? { ...preset, latestGeneratedMonth: yearMonth } : preset);
      }
      return { generated, skippedPresets, emptyPresets };
    } catch (error) {
      transactions = beforeTransactions;
      monthlyPresets = beforePresets;
      monthlyPresetRuns.clear();
      beforeRuns.forEach((key) => monthlyPresetRuns.add(key));
      throw error;
    }
  }
}

export class DemoAnalyticsRepository implements AnalyticsRepository {
  async monthSummary(bookId: string, yearMonth: string): Promise<MonthSummary> { const rows = personalRows(bookId).filter((row) => row.occurredAt.startsWith(yearMonth)); const incomeMinor = sum(rows.filter((row) => row.tradeType === "income").map((row) => Math.abs(row.amountMinor))); const expenseMinor = sum(rows.map((row) => row.tradeType === "expense" ? Math.abs(row.amountMinor) : row.tradeType === "refund" ? -Math.abs(row.amountMinor) : 0)); const all = transactions.filter((row) => row.bookId === bookId); return { incomeMinor, expenseMinor, balanceMinor: incomeMinor - expenseMinor, count: rows.length, passThroughOutgoingMinor: sum(all.filter((row) => row.categorySystemKey === "pass_through_expense").map((row) => Math.abs(row.amountMinor))), passThroughIncomingMinor: sum(all.filter((row) => row.categorySystemKey === "pass_through_income").map((row) => Math.abs(row.amountMinor))), pendingReimbursementMinor: sum(all.filter((row) => row.statusCode === "pending_reimbursement").map((row) => Math.abs(row.amountMinor))), settledReimbursementMinor: sum(all.filter((row) => row.categorySystemKey === "public_expense" && row.statusCode === "settled").map((row) => Math.abs(row.amountMinor))) }; }
  async monthlyTrend(bookId: string): Promise<MonthlyTrendDatum[]> { const grouped = new Map<string, Transaction[]>(); personalRows(bookId).forEach((row) => grouped.set(row.occurredAt.slice(0, 7), [...(grouped.get(row.occurredAt.slice(0, 7)) ?? []), row])); return [...grouped].sort().map(([month, rows]) => ({ month, incomeMinor: sum(rows.filter((row) => row.tradeType === "income").map((row) => Math.abs(row.amountMinor))), expenseMinor: sum(rows.map((row) => row.tradeType === "expense" ? Math.abs(row.amountMinor) : row.tradeType === "refund" ? -Math.abs(row.amountMinor) : 0)), count: rows.length })); }
  async categoryTotals(bookId: string, yearMonth: string): Promise<ChartDatum[]> { return groupedTotals(personalRows(bookId).filter((row) => row.occurredAt.startsWith(yearMonth) && row.tradeType !== "income" && row.categoryId), (row) => row.categoryName!); }
  async tagTotals(bookId: string, yearMonth: string, kind: "expense" | "income"): Promise<ChartDatum[]> { return groupedTotals(personalRows(bookId).filter((row) => row.occurredAt.startsWith(yearMonth) && row.tagId && (kind === "income" ? row.tradeType === "income" : row.tradeType !== "income")), (row) => row.tagName!); }
  async yearlyCategoryTotals(bookId: string, year: string): Promise<YearlyCategoryDatum[]> { const map = new Map<string, YearlyCategoryDatum>(); personalRows(bookId).filter((row) => row.occurredAt.startsWith(year) && row.tradeType !== "income" && row.categoryId).forEach((row) => { const month = Number(row.occurredAt.slice(5, 7)); const key = `${row.categoryId}:${month}`; const item = map.get(key) ?? { categoryId: row.categoryId!, categoryName: row.categoryName!, month, totalMinor: 0 }; item.totalMinor += row.tradeType === "refund" ? -Math.abs(row.amountMinor) : Math.abs(row.amountMinor); map.set(key, item); }); return [...map.values()].filter((row) => row.totalMinor > 0); }
  async pendingReimbursements(bookId: string) { return tracking(bookId, "pending_reimbursement"); }
  async pendingTransfers(bookId: string) { return tracking(bookId, "pending_transfer"); }
}

export class DemoSourceMappingRepository implements SourceMappingRepository {
  async list(_bookId: string, source: string) { return sourceMappings.filter((row) => row.source === source); }
  async upsert(_bookId: string, source: string, sourceCategory: string, tradeType: string, categoryId: string) { const existing = sourceMappings.find((row) => row.source === source && row.sourceCategory === sourceCategory && row.tradeType === tradeType); if (existing) existing.categoryId = categoryId; else sourceMappings.push({ id: crypto.randomUUID(), source, sourceCategory, tradeType, categoryId }); }
}

export class DemoSettingsRepository {
  async get<T>(key: string, fallback: T): Promise<T> { return (settings.get(key) as T | undefined) ?? fallback; }
  async set<T>(key: string, value: T): Promise<void> { settings.set(key, value); }
}

function fromInput(id: string, input: TransactionInput, existing?: Transaction): Transaction { const account = accounts.find((row) => row.id === input.accountId) ?? accounts[0]; const category = categories.find((row) => row.id === input.categoryId); const tag = tags.find((row) => row.id === input.tagId); return { id, bookId: DEFAULT_BOOK_ID, occurredAt: input.occurredAt, accountId: account.id, accountName: account.name, tradeType: input.tradeType, amountMinor: input.amountMinor, categoryId: input.categoryId, categoryName: category?.name ?? null, categorySystemKey: category?.systemKey ?? null, tagId: input.tagId, tagName: tag?.name ?? null, statusCode: input.statusCode, remark: input.remark, counterparty: input.counterparty, paymentChannel: input.paymentChannel, source: input.source ?? "manual", sourceCategory: input.sourceCategory ?? null, importFingerprint: input.importFingerprint ?? null, fingerprintVersion: input.fingerprintVersion ?? null, createdAt: existing?.createdAt ?? "2026-08-08T00:00:00Z", updatedAt: "2026-08-08T00:00:00Z" }; }
function personalRows(bookId: string) { return transactions.filter((row) => row.bookId === bookId && !["public_expense", "reimbursement", "pass_through_expense", "pass_through_income"].includes(row.categorySystemKey ?? "")); }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function groupedTotals(rows: Transaction[], key: (row: Transaction) => string): ChartDatum[] { const map = new Map<string, ChartDatum>(); rows.forEach((row) => { const name = key(row); const item = map.get(name) ?? { name, value: 0, count: 0 }; item.value += row.tradeType === "refund" ? -Math.abs(row.amountMinor) : Math.abs(row.amountMinor); item.count = (item.count ?? 0) + 1; map.set(name, item); }); return [...map.values()].filter((row) => row.value > 0).sort((a, b) => b.value - a.value); }
function tracking(bookId: string, status: Transaction["statusCode"]): TrackingRecord[] { return transactions.filter((row) => row.bookId === bookId && row.statusCode === status).map((row) => ({ id: row.id, occurredAt: row.occurredAt, counterparty: row.counterparty, remark: row.remark, amountMinor: Math.abs(row.amountMinor), statusCode: row.statusCode })); }
