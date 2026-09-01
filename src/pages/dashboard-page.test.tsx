import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReferenceData } from "@/hooks/use-reference-data";
import type { ChartDatum, MonthSummary, MonthlyTrendDatum, Transaction, TrackingRecord, YearlyCategoryDatum } from "@/types/domain";
import type { PropsWithChildren } from "react";
import { formatMoney } from "@/utils/money";

const { analyticsRepository, transactionRepository } = vi.hoisted(() => ({
  analyticsRepository: {
    monthSummary: vi.fn(),
    monthlyTrend: vi.fn(),
    categoryTotals: vi.fn(),
    tagTotals: vi.fn(),
    yearlyCategoryTotals: vi.fn(),
    pendingReimbursements: vi.fn(),
    pendingTransfers: vi.fn(),
  },
  transactionRepository: {
    list: vi.fn(),
  },
}));

vi.mock("@/services/registry", () => ({ analyticsRepository, transactionRepository }));
vi.mock("recharts", () => {
  const Passthrough = ({ children }: PropsWithChildren) => <div>{children}</div>;
  const MockPie = ({ data = [], onClick, children }: PropsWithChildren<{ data?: Array<{ name: string }>; onClick?: (entry: { name: string }) => void }>) => <div>{data.map((entry) => <button key={entry.name} type="button" data-pie-slice={entry.name} onClick={() => onClick?.(entry)}>{entry.name}</button>)}{children}</div>;
  return {
    CartesianGrid: Passthrough,
    Cell: () => null,
    Line: Passthrough,
    LineChart: Passthrough,
    Pie: MockPie,
    PieChart: Passthrough,
    ResponsiveContainer: Passthrough,
    Sector: () => null,
    Tooltip: Passthrough,
    XAxis: Passthrough,
    YAxis: Passthrough,
  };
});

import { DashboardPage } from "@/pages/dashboard-page";

const summary: MonthSummary = {
  incomeMinor: 1_850_000,
  expenseMinor: 8_650,
  balanceMinor: 1_841_350,
  count: 3,
  passThroughOutgoingMinor: 0,
  passThroughIncomingMinor: 0,
  pendingReimbursementMinor: 12_600,
  settledReimbursementMinor: 0,
};

const trend: MonthlyTrendDatum[] = [{ month: "2026-08", incomeMinor: 1_850_000, expenseMinor: 8_650, count: 3 }];
const categories: ChartDatum[] = [{ name: "伙食费用", value: 8_650, count: 2 }];
const incomeTags: ChartDatum[] = [{ name: "劳动收入", value: 1_850_000, count: 1 }];
const expenseTags: ChartDatum[] = [{ name: "品质生活", value: 8_650, count: 2 }];
const yearly: YearlyCategoryDatum[] = [{ categoryId: "cat-food", categoryName: "伙食费用", month: 8, totalMinor: 8_650 }];
const reimbursements: TrackingRecord[] = [{ id: "reimbursement-1", occurredAt: "2026-08-06 12:30:00", counterparty: "餐厅", remark: "团队午餐", amountMinor: 12_600, statusCode: "pending_reimbursement" }];
const transfers: TrackingRecord[] = [];

const foodRow = makeTransaction("food-1", "2026-08-08 08:10:00", "现金", "expense", -1_850, "伙食费用", "品质生活", "社区早餐店", "早餐");
const lateFoodRow = makeTransaction("food-2", "2026-08-08 18:10:00", "现金", "expense", -2_200, "伙食费用", "品质生活", "晚餐店", "晚餐");
const salaryRow = makeTransaction("salary-1", "2026-08-07 14:00:00", "银行卡", "income", 1_850_000, "工资收入", "劳动收入", "公司", "八月工资");

const referenceData: ReferenceData = {
  accounts: [],
  categories: [
    { id: "cat-food", bookId: "book-default", kind: "expense", name: "伙食费用", systemKey: null, defaultTagId: null, sortOrder: 0, isActive: true },
    { id: "cat-salary", bookId: "book-default", kind: "income", name: "工资收入", systemKey: null, defaultTagId: null, sortOrder: 1, isActive: true },
  ],
  tags: [
    { id: "tag-quality", bookId: "book-default", kind: "expense", name: "品质生活", sortOrder: 0, isActive: true },
    { id: "tag-labor", bookId: "book-default", kind: "income", name: "劳动收入", sortOrder: 1, isActive: true },
  ],
  months: ["2026-08"],
};

describe("DashboardPage pie details", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    analyticsRepository.monthSummary.mockResolvedValue(summary);
    analyticsRepository.monthlyTrend.mockResolvedValue(trend);
    analyticsRepository.categoryTotals.mockResolvedValue(categories);
    analyticsRepository.tagTotals.mockImplementation(async (_bookId: string, _month: string, kind: "expense" | "income") => kind === "income" ? incomeTags : expenseTags);
    analyticsRepository.yearlyCategoryTotals.mockResolvedValue(yearly);
    analyticsRepository.pendingReimbursements.mockResolvedValue(reimbursements);
    analyticsRepository.pendingTransfers.mockResolvedValue(transfers);
    transactionRepository.list.mockResolvedValue([foodRow, salaryRow]);
  });

  async function renderDashboard() {
    render(<DashboardPage referenceData={referenceData} refreshVersion={0} />);
    await waitFor(() => expect(screen.getByText("支出分类")).toBeInTheDocument());
  }

  it("loads current-month details for each of the three pie charts", async () => {
    await renderDashboard();

    const categorySlice = document.querySelector('[data-pie-slice="伙食费用"]');
    expect(categorySlice).toBeTruthy();
    fireEvent.click(categorySlice as Element);
    await waitFor(() => expect(screen.getByText("2026年8月 · 支出分类：伙食费用")).toBeInTheDocument());
    expect(screen.getByText("社区早餐店")).toBeInTheDocument();
    expect(transactionRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ yearMonth: "2026-08", tradeTypes: ["expense", "refund"], sortBy: "occurredAt", sortDirection: "asc" }));

    fireEvent.click(document.querySelector('[data-pie-slice="劳动收入"]') as Element);
    await waitFor(() => expect(screen.getByText("2026年8月 · 收入标签：劳动收入")).toBeInTheDocument());
    expect(screen.getByText("公司")).toBeInTheDocument();
    expect(transactionRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ tradeTypes: ["income"] }));

    fireEvent.click(document.querySelector('[data-pie-slice="品质生活"]') as Element);
    await waitFor(() => expect(screen.getByText("2026年8月 · 支出标签：品质生活")).toBeInTheDocument());
    expect(transactionRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ tradeTypes: ["expense", "refund"] }));
  });

  it("uses the fixed transaction detail column order and sorts matching rows by time", async () => {
    transactionRepository.list.mockResolvedValue([lateFoodRow, salaryRow, foodRow]);
    await renderDashboard();
    fireEvent.click(document.querySelector('[data-pie-slice="伙食费用"]') as Element);

    const panel = await screen.findByTestId("pie-detail-panel");
    expect([...panel.querySelectorAll("thead th")].map((cell) => cell.textContent)).toEqual(["时间", "账户", "收支", "金额", "备注", "交易对方", "支付方式"]);
    expect([...panel.querySelectorAll("tbody tr")].map((row) => row.querySelector("td")?.textContent)).toEqual(["2026-08-08 08:10:00", "2026-08-08 18:10:00"]);
  });

  it("toggles the selected detail and keeps reimbursement below it", async () => {
    await renderDashboard();
    fireEvent.click(document.querySelector('[data-pie-slice="伙食费用"]') as Element);
    await waitFor(() => expect(screen.getByTestId("pie-detail-panel")).toBeInTheDocument());

    const detail = screen.getByTestId("pie-detail-panel");
    const reimbursement = screen.getByText("待报销清单");
    expect(detail.compareDocumentPosition(reimbursement) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

    fireEvent.click(document.querySelector('[data-pie-slice="伙食费用"]') as Element);
    await waitFor(() => expect(screen.queryByTestId("pie-detail-panel")).toBeNull());
  });

  it("shows an empty state when a selected chart item has no matching rows", async () => {
    transactionRepository.list.mockResolvedValue([]);
    await renderDashboard();
    fireEvent.click(document.querySelector('[data-pie-slice="伙食费用"]') as Element);

    expect(await screen.findByText("该月份暂无匹配项目")).toBeInTheDocument();
  });

  it("keeps negative net values below the pie and opens their signed details", async () => {
    const refundRow = { ...foodRow, id: "food-refund", tradeType: "refund" as const, amountMinor: 12_000 };
    const negativeSummary = { ...summary, expenseMinor: -12_000, balanceMinor: -3_000 };
    const negativeCategory = [{ name: "伙食费用", value: -12_000, count: 1 }];
    const negativeTag = [{ name: "品质生活", value: -12_000, count: 1 }];
    analyticsRepository.monthSummary.mockResolvedValue(negativeSummary);
    analyticsRepository.monthlyTrend.mockResolvedValue([{ ...trend[0], expenseMinor: -12_000 }]);
    analyticsRepository.categoryTotals.mockResolvedValue(negativeCategory);
    analyticsRepository.tagTotals.mockImplementation(async (_bookId: string, _month: string, kind: "expense" | "income") => kind === "income" ? incomeTags : negativeTag);
    analyticsRepository.yearlyCategoryTotals.mockResolvedValue([{ ...yearly[0], totalMinor: -12_000 }]);
    transactionRepository.list.mockResolvedValue([refundRow]);

    await renderDashboard();

    expect(screen.getAllByText(formatMoney(-12_000, { sign: true })).length).toBeGreaterThan(0);
    const negativeItem = document.querySelector('[data-negative-net-item="伙食费用"]');
    expect(negativeItem).toBeTruthy();
    fireEvent.click(negativeItem as Element);

    const panel = await screen.findByTestId("pie-detail-panel");
    expect(panel.querySelector("tbody td:nth-child(4)")?.textContent).toBe(formatMoney(-12_000, { sign: true }));
    expect(transactionRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ tradeTypes: ["expense", "refund"] }));
  });
});

function makeTransaction(id: string, occurredAt: string, accountName: string, tradeType: Transaction["tradeType"], amountMinor: number, categoryName: string, tagName: string, counterparty: string, remark: string): Transaction {
  return {
    id,
    bookId: "book-default",
    occurredAt,
    accountId: accountName,
    accountName,
    tradeType,
    amountMinor,
    categoryId: categoryName === "伙食费用" ? "cat-food" : "cat-salary",
    categoryName,
    categorySystemKey: null,
    tagId: tagName === "品质生活" ? "tag-quality" : "tag-labor",
    tagName,
    statusCode: null,
    remark,
    counterparty,
    paymentChannel: accountName,
    source: "manual",
    sourceCategory: null,
    importFingerprint: null,
    fingerprintVersion: null,
    createdAt: "2026-08-08T00:00:00Z",
    updatedAt: "2026-08-08T00:00:00Z",
  };
}
