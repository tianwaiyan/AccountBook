export type RecurrenceFrequency = "monthly" | "weekly" | "yearly";
export type MissingDatePolicy = "lastDay" | "skip";
export type MonthlyPosition = "first" | "second" | "last";

export type MonthlyRecurrenceRule =
  | {
      frequency: "monthly";
      kind: "day";
      day: number | "last";
      missingDatePolicy?: MissingDatePolicy;
    }
  | {
      frequency: "monthly";
      kind: "weekday";
      weekday: number;
      position: MonthlyPosition;
    };

export interface WeeklyRecurrenceRule {
  frequency: "weekly";
  weekday: number;
}

export interface YearlyRecurrenceRule {
  frequency: "yearly";
  kind: "date";
  month: number;
  day: number;
  missingDatePolicy: MissingDatePolicy;
}

export type RecurrenceRule = MonthlyRecurrenceRule | WeeklyRecurrenceRule | YearlyRecurrenceRule;

export interface MonthlyPresetInput {
  name: string;
  rule: RecurrenceRule;
  entryTime: string;
  accountId: string;
  tradeType: "expense" | "refund" | "income";
  amountMinor: number;
  categoryId: string | null;
  tagId: string | null;
  statusCode: "pending_reimbursement" | "settled" | "pending_transfer" | "transferred" | null;
  remark: string;
  counterparty: string;
  paymentChannel: string;
  defaultSelected: boolean;
  isActive: boolean;
}

export interface MonthlyPreset extends MonthlyPresetInput {
  id: string;
  bookId: string;
  latestGeneratedMonth: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MonthlyPresetGenerationResult {
  generated: number;
  skippedPresets: number;
  emptyPresets: number;
}
