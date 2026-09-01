export const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export type TransactionDateDisplay = "full" | "short";

export function formatLocalDateTime(value: Date = new Date()): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

export function getDateTimeValidationError(value: unknown): string | null {
  const text = String(value ?? "");
  if (!DATE_TIME_PATTERN.test(text)) return "请输入 YYYY-MM-DD HH:MM:SS";

  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(5, 7));
  const day = Number(text.slice(8, 10));
  const hour = Number(text.slice(11, 13));
  const minute = Number(text.slice(14, 16));
  const second = Number(text.slice(17, 19));
  if (year < 1 || year > 9999) return "年份必须在 0001-9999 之间";
  if (month < 1 || month > 12) return "月份必须在 01-12 之间";
  if (day < 1 || day > daysInMonth(year, month)) return "日期不符合实际月份";
  if (hour > 23) return "小时必须在 00-23 之间";
  if (minute > 59) return "分钟必须在 00-59 之间";
  if (second > 59) return "秒必须在 00-59 之间";
  return null;
}

export function isValidDateTime(value: unknown): boolean {
  return getDateTimeValidationError(value) === null;
}

export function normalizeDateTime(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatLocalDateTime(value);
  }
  const text = String(value ?? "").trim().replace("T", " ");
  if (DATE_TIME_PATTERN.test(text)) {
    if (isValidDateTime(text)) return text;
    throw new Error(`无法识别交易时间：${text || "空白"}`);
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`无法识别交易时间：${text || "空白"}`);
  }
  return formatLocalDateTime(parsed);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function formatTransactionDisplayDateTime(value: string, display: TransactionDateDisplay = "full"): string {
  const normalized = value.trim().replace("T", " ");
  if (display === "short" && normalized.length >= 10) return normalized.slice(0, 10);
  return normalized;
}

export function currentYearMonth(): string {
  return formatLocalDateTime().slice(0, 7);
}

export function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  return `${year}年${Number(month)}月`;
}
