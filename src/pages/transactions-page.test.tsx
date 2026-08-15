import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, Category, Tag, Transaction } from "@/types/domain";
import { DEFAULT_BOOK_ID } from "@/types/domain";

const { settingsRepository, transactionRepository, transactionService, monthlyPresetService } = vi.hoisted(() => ({
  settingsRepository: {
    get: vi.fn(async <T,>(_key: string, fallback: T) => fallback),
    set: vi.fn(async () => undefined),
  },
  transactionRepository: {
    list: vi.fn(async () => [] as Transaction[]),
    softDelete: vi.fn(async () => 0),
  },
  transactionService: {
    bulkUpdate: vi.fn(async () => undefined),
    createManual: vi.fn(async () => undefined),
    copy: vi.fn(async () => undefined),
  },
  monthlyPresetService: {
    list: vi.fn(async () => []),
    generateForMonth: vi.fn(async () => ({ generated: 0, skippedPresets: 0, emptyPresets: 0 })),
  },
}));

vi.mock("@/services/registry", () => ({ settingsRepository, transactionRepository, transactionService, monthlyPresetService }));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * estimateSize(), size: estimateSize(), key: String(index) })),
  }),
}));

import { TransactionsPage } from "@/pages/transactions-page";

const account: Account = { id: "account-cash", bookId: DEFAULT_BOOK_ID, name: "现金", sortOrder: 0, isActive: true };
const category: Category = { id: "cat-food", bookId: DEFAULT_BOOK_ID, kind: "expense", name: "伙食费用", systemKey: null, defaultTagId: null, sortOrder: 0, isActive: true };
const tag: Tag = { id: "tag-quality", bookId: DEFAULT_BOOK_ID, kind: "expense", name: "品质生活", sortOrder: 0, isActive: true };
const transaction: Transaction = {
  id: "transaction-1",
  bookId: DEFAULT_BOOK_ID,
  occurredAt: "2026-08-08 08:10:00",
  accountId: account.id,
  accountName: account.name,
  tradeType: "expense",
  amountMinor: -1850,
  categoryId: category.id,
  categoryName: category.name,
  categorySystemKey: null,
  tagId: tag.id,
  tagName: tag.name,
  statusCode: null,
  remark: "早餐",
  counterparty: "社区早餐店",
  paymentChannel: "现金",
  source: "manual",
  sourceCategory: null,
  importFingerprint: null,
  fingerprintVersion: null,
  createdAt: "2026-08-08T00:00:00Z",
  updatedAt: "2026-08-08T00:00:00Z",
};

const referenceData = {
  accounts: [account],
  categories: [category],
  tags: [tag],
  months: ["2026-08"],
};

describe("TransactionsPage editing", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    transactionRepository.list.mockResolvedValue([transaction]);
  });

  async function enterEditMode() {
    await waitFor(() => expect(screen.getByRole("button", { name: "修改流水" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "修改流水" }));
  }

  it("keeps a desktop text input focused while the draft changes repeatedly", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());
    await enterEditMode();

    const remarkInput = screen.getAllByDisplayValue("早餐")[0];
    remarkInput.focus();
    fireEvent.change(remarkInput, { target: { value: "早餐店" } });
    expect(remarkInput).toHaveFocus();
    fireEvent.change(remarkInput, { target: { value: "早餐店加咖啡" } });
    expect(remarkInput).toHaveFocus();
    expect(remarkInput).toHaveValue("早餐店加咖啡");
  });

  it("keeps mobile card inputs mounted while editing a draft", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());
    await enterEditMode();

    const occurredAtInputs = screen.getAllByDisplayValue("2026-08-08 08:10:00");
    const mobileOccurredAtInput = occurredAtInputs[occurredAtInputs.length - 1];
    mobileOccurredAtInput.focus();
    fireEvent.change(mobileOccurredAtInput, { target: { value: "2026-08-08 08:11:00" } });
    expect(mobileOccurredAtInput).toHaveFocus();
    fireEvent.change(mobileOccurredAtInput, { target: { value: "2026-08-08 08:12:00" } });
    expect(mobileOccurredAtInput).toHaveFocus();
    expect(mobileOccurredAtInput).toHaveValue("2026-08-08 08:12:00");
  });

  it("keeps amount text editable and rounds only when the draft is saved", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());
    await enterEditMode();

    const amountInput = screen.getAllByDisplayValue("18.50").find((element) => element instanceof HTMLInputElement && element.getAttribute("inputmode") === "decimal") as HTMLInputElement;
    expect(amountInput).toBeTruthy();
    expect(amountInput.type).toBe("text");
    expect(amountInput).not.toHaveAttribute("step");
    amountInput.focus();
    fireEvent.change(amountInput, { target: { value: "20." } });
    expect(amountInput).toHaveFocus();
    expect(amountInput).toHaveValue("20.");
    fireEvent.change(amountInput, { target: { value: "20.125" } });
    expect(amountInput).toHaveFocus();
    expect(amountInput).toHaveValue("20.125");

    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(transactionService.bulkUpdate).toHaveBeenCalledWith([
      expect.objectContaining({ id: transaction.id, input: expect.objectContaining({ amountMinor: -2013 }) }),
    ]));
  });

  it("uses the global focus ring and blue selected state for draft selects", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());
    await enterEditMode();

    const accountTrigger = screen.getAllByRole("combobox").find((element) => element.textContent?.includes("现金"));
    expect(accountTrigger).toBeTruthy();
    expect(accountTrigger).toHaveClass("focus-visible:ring-2", "focus-visible:ring-ring");

    fireEvent.pointerDown(accountTrigger as HTMLElement, { button: 0, pointerType: "mouse" });
    const selectedOption = await screen.findByRole("option", { name: "现金" });
    expect(selectedOption).toHaveClass("data-[state=checked]:bg-primary/10", "data-[state=checked]:text-primary");
    expect(selectedOption.querySelector("svg")).toBeNull();
  });

  it("keeps filter cancellation available while editing", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());
    await enterEditMode();

    const cancelFilters = screen.getByRole("button", { name: "取消筛选" });
    expect(cancelFilters).toBeDisabled();
    const amountHeader = screen.getByRole("button", { name: "金额" });
    fireEvent.pointerDown(amountHeader, { button: 0, pointerType: "mouse" });
    fireEvent.change(await screen.findByPlaceholderText("最低"), { target: { value: "1" } });
    expect(cancelFilters).not.toBeDisabled();
    fireEvent.click(cancelFilters);
    expect(cancelFilters).toBeDisabled();
  });

  it("offers clear sorting actions and removes the old drag handle", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());

    expect(screen.queryByLabelText("拖动调整列顺序")).toBeNull();
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    expect(transactionRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: undefined, sortDirection: undefined }));

    const timeHeader = screen.getByRole("button", { name: "时间" });
    fireEvent.pointerDown(timeHeader, { button: 0, pointerType: "mouse" });
    const clearTimeSort = await screen.findByText("取消排序");
    expect(clearTimeSort).toHaveAttribute("data-disabled");
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "升序" }));
    await waitFor(() => expect(transactionRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: "occurredAt", sortDirection: "asc" })));
    const timeHeaderAfterSort = screen.getByRole("button", { name: "时间" });
    fireEvent.pointerDown(timeHeaderAfterSort, { button: 0, pointerType: "mouse" });
    const clearTimeSortAfterSort = await screen.findByText("取消排序");
    expect(clearTimeSortAfterSort).not.toHaveAttribute("data-disabled");
    fireEvent.click(clearTimeSortAfterSort);
    await waitFor(() => expect(screen.queryByText("取消排序")).not.toBeInTheDocument());

    const amountHeaderAfterClear = screen.getByRole("button", { name: "金额" });
    fireEvent.pointerDown(amountHeaderAfterClear, { button: 0, pointerType: "mouse" });
    const clearAmountSort = await screen.findByText("取消排序");
    expect(clearAmountSort).toHaveAttribute("data-disabled");
    fireEvent.click(screen.getByRole("button", { name: "金额升序" }));
    const amountHeaderAfterSort = screen.getByRole("button", { name: "金额" });
    fireEvent.pointerDown(amountHeaderAfterSort, { button: 0, pointerType: "mouse" });
    expect(await screen.findByText("取消排序")).not.toHaveAttribute("data-disabled");
  });

  it("applies a header filter without losing the selected value", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());

    const accountHeader = screen.getByTitle("筛选账户");
    fireEvent.pointerDown(accountHeader, { button: 0, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "现金" }));

    await waitFor(() => expect(transactionRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ accountIds: [account.id] })));
    expect(screen.getByTitle("筛选账户")).toHaveClass("text-primary");
  });

  it("keeps table rows compact and provides full text on hover", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());

    const desktopRemark = screen.getByTitle("早餐");
    expect(desktopRemark).toHaveClass("truncate");
    expect(desktopRemark.closest("td")).toHaveClass("h-9");
    expect(screen.getAllByTitle("社区早餐店").some((element) => element.classList.contains("line-clamp-2"))).toBe(true);
  });

  it("reorders a header after a 450ms long press from the header surface", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());

    const timeTrigger = screen.getByRole("button", { name: "时间" });
    const amountHeader = screen.getByRole("button", { name: "金额" }).closest("th");
    const timeHeader = timeTrigger.closest("th");
    expect(timeHeader).toBeTruthy();
    expect(amountHeader).toBeTruthy();
    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn(() => amountHeader as HTMLElement);
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(timeHeader as HTMLElement, { button: 0, pointerType: "mouse", pointerId: 7, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(document, { pointerId: 7, clientX: 100, clientY: 10 });
      await act(async () => { vi.advanceTimersByTime(449); });
      expect(timeHeader).not.toHaveAttribute("aria-grabbed", "true");
      expect(timeHeader).not.toHaveAttribute("data-column-dragging");
      expect(amountHeader).not.toHaveAttribute("data-column-drop-target");
      await act(async () => { vi.advanceTimersByTime(1); });
      expect(timeHeader).toHaveAttribute("aria-grabbed", "true");
      expect(timeHeader).toHaveAttribute("data-column-dragging", "true");
      expect(timeHeader).toHaveClass("pointer-events-none", "opacity-70");
      expect(timeHeader?.style.transform).toBe("translate3d(90px, 0px, 0)");
      expect(amountHeader).toHaveAttribute("data-column-drop-target", "true");
      expect(amountHeader?.querySelector("[data-column-drag-indicator]")).toBeTruthy();
      expect(screen.queryByText("取消排序")).not.toBeInTheDocument();
      await act(async () => { fireEvent.pointerUp(document, { pointerId: 7, clientX: 100, clientY: 10 }); });
      expect(timeHeader).not.toHaveAttribute("data-column-dragging");
      expect(timeHeader?.style.transform).toBe("");
      expect(amountHeader).not.toHaveAttribute("data-column-drop-target");
      expect(amountHeader?.querySelector("[data-column-drag-indicator]")).toBeNull();
      expect(settingsRepository.set).toHaveBeenCalledWith("transaction_column_order", ["select", "account", "tradeType", "occurredAt", "amount", "category", "tag", "status", "counterparty", "remark", "paymentChannel"]);
    } finally {
      document.elementFromPoint = originalElementFromPoint;
      vi.useRealTimers();
    }
  });

  it("does not let a menu trigger start a column drag", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());

    const timeTrigger = screen.getByRole("button", { name: "时间" });
    const timeHeader = timeTrigger.closest("th");
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(timeTrigger, { button: 0, pointerType: "mouse", pointerId: 12, clientX: 10, clientY: 10 });
      await act(async () => { vi.advanceTimersByTime(500); });
      expect(timeHeader).not.toHaveAttribute("data-column-dragging");
      fireEvent.pointerUp(timeTrigger, { pointerId: 12 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a short press opening the menu and ignores the resize handle", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());
    const timeTrigger = screen.getByRole("button", { name: "时间" });
    fireEvent.pointerDown(timeTrigger, { button: 0, pointerType: "mouse", pointerId: 8 });
    expect(await screen.findByText("取消排序")).toBeInTheDocument();

    cleanup();
    vi.clearAllMocks();
    transactionRepository.list.mockResolvedValue([transaction]);
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "金额" })).toBeInTheDocument());
    const amountHeader = screen.getByRole("button", { name: "金额" }).closest("th");
    const resizeHandle = amountHeader?.querySelector("[data-column-resize]");
    expect(resizeHandle).toBeTruthy();
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(resizeHandle as HTMLElement, { button: 0, pointerType: "mouse", pointerId: 9 });
      await act(async () => { vi.advanceTimersByTime(500); });
      fireEvent.pointerUp(resizeHandle as HTMLElement, { pointerId: 9 });
      expect(settingsRepository.set).not.toHaveBeenCalledWith("transaction_column_order", expect.anything());
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a pending header drag without changing the saved order", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "金额" })).toBeInTheDocument());
    const timeTrigger = screen.getByRole("button", { name: "时间" });
    const amountHeader = screen.getByRole("button", { name: "金额" }).closest("th");
    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn(() => amountHeader as HTMLElement);
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(timeTrigger, { button: 0, pointerType: "mouse", pointerId: 10 });
      fireEvent.pointerCancel(document, { pointerId: 10 });
      await act(async () => { vi.advanceTimersByTime(500); });
      expect(settingsRepository.set).not.toHaveBeenCalledWith("transaction_column_order", expect.anything());
      expect(timeTrigger.closest("th")).not.toHaveAttribute("aria-grabbed", "true");
    } finally {
      document.elementFromPoint = originalElementFromPoint;
      vi.useRealTimers();
    }
  });

  it("cleans up a captured pointer when the header loses capture", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "金额" })).toBeInTheDocument());
    const timeTrigger = screen.getByRole("button", { name: "时间" });
    const timeHeader = timeTrigger.closest("th");
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(timeHeader as HTMLElement, { button: 0, pointerType: "mouse", pointerId: 11 });
      await act(async () => { vi.advanceTimersByTime(450); });
      expect(timeHeader).toHaveAttribute("data-column-dragging", "true");
      fireEvent.lostPointerCapture(timeHeader as HTMLElement, { pointerId: 11 });
      await act(async () => { vi.advanceTimersByTime(500); });
      expect(timeHeader).not.toHaveAttribute("aria-grabbed", "true");
      expect(timeHeader).not.toHaveAttribute("data-column-dragging");
      expect(timeHeader?.style.transform).toBe("");
      expect(settingsRepository.set).not.toHaveBeenCalledWith("transaction_column_order", expect.anything());
    } finally {
      vi.useRealTimers();
    }
  });
});
