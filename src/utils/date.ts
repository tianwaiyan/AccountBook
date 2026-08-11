const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export type TransactionDateDisplay = "full" | "short";

export function formatLocalDateTime(value: Date = new Date()): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

export function normalizeDateTime(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatLocalDateTime(value);
  }
  const text = String(value ?? "").trim().replace("T", " ");
  if (DATE_TIME_PATTERN.test(text) && !Number.isNaN(new Date(text.replace(" ", "T")).getTime())) {
    return text;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`无法识别交易时间：${text || "空白"}`);
  }
  return formatLocalDateTime(parsed);
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
