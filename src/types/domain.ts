export const DEFAULT_BOOK_ID = "book-default";

export type TradeType = "expense" | "refund" | "income";
export type CategoryKind = "expense" | "income";
export type TransactionSource =
  | "manual"
  | "copy"
  | "alipay"
  | "wechat"
  | "canonical_csv";

export type StatusCode =
  | "pending_reimbursement"
  | "settled"
  | "pending_transfer"
  | "transferred";

export interface Book {
  id: string;
  name: string;
  currencyCode: string;
  timezone: string;
}

export interface Account {
  id: string;
  bookId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Tag {
  id: string;
  bookId: string;
  kind: CategoryKind;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Category {
  id: string;
  bookId: string;
  kind: CategoryKind;
  name: string;
  systemKey: string | null;
  defaultTagId: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface Transaction {
  id: string;
  bookId: string;
  occurredAt: string;
  accountId: string;
  accountName: string;
  tradeType: TradeType;
  amountMinor: number;
  categoryId: string | null;
  categoryName: string | null;
  categorySystemKey: string | null;
  tagId: string | null;
  tagName: string | null;
  statusCode: StatusCode | null;
  remark: string;
  counterparty: string;
  paymentChannel: string;
  source: TransactionSource;
  sourceCategory: string | null;
  importFingerprint: string | null;
  fingerprintVersion: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionInput {
  occurredAt: string;
  accountId: string;
  tradeType: TradeType;
  amountMinor: number;
  categoryId: string | null;
  tagId: string | null;
  statusCode: StatusCode | null;
  remark: string;
  counterparty: string;
  paymentChannel: string;
  source?: TransactionSource;
  sourceCategory?: string | null;
  importFingerprint?: string | null;
  fingerprintVersion?: number | null;
}

export interface TransactionFilters {
  bookId: string;
  yearMonth?: string;
  keyword?: string;
  accountIds?: string[];
  tradeTypes?: TradeType[];
  categoryIds?: string[];
  tagIds?: string[];
  statuses?: Array<StatusCode | "blank">;
  amountMinMinor?: number;
  amountMaxMinor?: number;
  sortBy?: "occurredAt" | "amount";
  sortDirection?: "asc" | "desc";
}

export interface MonthSummary {
  incomeMinor: number;
  expenseMinor: number;
  balanceMinor: number;
  count: number;
  passThroughOutgoingMinor: number;
  passThroughIncomingMinor: number;
  pendingReimbursementMinor: number;
  settledReimbursementMinor: number;
}

export interface ChartDatum {
  name: string;
  value: number;
  count?: number;
}

export interface MonthlyTrendDatum {
  month: string;
  incomeMinor: number;
  expenseMinor: number;
  count: number;
}

export interface YearlyCategoryDatum {
  categoryId: string;
  categoryName: string;
  month: number;
  totalMinor: number;
}

export interface TrackingRecord {
  id: string;
  occurredAt: string;
  counterparty: string;
  remark: string;
  amountMinor: number;
  statusCode: StatusCode | null;
}

export interface ImportCandidate {
  rowId: string;
  source: Exclude<TransactionSource, "manual" | "copy">;
  occurredAt: string;
  accountName: string;
  tradeType: TradeType;
  amountMinor: number;
  sourceCategory: string;
  sourceTag: string;
  categoryId: string | null;
  tagId: string | null;
  statusCode: StatusCode | null;
  remark: string;
  counterparty: string;
  paymentChannel: string;
  fingerprint: string;
  excludedReason: string | null;
}

export interface ImportPreview {
  candidates: ImportCandidate[];
  excluded: ImportCandidate[];
  sourceCategories: string[];
}

export interface ImportCommitResult {
  inserted: number;
  skipped: number;
}

export interface BackupReport {
  backupPath: string;
  databaseBytes: number;
  createdAt: string;
}

export const tradeTypeLabels: Record<TradeType, string> = {
  expense: "支出",
  refund: "退款",
  income: "收入",
};

export const statusLabels: Record<StatusCode, string> = {
  pending_reimbursement: "待报销",
  settled: "已结清",
  pending_transfer: "待转出",
  transferred: "已转出",
};
