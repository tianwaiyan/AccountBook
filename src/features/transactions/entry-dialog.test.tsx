import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReferenceData } from "@/hooks/use-reference-data";
import type { MonthlyPreset } from "@/types/recurrence";
import { currentYearMonth } from "@/utils/date";

const { transactionService, monthlyPresetService } = vi.hoisted(() => ({
  transactionService: {
    createManual: vi.fn(),
  },
  monthlyPresetService: {
    list: vi.fn(),
    generateForMonth: vi.fn(),
  },
}));

vi.mock("@/services/registry", () => ({ transactionService, monthlyPresetService }));

import { EntryDialog } from "@/features/transactions/entry-dialog";

const referenceData: ReferenceData = {
  accounts: [{ id: "account-cash", bookId: "book-default", name: "现金", sortOrder: 0, isActive: true }],
  categories: [],
  tags: [],
  months: [],
};

const preset: MonthlyPreset = {
  id: "preset-salary",
  bookId: "book-default",
  name: "工资",
  rule: { frequency: "monthly", kind: "day", day: 15 },
  entryTime: "09:00:00",
  accountId: "account-cash",
  tradeType: "income",
  amountMinor: 100_00,
  categoryId: null,
  tagId: null,
  statusCode: null,
  remark: "工资",
  counterparty: "公司",
  paymentChannel: "现金",
  defaultSelected: true,
  isActive: true,
  latestGeneratedMonth: null,
  createdAt: "2026-08-01",
  updatedAt: "2026-08-01",
  deletedAt: null,
};

describe("EntryDialog", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    monthlyPresetService.list.mockResolvedValue([preset]);
    monthlyPresetService.generateForMonth.mockResolvedValue({ generated: 1, skippedPresets: 0, emptyPresets: 0 });
  });

  it("opens with single entry and switches to preset entry in the same dialog", async () => {
    render(<EntryDialog open onOpenChange={vi.fn()} referenceData={referenceData} onSaved={vi.fn()} />);

    expect(screen.getByRole("tab", { name: "单笔记账" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("textbox", { name: "交易时间" })).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "预设记账" }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("工资")).toBeInTheDocument();
    expect(screen.getByLabelText("目标月份")).toHaveValue(currentYearMonth());
    expect(monthlyPresetService.list).toHaveBeenCalledWith("book-default");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("keeps the preset target month editable", async () => {
    render(<EntryDialog open onOpenChange={vi.fn()} referenceData={referenceData} onSaved={vi.fn()} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "预设记账" }), { button: 0, ctrlKey: false });
    await screen.findByText("工资");

    const targetMonth = screen.getByLabelText("目标月份");
    fireEvent.change(targetMonth, { target: { value: "2026-10" } });
    fireEvent.click(screen.getByRole("button", { name: "生成记账" }));

    await waitFor(() => expect(monthlyPresetService.generateForMonth).toHaveBeenCalledWith("book-default", "2026-10", [preset.id]));
  });
});
