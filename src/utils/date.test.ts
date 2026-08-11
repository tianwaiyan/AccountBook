import { describe, expect, it } from "vitest";
import { formatTransactionDisplayDateTime } from "@/utils/date";

describe("formatTransactionDisplayDateTime", () => {
  it("keeps the full local date and time by default", () => {
    expect(formatTransactionDisplayDateTime("2026-08-10 14:05:09")).toBe("2026-08-10 14:05:09");
  });

  it("uses a date-only display without changing the stored value", () => {
    expect(formatTransactionDisplayDateTime("2026-08-10 14:05:09", "short")).toBe("2026-08-10");
  });
});
