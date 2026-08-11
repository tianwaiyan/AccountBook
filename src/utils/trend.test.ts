import { describe, expect, it } from "vitest";
import { clampTrendVisibleMonths, getTrendAxisTicks, getTrendDomainMaximum, getTrendVisibleRange, toTrendPoints } from "@/utils/trend";

describe("trend viewport calculations", () => {
  it("keeps the zoom range at least 12 months", () => {
    expect(clampTrendVisibleMonths(36, 6)).toBe(12);
    expect(clampTrendVisibleMonths(6, 6)).toBe(12);
    expect(clampTrendVisibleMonths(36, 18)).toBe(18);
  });

  it("maps scroll position to the visible month range", () => {
    expect(getTrendVisibleRange(36, 0, 600, 1800)).toEqual({ startIndex: 0, endIndex: 12 });
    expect(getTrendVisibleRange(36, 600, 600, 1800)).toEqual({ startIndex: 12, endIndex: 24 });
    expect(getTrendVisibleRange(36, 1200, 600, 1800)).toEqual({ startIndex: 24, endIndex: 36 });
  });

  it("uses the maximum inside the current visible range and keeps a non-zero domain", () => {
    const points = [{ month: "2026-01", income: 20, expense: 10 }, { month: "2026-02", income: 80, expense: 30 }, { month: "2026-03", income: 40, expense: 120 }];
    expect(getTrendDomainMaximum(points, { startIndex: 0, endIndex: 2 })).toBe(80);
    expect(getTrendDomainMaximum(points, { startIndex: 2, endIndex: 3 })).toBe(120);
    expect(getTrendDomainMaximum([{ month: "2026-01", income: 0, expense: 0 }], { startIndex: 0, endIndex: 1 })).toBe(1);
  });

  it("includes the zero axis and current maximum in the y-axis ticks", () => {
    expect(getTrendAxisTicks(120, 5)).toEqual([0, 30, 60, 90, 120]);
  });

  it("converts minor amounts to chart values", () => {
    expect(toTrendPoints([{ month: "2026-01", incomeMinor: 12345, expenseMinor: 678, count: 2 }])).toEqual([{ month: "2026-01", income: 123.45, expense: 6.78 }]);
  });
});
