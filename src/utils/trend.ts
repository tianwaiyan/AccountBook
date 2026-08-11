import type { MonthlyTrendDatum } from "@/types/domain";

export interface TrendPoint {
  month: string;
  income: number;
  expense: number;
}

export interface TrendVisibleRange {
  startIndex: number;
  endIndex: number;
}

export function clampTrendVisibleMonths(dataLength: number, requested: number, minimum = 12): number {
  const lowerBound = Math.max(1, minimum);
  return Math.max(lowerBound, Math.min(Math.max(lowerBound, dataLength), requested));
}

export function getTrendVisibleRange(dataLength: number, scrollLeft: number, viewportWidth: number, contentWidth: number): TrendVisibleRange {
  if (dataLength <= 0) return { startIndex: 0, endIndex: 0 };
  const safeViewportWidth = Math.max(1, viewportWidth);
  const safeContentWidth = Math.max(safeViewportWidth, contentWidth);
  const monthWidth = safeContentWidth / dataLength;
  const startIndex = Math.max(0, Math.min(dataLength - 1, Math.floor(Math.max(0, scrollLeft) / monthWidth)));
  const endIndex = Math.max(startIndex + 1, Math.min(dataLength, Math.ceil((Math.max(0, scrollLeft) + safeViewportWidth) / monthWidth)));
  return { startIndex, endIndex };
}

export function getTrendDomainMaximum(points: TrendPoint[], range: TrendVisibleRange): number {
  const visible = points.slice(range.startIndex, range.endIndex);
  const maximum = Math.max(0, ...visible.flatMap((point) => [point.income, point.expense]));
  return maximum || 1;
}

export function getTrendAxisTicks(domainMaximum: number, count = 5): number[] {
  const safeMaximum = Math.max(1, domainMaximum);
  const safeCount = Math.max(2, count);
  return Array.from({ length: safeCount }, (_, index) => safeMaximum * index / (safeCount - 1));
}

export function toTrendPoints(data: MonthlyTrendDatum[]): TrendPoint[] {
  return data.map((item) => ({
    month: item.month,
    income: item.incomeMinor / 100,
    expense: item.expenseMinor / 100,
  }));
}
