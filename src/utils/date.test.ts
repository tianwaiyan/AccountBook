import { describe, expect, it } from "vitest";
import { formatTransactionDisplayDateTime, getDateTimeValidationError, isValidDateTime, normalizeDateTime } from "@/utils/date";

describe("formatTransactionDisplayDateTime", () => {
  it("keeps the full local date and time by default", () => {
    expect(formatTransactionDisplayDateTime("2026-08-10 14:05:09")).toBe("2026-08-10 14:05:09");
  });

  it("uses a date-only display without changing the stored value", () => {
    expect(formatTransactionDisplayDateTime("2026-08-10 14:05:09", "short")).toBe("2026-08-10");
  });
});

describe("date time validation", () => {
  it("accepts valid leap days and rejects normalized-but-invalid values", () => {
    expect(isValidDateTime("2024-02-29 23:59:59")).toBe(true);
    expect(isValidDateTime("2026-02-29 23:59:59")).toBe(false);
    expect(getDateTimeValidationError("2026-02-30 00:00:00")).toBe("日期不符合实际月份");
    expect(getDateTimeValidationError("2026-01-01 24:00:00")).toBe("小时必须在 00-23 之间");
    expect(getDateTimeValidationError("2026-01-01 23:60:00")).toBe("分钟必须在 00-59 之间");
    expect(getDateTimeValidationError("2026-01-01 23:59:60")).toBe("秒必须在 00-59 之间");
    expect(getDateTimeValidationError("0000-01-01 00:00:00")).toBe("年份必须在 0001-9999 之间");
    expect(isValidDateTime(" 2026-01-01 00:00:00")).toBe(false);
    expect(() => normalizeDateTime("2026-02-30 00:00:00")).toThrow("无法识别交易时间");
  });
});
