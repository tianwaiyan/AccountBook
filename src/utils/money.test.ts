import { describe, expect, it } from "vitest";
import { formatMoney, signedMinor, yuanToMinor } from "@/utils/money";

describe("money utilities", () => {
  it("rounds yuan values to integer cents", () => {
    expect(yuanToMinor("12.345")).toBe(1235);
    expect(yuanToMinor("¥1,234.56")).toBe(123456);
  });

  it("keeps the legacy signed amount invariant", () => {
    expect(signedMinor("18.20", "expense")).toBe(-1820);
    expect(signedMinor("18.20", "refund")).toBe(1820);
    expect(signedMinor("18.20", "income")).toBe(1820);
  });

  it("formats cents as CNY", () => {
    expect(formatMoney(-123456)).toContain("1,234.56");
  });
});

