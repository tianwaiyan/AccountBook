import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CircleDollarSign, Minus, Plus } from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  type PieSectorDataItem,
  XAxis,
  YAxis,
} from "recharts";
import { LoadingState, ErrorState } from "@/components/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReferenceData } from "@/hooks/use-reference-data";
import { analyticsRepository } from "@/services/registry";
import type {
  ChartDatum,
  MonthSummary,
  MonthlyTrendDatum,
  TrackingRecord,
  YearlyCategoryDatum,
} from "@/types/domain";
import { DEFAULT_BOOK_ID, statusLabels } from "@/types/domain";
import { currentYearMonth, monthLabel } from "@/utils/date";
import { formatMoney, minorToYuan } from "@/utils/money";
import { cn } from "@/utils/cn";
import { clampTrendVisibleMonths, getTrendAxisTicks, getTrendDomainMaximum, getTrendVisibleRange, toTrendPoints } from "@/utils/trend";

const COLORS = ["#2563eb", "#0f766e", "#dc2626", "#ca8a04", "#7c3aed", "#0891b2", "#db2777", "#4d7c0f"];

interface DashboardData {
  summary: MonthSummary;
  trend: MonthlyTrendDatum[];
  categories: ChartDatum[];
  incomeTags: ChartDatum[];
  expenseTags: ChartDatum[];
  yearly: YearlyCategoryDatum[];
  reimbursements: TrackingRecord[];
  transfers: TrackingRecord[];
}

export function DashboardPage({ referenceData, refreshVersion }: { referenceData: ReferenceData; refreshVersion: number }) {
  const initialMonth = referenceData.months.includes(currentYearMonth()) ? currentYearMonth() : referenceData.months[0] ?? currentYearMonth();
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedYear = selectedMonth.slice(0, 4);

  useEffect(() => {
    if (referenceData.months.length && !referenceData.months.includes(selectedMonth)) setSelectedMonth(referenceData.months[0]);
  }, [referenceData.months, selectedMonth]);

  useEffect(() => {
    let active = true;
    Promise.all([
      analyticsRepository.monthSummary(DEFAULT_BOOK_ID, selectedMonth),
      analyticsRepository.monthlyTrend(DEFAULT_BOOK_ID),
      analyticsRepository.categoryTotals(DEFAULT_BOOK_ID, selectedMonth),
      analyticsRepository.tagTotals(DEFAULT_BOOK_ID, selectedMonth, "income"),
      analyticsRepository.tagTotals(DEFAULT_BOOK_ID, selectedMonth, "expense"),
      analyticsRepository.yearlyCategoryTotals(DEFAULT_BOOK_ID, selectedYear),
      analyticsRepository.pendingReimbursements(DEFAULT_BOOK_ID),
      analyticsRepository.pendingTransfers(DEFAULT_BOOK_ID),
    ]).then(([summary, trend, categories, incomeTags, expenseTags, yearly, reimbursements, transfers]) => {
      if (active) { setData({ summary, trend, categories, incomeTags, expenseTags, yearly, reimbursements, transfers }); setError(null); }
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : String(reason)));
    return () => { active = false; };
  }, [selectedMonth, selectedYear, refreshVersion]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState />;

  return (
    <div className="space-y-5">
      <PeriodToolbar months={referenceData.months} selectedMonth={selectedMonth} onChange={setSelectedMonth} />
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="个人收入" value={formatMoney(data.summary.incomeMinor)} icon={ArrowUpRight} tone="income" />
        <MetricCard label="个人支出" value={formatMoney(data.summary.expenseMinor)} icon={ArrowDownRight} tone="expense" />
        <MetricCard label="本月结余" value={formatMoney(data.summary.balanceMinor, { sign: true })} icon={CircleDollarSign} tone={data.summary.balanceMinor >= 0 ? "primary" : "expense"} />
      </div>

      <YearlyTable data={data.yearly} year={selectedYear} />

      <section>
        <Card><CardHeader><CardTitle>月度收支趋势</CardTitle></CardHeader><CardContent><MonthlyTrendChart data={data.trend} /></CardContent></Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <PiePanel title="支出分类" data={data.categories} />
        <PiePanel title="收入标签" data={data.incomeTags} />
        <PiePanel title="支出标签" data={data.expenseTags} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SmallMetric label="已垫付公费" value={data.summary.pendingReimbursementMinor} warning />
        <SmallMetric label="已结清公费" value={data.summary.settledReimbursementMinor} />
        <SmallMetric label="总过手转出" value={data.summary.passThroughOutgoingMinor} />
        <SmallMetric label="总过手转入" value={data.summary.passThroughIncomingMinor} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <TrackingPanel title="待报销清单" rows={data.reimbursements} empty="暂无待报销记录" />
        <TrackingPanel title="待转出清单" rows={data.transfers} empty="暂无待转出记录" />
      </section>
    </div>
  );
}

function PeriodToolbar({ months, selectedMonth, onChange }: { months: string[]; selectedMonth: string; onChange: (month: string) => void }) {
  const years = [...new Set(months.map((month) => month.slice(0, 4)))];
  const [year, setYear] = useState(selectedMonth.slice(0, 4));
  useEffect(() => setYear(selectedMonth.slice(0, 4)), [selectedMonth]);
  return (
    <div className="sticky top-16 z-10 -mx-3 flex items-center gap-2 overflow-x-auto border-b border-border bg-background/95 px-3 py-2 backdrop-blur sm:-mx-6 sm:px-6">
      <select className="h-9 shrink-0 rounded-md border border-input bg-background px-2 text-sm" value={year} onChange={(event) => { const nextYear = event.target.value; setYear(nextYear); const latest = months.find((month) => month.startsWith(nextYear)); if (latest) onChange(latest); }}>
        {(years.length ? years : [selectedMonth.slice(0, 4)]).map((item) => <option key={item} value={item}>{item}年</option>)}
      </select>
      <div className="grid min-w-[680px] flex-1 grid-cols-12 gap-1">
        {Array.from({ length: 12 }, (_, index) => {
          const month = `${year}-${String(index + 1).padStart(2, "0")}`;
          return <Button key={month} size="sm" variant={month === selectedMonth ? "default" : "ghost"} disabled={months.length > 0 && !months.includes(month)} onClick={() => onChange(month)}>{index + 1}月</Button>;
        })}
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof ArrowUpRight; tone: "income" | "expense" | "primary" | "neutral" }) {
  const color = { income: "text-emerald-600", expense: "text-rose-600", primary: "text-blue-600", neutral: "text-slate-600" }[tone];
  return <Card><CardContent className="flex items-start justify-between p-4"><div><p className="text-xs text-muted-foreground">{label}</p><p className={cn("mt-2 text-2xl font-semibold", color)}>{value}</p></div><Icon className={cn("size-5", color)} /></CardContent></Card>;
}

function SmallMetric({ label, value, warning }: { label: string; value: number; warning?: boolean }) {
  return <div className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3"><span className="text-sm text-muted-foreground">{label}</span><span className={cn("text-sm font-semibold", warning && value > 0 && "text-rose-600")}>{formatMoney(value)}</span></div>;
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{children}</CardContent></Card>;
}

function MonthlyTrendChart({ data }: { data: MonthlyTrendDatum[] }) {
  const points = useMemo(() => toTrendPoints(data), [data]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visibleMonths, setVisibleMonths] = useState(() => clampTrendVisibleMonths(points.length, 12));
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const anchorIndexRef = useRef<number | null>(null);
  const plotHeight = 264;
  const axisHeight = 42;
  const contentWidth = Math.max(viewportWidth, viewportWidth > 0 ? viewportWidth * points.length / visibleMonths : points.length * 80);
  const range = getTrendVisibleRange(points.length, scrollLeft, viewportWidth || 1, contentWidth);
  const domainMaximum = getTrendDomainMaximum(points, range);

  useEffect(() => {
    setVisibleMonths((current) => clampTrendVisibleMonths(points.length, current));
  }, [points.length]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const updateSize = () => setViewportWidth(element.clientWidth);
    updateSize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || !viewportWidth || !points.length) return;
    const maxScroll = Math.max(0, contentWidth - viewportWidth);
    if (anchorIndexRef.current !== null) {
      element.scrollLeft = Math.min(maxScroll, anchorIndexRef.current * contentWidth / points.length);
      anchorIndexRef.current = null;
    } else if (element.scrollLeft > maxScroll) {
      element.scrollLeft = maxScroll;
    }
    setScrollLeft(element.scrollLeft);
  }, [contentWidth, points.length, viewportWidth]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) setScrollLeft(scrollRef.current.scrollLeft);
  }, []);

  const changeZoom = (delta: number) => {
    const next = clampTrendVisibleMonths(points.length, visibleMonths + delta);
    if (next === visibleMonths) return;
    anchorIndexRef.current = range.startIndex;
    setVisibleMonths(next);
  };

  return <div className="min-w-0 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-4 text-xs text-muted-foreground" aria-label="趋势图图例">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 bg-emerald-600" />收入</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 bg-rose-600" />支出</span>
      </div>
      <div className="flex items-center gap-1"><Button size="icon" variant="ghost" title="放大，减少显示月份" aria-label="放大趋势图" disabled={visibleMonths <= 12} onClick={() => changeZoom(-6)}><Plus className="size-4" /></Button><span className="min-w-16 text-center text-xs text-muted-foreground">{visibleMonths} 个月</span><Button size="icon" variant="ghost" title="缩小，增加显示月份" aria-label="缩小趋势图" disabled={visibleMonths >= Math.max(12, points.length)} onClick={() => changeZoom(6)}><Minus className="size-4" /></Button></div>
    </div>
    <div className="min-w-0 overflow-hidden rounded-md border border-border bg-card">
      <div className="flex min-w-0">
        <div className="w-[72px] shrink-0 border-r border-border bg-card" style={{ height: plotHeight + axisHeight }}>
          <div style={{ height: plotHeight }}>
            <ResponsiveContainer width="100%" height={plotHeight}>
              <LineChart data={points} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
                <YAxis domain={[0, domainMaximum]} ticks={getTrendAxisTicks(domainMaximum)} interval={0} tick={{ fontSize: 10 }} tickFormatter={formatTrendAxisValue} width={68} allowDataOverflow />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="border-t border-border bg-muted/30" style={{ height: axisHeight }} />
        </div>
        <div ref={scrollRef} onScroll={handleScroll} className="scrollbar-thin min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div style={{ width: `${Math.max(100, contentWidth)}px`, minWidth: "100%" }}>
            <div style={{ height: plotHeight }}>
              <ResponsiveContainer width="100%" height={plotHeight}>
                <LineChart data={points} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="month" hide />
                  <YAxis domain={[0, domainMaximum]} hide allowDataOverflow />
                  <Tooltip formatter={(value) => formatMoney(Number(value) * 100)} labelFormatter={(value) => `月份：${value}`} />
                  <Line type="linear" dataKey="income" name="收入" stroke="#059669" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="linear" dataKey="expense" name="支出" stroke="#dc2626" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="border-t border-border bg-muted/30" style={{ height: axisHeight }}>
              <ResponsiveContainer width="100%" height={axisHeight}>
                <LineChart data={points} margin={{ left: 0, right: 12, top: 0, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={formatTrendMonth} interval={0} tickLine={false} axisLine={{ stroke: "#9ca3af" }} height={38} />
                </LineChart>
              </ResponsiveContainer>
            </div>
        </div>
      </div>
    </div>
  </div>
  </div>;
}

function formatTrendMonth(value: string) {
  return value.slice(5).replace(/^0/, "") + "月";
}

function formatTrendAxisValue(value: number) {
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1)}万`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}千`;
  return String(Math.round(value));
}

function PiePanel({ title, data }: { title: string; data: ChartDatum[] }) {
  const chartData = useMemo(() => data.map((item) => ({ ...item, yuan: minorToYuan(item.value) })), [data]);
  const activeShape = (props: PieSectorDataItem) => {
    const outerRadius = Number(props.outerRadius ?? 0);
    return <Sector {...props} outerRadius={outerRadius + 8} stroke="#ffffff" strokeWidth={1.5} />;
  };
  return <ChartPanel title={title}>{data.length ? <ResponsiveContainer width="100%" height={280}><PieChart><Pie data={chartData} dataKey="yuan" nameKey="name" innerRadius={42} outerRadius={102} paddingAngle={0.4} labelLine={false} activeShape={activeShape} label={({ cx, cy, midAngle, innerRadius, outerRadius, name, percent }) => {
    if (Number(percent) < 0.035) return null;
    const radius = Number(innerRadius) + (Number(outerRadius) - Number(innerRadius)) * 0.57;
    const x = Number(cx) + radius * Math.cos(-Number(midAngle) * Math.PI / 180);
    const y = Number(cy) + radius * Math.sin(-Number(midAngle) * Math.PI / 180);
    return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={600} style={{ pointerEvents: "none" }}><tspan x={x} dy="-0.45em">{String(name)}</tspan><tspan x={x} dy="1.15em">{(Number(percent) * 100).toFixed(1)}%</tspan></text>;
  }}>{data.map((item, index) => <Cell key={item.name} fill={COLORS[index % COLORS.length]} stroke="#ffffff" strokeWidth={0.5} />)}</Pie><Tooltip formatter={(value) => formatMoney(Number(value) * 100)} /></PieChart></ResponsiveContainer> : <EmptyChart />}</ChartPanel>;
}

function EmptyChart() {
  return <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">暂无数据</div>;
}

function YearlyTable({ data, year }: { data: YearlyCategoryDatum[]; year: string }) {
  const rows = useMemo(() => {
    const byCategory = new Map<string, { name: string; values: number[] }>();
    for (const item of data) {
      const row = byCategory.get(item.categoryId) ?? { name: item.categoryName, values: Array(12).fill(0) };
      row.values[item.month - 1] = item.totalMinor;
      byCategory.set(item.categoryId, row);
    }
    return [...byCategory.values()];
  }, [data]);
  const maximum = Math.max(1, ...rows.flatMap((row) => row.values));
  const totals = rows.reduce((result, row) => result.map((value, index) => value + row.values[index]), Array(12).fill(0));
  return <Card><CardHeader><CardTitle>{year} 年度分类支出</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0 pt-4"><table className="w-full min-w-[860px] border-collapse text-xs"><thead><tr className="border-y border-border bg-muted/60"><th className="sticky left-0 bg-muted px-3 py-2 text-left">分类</th>{Array.from({ length: 12 }, (_, index) => <th key={index} className="px-2 py-2 text-right">{index + 1}月</th>)}</tr></thead><tbody>{rows.length ? <>{rows.map((row) => <tr key={row.name} className="border-b border-border"><th className="sticky left-0 bg-card px-3 py-2 text-left font-medium">{row.name}</th>{row.values.map((value, index) => <td key={index} className="px-2 py-2 text-right tabular-nums" style={{ backgroundColor: value ? `rgba(220, 38, 38, ${0.08 + (value / maximum) * 0.32})` : undefined }}>{value ? formatMoney(value) : "-"}</td>)}</tr>)}<tr className="border-t-2 border-border font-bold"><th className="sticky left-0 bg-card px-3 py-2 text-left font-bold">总计</th>{totals.map((value, index) => <td key={index} className="px-2 py-2 text-right font-bold tabular-nums">{value ? formatMoney(value) : "-"}</td>)}</tr></> : <tr><td colSpan={13} className="py-10 text-center text-muted-foreground">暂无年度支出</td></tr>}</tbody></table></CardContent></Card>;
}

function TrackingPanel({ title, rows, empty }: { title: string; rows: TrackingRecord[]; empty: string }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle><Badge tone={rows.length ? "warning" : "neutral"}>{rows.length}</Badge></CardHeader><CardContent className="space-y-2">{rows.length ? rows.slice(0, 8).map((row) => <div key={row.id} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0"><div className="min-w-0"><p className="truncate text-sm font-medium">{row.counterparty || row.remark || "未填写对方"}</p><p className="text-xs text-muted-foreground">{row.occurredAt.slice(0, 10)} · {row.statusCode ? statusLabels[row.statusCode] : ""}</p></div><span className="shrink-0 text-sm font-semibold">{formatMoney(row.amountMinor)}</span></div>) : <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>}</CardContent></Card>;
}
