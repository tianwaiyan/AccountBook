import type { MonthlyPresetRepository } from "@/services/contracts";
import { recurrenceRuleService } from "@/services/recurrence-rule-service";
import type { TransactionInput } from "@/types/domain";
import type {
  MonthlyPreset,
  MonthlyPresetGenerationResult,
  MonthlyPresetInput,
} from "@/types/recurrence";
import { TransactionService } from "@/services/transaction-service";

const PLACEHOLDER_OCCURRED_AT = "2000-01-01 00:00:00";

function normalizeEntryTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) throw new Error("记账时间格式必须为 HH:MM");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) throw new Error("记账时间不是有效时间");
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

export class MonthlyPresetService {
  constructor(
    private readonly presets: MonthlyPresetRepository,
    private readonly transactions: TransactionService,
  ) {}

  list(bookId: string, includeInactive = false): Promise<MonthlyPreset[]> {
    return this.presets.list(bookId, includeInactive);
  }

  async create(bookId: string, input: MonthlyPresetInput): Promise<MonthlyPreset> {
    return this.presets.create(bookId, await this.normalizeInput(input));
  }

  async update(id: string, input: MonthlyPresetInput): Promise<void> {
    await this.presets.update(id, await this.normalizeInput(input));
  }

  async generateForMonth(
    bookId: string,
    yearMonth: string,
    presetIds: string[],
  ): Promise<MonthlyPresetGenerationResult> {
    if (!presetIds.length) throw new Error("请至少选择一个预设");
    const activePresets = await this.presets.list(bookId);
    const selected = presetIds.map((id) => activePresets.find((preset) => preset.id === id));
    if (selected.some((preset) => !preset)) throw new Error("所选预设不存在或已停用");

    const entries: Array<{ presetId: string; occurredAt: string; input: TransactionInput }> = [];
    for (const preset of selected as MonthlyPreset[]) {
      const dates = recurrenceRuleService.occurrencesForMonth(preset.rule, yearMonth);
      const entryTime = normalizeEntryTime(preset.entryTime);
      for (const date of dates) {
        const input = await this.transactions.normalizeForBatch({
          occurredAt: `${date} ${entryTime}`,
          accountId: preset.accountId,
          tradeType: preset.tradeType,
          amountMinor: preset.amountMinor,
          categoryId: preset.categoryId,
          tagId: preset.tagId,
          statusCode: preset.statusCode,
          remark: preset.remark,
          counterparty: preset.counterparty,
          paymentChannel: preset.paymentChannel,
          source: "preset",
        });
        entries.push({ presetId: preset.id, occurredAt: input.occurredAt, input });
      }
    }
    return this.presets.generateForMonth(bookId, yearMonth, presetIds, entries);
  }

  private async normalizeInput(input: MonthlyPresetInput): Promise<MonthlyPresetInput> {
    const name = input.name.trim();
    if (!name) throw new Error("预设名称不能为空");
    recurrenceRuleService.validate(input.rule);
    const entryTime = normalizeEntryTime(input.entryTime);
    const normalized = await this.transactions.normalizeForBatch({
      occurredAt: PLACEHOLDER_OCCURRED_AT,
      accountId: input.accountId,
      tradeType: input.tradeType,
      amountMinor: input.amountMinor,
      categoryId: input.categoryId,
      tagId: input.tagId,
      statusCode: input.statusCode,
      remark: input.remark,
      counterparty: input.counterparty,
      paymentChannel: input.paymentChannel,
      source: "preset",
    });
    return {
      ...input,
      name,
      entryTime,
      amountMinor: normalized.amountMinor,
      categoryId: normalized.categoryId,
      tagId: normalized.tagId,
      statusCode: normalized.statusCode,
      remark: normalized.remark,
      counterparty: normalized.counterparty,
      paymentChannel: normalized.paymentChannel,
    };
  }
}

export function displayEntryTime(value: string): string {
  return value.slice(0, 5);
}
