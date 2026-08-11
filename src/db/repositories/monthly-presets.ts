import { getDatabase } from "@/db/client";
import type { MonthlyPresetRepository } from "@/services/contracts";
import { recurrenceRuleService } from "@/services/recurrence-rule-service";
import type { TransactionInput } from "@/types/domain";
import type {
  MonthlyPreset,
  MonthlyPresetGenerationResult,
  MonthlyPresetInput,
} from "@/types/recurrence";

type RawMonthlyPreset = Omit<MonthlyPreset, "rule" | "defaultSelected" | "isActive"> & {
  ruleJson: string;
  defaultSelected: number;
  isActive: number;
};

function toPreset(row: RawMonthlyPreset): MonthlyPreset {
  return {
    ...row,
    rule: recurrenceRuleService.deserialize(row.ruleJson),
    defaultSelected: Boolean(row.defaultSelected),
    isActive: Boolean(row.isActive),
  };
}

function presetValues(bookId: string, input: MonthlyPresetInput): unknown[] {
  recurrenceRuleService.validate(input.rule);
  return [
    bookId,
    input.name.trim(),
    recurrenceRuleService.serialize(input.rule),
    input.entryTime,
    input.accountId,
    input.tradeType,
    input.amountMinor,
    input.categoryId,
    input.tagId,
    input.statusCode,
    input.remark.trim(),
    input.counterparty.trim(),
    input.paymentChannel.trim(),
    input.defaultSelected ? 1 : 0,
    input.isActive ? 1 : 0,
  ];
}

export class SqliteMonthlyPresetRepository implements MonthlyPresetRepository {
  async list(bookId: string, includeInactive = false): Promise<MonthlyPreset[]> {
    const database = await getDatabase();
    const rows = await database.select<RawMonthlyPreset[]>(
      `SELECT
         p.id,
         p.book_id AS bookId,
         p.name,
         p.rule_json AS ruleJson,
         p.entry_time AS entryTime,
         p.account_id AS accountId,
         p.trade_type AS tradeType,
         p.amount_minor AS amountMinor,
         p.category_id AS categoryId,
         p.tag_id AS tagId,
         p.status_code AS statusCode,
         p.remark,
         p.counterparty,
         p.payment_channel AS paymentChannel,
         p.default_selected AS defaultSelected,
         p.is_active AS isActive,
         p.created_at AS createdAt,
         p.updated_at AS updatedAt,
         p.deleted_at AS deletedAt,
         MAX(r.year_month) AS latestGeneratedMonth
       FROM monthly_presets p
       LEFT JOIN monthly_preset_runs r ON r.preset_id = p.id
       WHERE p.book_id = ? ${includeInactive ? "" : "AND p.is_active = 1 AND p.deleted_at IS NULL"}
       GROUP BY p.id
       ORDER BY p.is_active DESC, p.name COLLATE NOCASE, p.id`,
      [bookId],
    );
    return rows.map(toPreset);
  }

  async create(bookId: string, input: MonthlyPresetInput): Promise<MonthlyPreset> {
    if (!input.name.trim()) throw new Error("预设名称不能为空");
    const database = await getDatabase();
    const id = crypto.randomUUID();
    await database.execute(
      `INSERT INTO monthly_presets(
        id, book_id, name, rule_json, entry_time, account_id, trade_type, amount_minor,
        category_id, tag_id, status_code, remark, counterparty, payment_channel,
        default_selected, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, ...presetValues(bookId, input)],
    );
    const created = (await this.list(bookId, true)).find((row) => row.id === id);
    if (!created) throw new Error("预设保存后未能读取");
    return created;
  }

  async update(id: string, input: MonthlyPresetInput): Promise<void> {
    if (!input.name.trim()) throw new Error("预设名称不能为空");
    const database = await getDatabase();
    await database.execute(
      `UPDATE monthly_presets SET
        name = ?, rule_json = ?, entry_time = ?, account_id = ?, trade_type = ?, amount_minor = ?,
        category_id = ?, tag_id = ?, status_code = ?, remark = ?, counterparty = ?, payment_channel = ?,
        default_selected = ?, is_active = ?, deleted_at = CASE WHEN ? = 1 THEN NULL ELSE COALESCE(deleted_at, CURRENT_TIMESTAMP) END,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        input.name.trim(),
        recurrenceRuleService.serialize(input.rule),
        input.entryTime,
        input.accountId,
        input.tradeType,
        input.amountMinor,
        input.categoryId,
        input.tagId,
        input.statusCode,
        input.remark.trim(),
        input.counterparty.trim(),
        input.paymentChannel.trim(),
        input.defaultSelected ? 1 : 0,
        input.isActive ? 1 : 0,
        input.isActive ? 1 : 0,
        id,
      ],
    );
  }

  async generateForMonth(
    bookId: string,
    yearMonth: string,
    presetIds: string[],
    entries: Array<{ presetId: string; occurredAt: string; input: TransactionInput }>,
  ): Promise<MonthlyPresetGenerationResult> {
    if (!presetIds.length) return { generated: 0, skippedPresets: 0, emptyPresets: 0 };
    const database = await getDatabase();
    const groups = new Map<string, typeof entries>();
    entries.forEach((entry) => groups.set(entry.presetId, [...(groups.get(entry.presetId) ?? []), entry]));
    let generated = 0;
    let skippedPresets = 0;
    let emptyPresets = 0;
    await database.execute("BEGIN IMMEDIATE");
    try {
      for (const presetId of presetIds) {
        const existing = await database.select<Array<{ id: string }>>(
          "SELECT id FROM monthly_preset_runs WHERE preset_id = ? AND year_month = ? LIMIT 1",
          [presetId, yearMonth],
        );
        if (existing[0]) {
          skippedPresets += 1;
          continue;
        }

        const presetEntries = groups.get(presetId) ?? [];
        if (!presetEntries.length) {
          emptyPresets += 1;
          continue;
        }

        const runId = crypto.randomUUID();
        await database.execute(
          `INSERT INTO monthly_preset_runs(id, preset_id, book_id, year_month, generated_count, created_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [runId, presetId, bookId, yearMonth, presetEntries.length],
        );
        for (const entry of presetEntries) {
          const transactionId = crypto.randomUUID();
          await database.execute(
            `INSERT INTO transactions(
              id, book_id, occurred_at, account_id, trade_type, amount_minor,
              category_id, tag_id, status_code, remark, counterparty, payment_channel,
              source, source_category, import_fingerprint, fingerprint_version,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'preset', NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
              transactionId,
              bookId,
              entry.occurredAt,
              entry.input.accountId,
              entry.input.tradeType,
              entry.input.amountMinor,
              entry.input.categoryId,
              entry.input.tagId,
              entry.input.statusCode,
              entry.input.remark,
              entry.input.counterparty,
              entry.input.paymentChannel,
            ],
          );
          await database.execute(
            `INSERT INTO monthly_preset_run_items(id, run_id, transaction_id, occurred_at, created_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [crypto.randomUUID(), runId, transactionId, entry.occurredAt],
          );
          generated += 1;
        }
      }
      await database.execute("COMMIT");
      return { generated, skippedPresets, emptyPresets };
    } catch (error) {
      await database.execute("ROLLBACK");
      throw error;
    }
  }
}
