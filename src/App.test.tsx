import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { referenceData, filteredRow } = vi.hoisted(() => ({
  referenceData: { accounts: [], categories: [], tags: [], months: [] },
  filteredRow: { rowId: "session-filter-1", excludedReason: "记录重复" },
}));

vi.mock("@/hooks/use-reference-data", () => ({
  useReferenceData: () => ({ data: referenceData, loading: false, error: null }),
}));
vi.mock("@/features/transactions/entry-dialog", () => ({ EntryDialog: () => null }));
vi.mock("@/pages/dashboard-page", () => ({ DashboardPage: () => <div>概览测试页</div> }));
vi.mock("@/pages/transactions-page", () => ({ TransactionsPage: () => <div>流水测试页</div> }));
vi.mock("@/pages/options-page", () => ({ OptionsPage: () => <div>选项测试页</div> }));
vi.mock("@/pages/settings-page", () => ({ SettingsPage: () => <div>设置测试页</div> }));
vi.mock("@/pages/import-page", () => ({
  ImportPage: ({ excludedHistory, onExcludedHistoryChange }: { excludedHistory: Array<unknown>; onExcludedHistoryChange: React.Dispatch<React.SetStateAction<Array<unknown>>> }) => (
    <div>
      <div>导入测试页</div>
      <div data-testid="session-filter-count">{excludedHistory.length}</div>
      <button type="button" onClick={() => onExcludedHistoryChange((current) => [...current, filteredRow])}>添加过滤记录</button>
    </div>
  ),
}));

import App from "@/App";

describe("App session state", () => {
  afterEach(cleanup);

  it("keeps filtered history when leaving and returning to the import page", async () => {
    render(<App />);
    const navigation = within(screen.getByRole("navigation", { name: "主导航" }));

    await screen.findByText("概览测试页");
    fireEvent.click(navigation.getByRole("button", { name: "导入账单" }));
    await screen.findByText("导入测试页");
    expect(screen.getByTestId("session-filter-count")).toHaveTextContent("0");

    fireEvent.click(screen.getByRole("button", { name: "添加过滤记录" }));
    await waitFor(() => expect(screen.getByTestId("session-filter-count")).toHaveTextContent("1"));

    fireEvent.click(navigation.getByRole("button", { name: "概览" }));
    await screen.findByText("概览测试页");
    fireEvent.click(navigation.getByRole("button", { name: "导入账单" }));
    await screen.findByText("导入测试页");
    expect(screen.getByTestId("session-filter-count")).toHaveTextContent("1");
  });
});
