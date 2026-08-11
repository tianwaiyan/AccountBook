import { RRule, Weekday } from "rrule";
import type {
  MonthlyPosition,
  RecurrenceRule,
  YearlyRecurrenceRule,
} from "@/types/recurrence";

export interface RecurrenceRuleService {
  validate(rule: RecurrenceRule): void;
  describe(rule: RecurrenceRule): string;
  nextOccurrences(rule: RecurrenceRule, referenceDate?: Date, limit?: number): string[];
  occurrencesForMonth(rule: RecurrenceRule, yearMonth: string): string[];
  serialize(rule: RecurrenceRule): string;
  deserialize(value: unknown): RecurrenceRule;
}

const POSITION_LABELS: Record<MonthlyPosition, string> = {
  first: "第一个",
  second: "第二个",
  last: "最后一个",
};

const WEEKDAY_LABELS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const POSITION_VALUES: Record<MonthlyPosition, number> = { first: 1, second: 2, last: -1 };

function assertInteger(value: unknown, label: string, minimum: number, maximum: number): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${label}必须是 ${minimum}-${maximum} 之间的整数`);
  }
}

function assertYearMonth(yearMonth: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) throw new Error("月份格式必须为 YYYY-MM");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("月份必须为 01-12");
  return { year, month };
}

function dateUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function startOfMonthUtc(year: number, month: number): Date {
  return dateUtc(year, month, 1);
}

function endExclusiveOfMonthUtc(year: number, month: number): Date {
  return dateUtc(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toDateKey(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function fromLocalDate(value: Date): Date {
  return dateUtc(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

function addUtcDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function addUtcYears(value: Date, years: number): Date {
  return dateUtc(value.getUTCFullYear() + years, value.getUTCMonth() + 1, value.getUTCDate());
}

function dateFromRuleReference(referenceDate?: Date): Date {
  return fromLocalDate(referenceDate ?? new Date());
}

function weekday(value: number): Weekday {
  return new Weekday((value + 6) % 7);
}

function mappedFixedDayOccurrences(
  rule: RecurrenceRule,
  from: Date,
  to: Date,
): Date[] {
  if (rule.frequency === "monthly" && rule.kind === "day") {
    if (rule.day === "last") {
      return new RRule({
        freq: RRule.MONTHLY,
        dtstart: from,
        bymonthday: -1,
      }).between(from, to, true);
    }
    if (rule.missingDatePolicy === "lastDay") {
      const anchorStart = startOfMonthUtc(from.getUTCFullYear(), from.getUTCMonth() + 1);
      const anchors = new RRule({
        freq: RRule.MONTHLY,
        dtstart: anchorStart,
        bymonthday: 1,
      }).between(anchorStart, to, true);
      return anchors.map((anchor) => dateUtc(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, Math.min(rule.day as number, daysInMonth(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1))));
    }
  }

  if (rule.frequency === "yearly" && rule.kind === "date" && rule.missingDatePolicy === "lastDay") {
    const anchorStart = dateUtc(from.getUTCFullYear(), 1, 1);
    const anchors = new RRule({
      freq: RRule.YEARLY,
      dtstart: anchorStart,
      bymonth: rule.month,
      bymonthday: 1,
    }).between(anchorStart, to, true);
    return anchors.map((anchor) => dateUtc(anchor.getUTCFullYear(), rule.month, Math.min(rule.day, daysInMonth(anchor.getUTCFullYear(), rule.month))));
  }

  return [];
}

function buildRRule(rule: RecurrenceRule, start: Date): RRule {
  if (rule.frequency === "monthly" && rule.kind === "day") {
    return new RRule({
      freq: RRule.MONTHLY,
      dtstart: start,
      bymonthday: rule.day === "last" ? -1 : rule.day,
    });
  }

  if (rule.frequency === "monthly" && rule.kind === "weekday") {
    return new RRule({
      freq: RRule.MONTHLY,
      dtstart: start,
      byweekday: weekday(rule.weekday),
      bysetpos: POSITION_VALUES[rule.position],
    });
  }

  if (rule.frequency === "weekly") {
    return new RRule({
      freq: RRule.WEEKLY,
      dtstart: start,
      byweekday: weekday(rule.weekday),
    });
  }

  return new RRule({
    freq: RRule.YEARLY,
    dtstart: start,
    bymonth: rule.month,
    bymonthday: rule.day,
  });
}

function occurrencesBetween(rule: RecurrenceRule, from: Date, to: Date): Date[] {
  const mapped = mappedFixedDayOccurrences(rule, from, to);
  const candidates = mapped.length ? mapped : buildRRule(rule, from).between(from, to, true);
  return [...new Map(candidates.map((date) => [toDateKey(date), date])).values()]
    .filter((date) => date >= from && date < to)
    .sort((left, right) => left.getTime() - right.getTime());
}

function validateRuleInternal(rule: RecurrenceRule): void {
  if (!rule || typeof rule !== "object") throw new Error("日期规则不能为空");

  if (rule.frequency === "monthly") {
    if (rule.kind === "day") {
      if (rule.day !== "last") assertInteger(rule.day, "每月日期", 1, 31);
      if (rule.day !== "last" && rule.day >= 29 && rule.missingDatePolicy !== "lastDay" && rule.missingDatePolicy !== "skip") {
        throw new Error("日期可能不存在时，请选择处理方式");
      }
      return;
    }
    if (rule.kind === "weekday") {
      assertInteger(rule.weekday, "星期", 0, 6);
      if (!Object.prototype.hasOwnProperty.call(POSITION_VALUES, rule.position)) throw new Error("星期序位无效");
      return;
    }
  }

  if (rule.frequency === "weekly") {
    assertInteger(rule.weekday, "星期", 0, 6);
    return;
  }

  if (rule.frequency === "yearly" && rule.kind === "date") {
    assertInteger(rule.month, "月份", 1, 12);
    assertInteger(rule.day, "日期", 1, 31);
    if (rule.missingDatePolicy !== "lastDay" && rule.missingDatePolicy !== "skip") throw new Error("日期可能不存在时，请选择处理方式");
    return;
  }

  throw new Error("无法识别日期规则");
}

function deserializeRule(value: unknown): RecurrenceRule {
  if (typeof value === "string") {
    try {
      return deserializeRule(JSON.parse(value));
    } catch {
      throw new Error("日期规则数据损坏");
    }
  }
  if (!value || typeof value !== "object") throw new Error("日期规则数据损坏");
  const rule = value as RecurrenceRule;
  validateRuleInternal(rule);
  return rule;
}

export const recurrenceRuleService: RecurrenceRuleService = {
  validate: validateRuleInternal,

  describe(rule) {
    validateRuleInternal(rule);
    if (rule.frequency === "monthly" && rule.kind === "day") {
      if (rule.day === "last") return "每月最后一天";
      const policy = rule.missingDatePolicy === "lastDay" ? "，缺少该日期时顺延到月底" : rule.missingDatePolicy === "skip" ? "，缺少该日期时跳过" : "";
      return `每月 ${rule.day} 日${policy}`;
    }
    if (rule.frequency === "monthly" && rule.kind === "weekday") return `每月${POSITION_LABELS[rule.position]}${WEEKDAY_LABELS[rule.weekday]}`;
    if (rule.frequency === "weekly") return `每周${WEEKDAY_LABELS[rule.weekday]}`;
    const policy = rule.missingDatePolicy === "lastDay" ? "，缺少该日期时顺延到月底" : "，缺少该日期时跳过";
    return `每年 ${rule.month} 月 ${rule.day} 日${policy}`;
  },

  nextOccurrences(rule, referenceDate = new Date(), limit = 3) {
    validateRuleInternal(rule);
    if (limit <= 0) return [];
    const reference = dateFromRuleReference(referenceDate);
    const from = addUtcDays(reference, 1);
    const to = addUtcYears(from, 50);
    return occurrencesBetween(rule, from, to).slice(0, limit).map(toDateKey);
  },

  occurrencesForMonth(rule, yearMonth) {
    validateRuleInternal(rule);
    const { year, month } = assertYearMonth(yearMonth);
    return occurrencesBetween(rule, startOfMonthUtc(year, month), endExclusiveOfMonthUtc(year, month)).map(toDateKey);
  },

  serialize(rule) {
    validateRuleInternal(rule);
    return JSON.stringify(rule);
  },

  deserialize: deserializeRule,
};

export function formatRuleDate(value: string): string {
  return value;
}

export function ruleNeedsMissingDatePolicy(rule: RecurrenceRule): boolean {
  if (rule.frequency === "monthly" && rule.kind === "day") return rule.day !== "last" && rule.day >= 29;
  return rule.frequency === "yearly" && rule.kind === "date";
}

export function getDaysInMonth(year: number, month: number): number {
  return daysInMonth(year, month);
}

export function getYearlyRuleDate(rule: YearlyRecurrenceRule, year: number): string | null {
  const day = Math.min(rule.day, daysInMonth(year, rule.month));
  if (rule.missingDatePolicy === "skip" && day !== rule.day) return null;
  return toDateKey(dateUtc(year, rule.month, day));
}
