import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BatchPresetDialog } from "@/features/monthly-presets/batch-preset-dialog";
import type { MonthlyPreset } from "@/types/recurrence";

const { monthlyPresetService } = vi.hoisted(() => ({
  monthlyPresetService: {
    list: vi.fn(),
    generateForMonth: vi.fn(),
  },
}));

vi.mock("@/services/registry", () => ({ monthlyPresetService }));

const presets: MonthlyPreset[] = [
  {
    id: "salary", bookId: "book-default", name: "工资", rule: { frequency: "monthly", kind: "day", day: 15 }, entryTime: "09:00:00", accountId: "account-bank", tradeType: "income", amountMinor: 1850000, categoryId: null, tagId: null, statusCode: null, remark: "工资", counterparty: "公司", paymentChannel: "银行卡", defaultSelected: true, isActive: true, latestGeneratedMonth: null, createdAt: "2026-08-11", updatedAt: "2026-08-11", deletedAt: null,
  },
  {
    id: "rent", bookId: "book-default", name: "房租", rule: { frequency: "monthly", kind: "day", day: 1 }, entryTime: "10:00:00", accountId: "account-bank", tradeType: "expense", amountMinor: -300000, categoryId: null, tagId: null, statusCode: null, remark: "房租", counterparty: "房东", paymentChannel: "银行卡", defaultSelected: false, isActive: true, latestGeneratedMonth: null, createdAt: "2026-08-11", updatedAt: "2026-08-11", deletedAt: null,
  },
];

describe("BatchPresetDialog", () => {
  afterEach(() => cleanup());
  beforeEach(() => { vi.clearAllMocks(); monthlyPresetService.list.mockResolvedValue(presets); monthlyPresetService.generateForMonth.mockResolvedValue({ generated: 1, skippedPresets: 1, emptyPresets: 0 }); });

  it("uses default selection and passes the edited target month", async () => {
    render(<BatchPresetDialog open selectedMonth="2026-08" onOpenChange={vi.fn()} onGenerated={vi.fn()} />);
    expect(await screen.findByText("工资")).toBeInTheDocument();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toHaveAttribute("data-state", "checked");
    expect(checkboxes[1]).toHaveAttribute("data-state", "unchecked");

    fireEvent.change(screen.getByLabelText("目标月份"), { target: { value: "2026-09" } });
    fireEvent.click(screen.getByRole("button", { name: "生成记账" }));
    await waitFor(() => expect(monthlyPresetService.generateForMonth).toHaveBeenCalledWith("book-default", "2026-09", ["salary"]));
    expect(await screen.findByText(/已生成 1 条流水/)).toBeInTheDocument();
  });

  it("supports clear and select all", async () => {
    render(<BatchPresetDialog open selectedMonth="2026-08" onOpenChange={vi.fn()} onGenerated={vi.fn()} />);
    await screen.findByText("工资");
    fireEvent.click(screen.getByRole("button", { name: "全选" }));
    expect(screen.getAllByRole("checkbox").every((checkbox) => checkbox.getAttribute("data-state") === "checked")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "清空" }));
    expect(screen.getAllByRole("checkbox").every((checkbox) => checkbox.getAttribute("data-state") === "unchecked")).toBe(true);
  });
});
