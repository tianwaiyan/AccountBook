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

  it("uses rounded search-like borders for the five desktop text cells only", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());
    await enterEditMode();

    const desktopOccurredAtInput = screen.getAllByDisplayValue("2026-08-08 08:10:00")[0];
    const desktopRemarkInput = screen.getAllByDisplayValue("早餐")[0];
    const mobileOccurredAtInput = screen.getAllByDisplayValue("2026-08-08 08:10:00").at(-1);
    const mobileRemarkInput = screen.getAllByDisplayValue("早餐").at(-1);
    const desktopInputs = [
      desktopOccurredAtInput,
      screen.getByDisplayValue("18.50"),
      screen.getByDisplayValue("社区早餐店"),
      desktopRemarkInput,
      screen.getByDisplayValue("现金"),
    ];

    desktopInputs.forEach((input) => {
      expect(input).toHaveClass("rounded-md", "border", "border-transparent", "bg-white", "px-2", "py-1", "focus-visible:border-input", "focus-visible:ring-2", "focus-visible:ring-ring");
      expect(input).not.toHaveClass("border-input");
    });
    expect(mobileOccurredAtInput).toHaveClass("rounded-none", "border-transparent", "bg-white", "px-1");
    expect(mobileRemarkInput).toHaveClass("rounded-none", "border-transparent", "bg-white", "px-1");
  });

  it("uses the global focus ring and blue selected state for draft selects", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());
    await enterEditMode();

    const accountTrigger = screen.getAllByRole("combobox").find((element) => element.textContent?.includes("现金"));
    expect(accountTrigger).toBeTruthy();
    expect(accountTrigger).toHaveClass("focus-visible:ring-2", "focus-visible:ring-ring");

    fireEvent.pointerDown(accountTrigger as HTMLElement, { button: 0, pointerType: "mouse" });
    const listbox = await screen.findByRole("listbox");
    expect(listbox).toHaveClass("w-max", "min-w-[110px]", "max-w-[calc(100vw-1rem)]", "border-2");
    expect(listbox).not.toHaveClass("min-w-[var(--radix-select-trigger-width)]");
    expect(listbox.querySelector("[data-radix-select-viewport]")).toHaveClass("p-[6px]");
    const selectedOption = await screen.findByRole("option", { name: "现金" });
    expect(selectedOption).toHaveClass("px-[10px]", "data-[state=checked]:bg-primary/10", "data-[state=checked]:text-primary");
    expect(selectedOption.querySelector("svg")).toBeNull();
  });

  it("matches filter menu styling with draft select options", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());

    fireEvent.click(screen.getByTitle("筛选账户"));
    const menu = await screen.findByRole("menu");
    expect(menu).toHaveClass("z-[70]", "max-h-72", "w-max", "min-w-[110px]", "max-w-[calc(100vw-1rem)]", "border-2", "p-[6px]", "shadow-lg");
    expect(screen.queryByRole("button", { name: "关闭筛选菜单" })).toBeNull();

    const accountOption = screen.getByRole("checkbox", { name: "现金" });
    const optionRow = accountOption.closest("label");
    expect(optionRow).toHaveClass("h-8", "rounded-sm", "px-[10px]", "py-1", "text-sm", "font-normal");
    expect(accountOption).toHaveClass("sr-only");
    expect(optionRow?.querySelector("[data-filter-check]")).toHaveClass("text-transparent");
    expect(optionRow).not.toHaveClass("bg-primary/10", "font-medium", "text-primary");
    fireEvent.click(accountOption);
    expect(optionRow).toHaveClass("bg-primary/10", "font-medium", "text-primary");
    expect(optionRow?.querySelector("[data-filter-check]")).toHaveClass("text-primary");
  });

  it("stacks time and amount filter controls without truncation", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());

    fireEvent.click(screen.getByTitle("时间排序"));
    const timeMenu = await screen.findByRole("menu");
    const timeOptions = timeMenu.querySelector("[data-filter-options]");
    expect(timeOptions).toBeTruthy();
    expect(timeOptions).not.toHaveClass("grid-cols-2");
    expect(screen.getByRole("button", { name: "升序" })).toHaveClass("h-8", "rounded-sm", "px-[10px]", "py-1", "text-sm");
    expect(screen.getByRole("button", { name: "降序" })).toHaveClass("h-8", "rounded-sm", "px-[10px]", "py-1", "text-sm");

    fireEvent.click(screen.getByTitle("时间排序"));
    fireEvent.click(screen.getByTitle("筛选或排序金额"));
    const amountMenu = await screen.findByRole("menu");
    const amountOptions = amountMenu.querySelector("[data-filter-options]");
    expect(amountOptions).toBeTruthy();
    expect(amountOptions).not.toHaveClass("grid-cols-2");
    expect(screen.getByRole("button", { name: "金额升序" })).toHaveClass("h-8", "rounded-sm", "px-[10px]", "py-1", "text-sm");
    expect(screen.getByRole("button", { name: "金额降序" })).toHaveClass("h-8", "rounded-sm", "px-[10px]", "py-1", "text-sm");
    expect(screen.getByPlaceholderText("最低")).toHaveClass("h-8", "rounded-md", "border-transparent", "bg-white", "px-2", "py-1", "focus-visible:border-input", "focus-visible:ring-2", "focus-visible:ring-ring");
    expect(screen.getByPlaceholderText("最低")).not.toHaveClass("border-input");
    expect(screen.getByPlaceholderText("最高")).toHaveClass("h-8", "rounded-md", "border-transparent", "bg-white", "px-2", "py-1", "focus-visible:border-input", "focus-visible:ring-2", "focus-visible:ring-ring");
    expect(screen.getByPlaceholderText("最高")).not.toHaveClass("border-input");
  });

  it("keeps filter cancellation available while editing", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());
    await enterEditMode();

    const cancelFilters = screen.getByRole("button", { name: "取消筛选" });
    expect(cancelFilters).toBeDisabled();
    const amountHeader = screen.getByTitle("筛选或排序金额");
    fireEvent.click(amountHeader);
    fireEvent.change(await screen.findByPlaceholderText("最低"), { target: { value: "1" } });
    expect(cancelFilters).not.toBeDisabled();
    fireEvent.click(cancelFilters);
    expect(cancelFilters).toBeDisabled();
  });

  it("keeps the amount filter menu open while entering multiple digits", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());

    fireEvent.click(screen.getByTitle("筛选或排序金额"));
    const minimum = await screen.findByPlaceholderText("最低");
    const maximum = screen.getByPlaceholderText("最高");
    fireEvent.change(minimum, { target: { value: "12" } });
    fireEvent.change(minimum, { target: { value: "123" } });
    fireEvent.change(maximum, { target: { value: "456" } });

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("最低")).toHaveValue("123");
    expect(screen.getByPlaceholderText("最高")).toHaveValue("456");
    await waitFor(() => expect(transactionRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ amountMinMinor: 12300, amountMaxMinor: 45600 })));
  });

  it("keeps the amount filter menu mounted when a filter returns no rows", async () => {
    let resolveFilteredRows!: (rows: Transaction[]) => void;
    const filteredRows = new Promise<Transaction[]>((resolve) => { resolveFilteredRows = resolve; });
    transactionRepository.list.mockResolvedValueOnce([transaction]).mockImplementationOnce(() => filteredRows);
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByTitle("筛选或排序金额")).toBeInTheDocument());

    fireEvent.click(screen.getByTitle("筛选或排序金额"));
    fireEvent.change(await screen.findByPlaceholderText("最低"), { target: { value: "123" } });
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalledTimes(2));
    resolveFilteredRows([]);

    await waitFor(() => expect(screen.getByRole("menu")).toBeInTheDocument());
    expect(screen.getByPlaceholderText("最低")).toHaveValue("123");
  });

  it("ignores a stale filter response after a newer query completes", async () => {
    let resolveOlderQuery!: (rows: Transaction[]) => void;
    const olderQuery = new Promise<Transaction[]>((resolve) => { resolveOlderQuery = resolve; });
    transactionRepository.list
      .mockResolvedValueOnce([transaction])
      .mockImplementationOnce(() => olderQuery)
      .mockResolvedValueOnce([]);

    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTitle("筛选收支"));
    fireEvent.click(await screen.findByRole("checkbox", { name: "支出" }));
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("checkbox", { name: "收入" }));
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.queryByTitle("早餐")).not.toBeInTheDocument());

    resolveOlderQuery([transaction]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTitle("早餐")).not.toBeInTheDocument();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("offers clear sorting actions and removes the old drag handle", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());

    expect(screen.queryByLabelText("拖动调整列顺序")).toBeNull();
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    expect(transactionRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: undefined, sortDirection: undefined }));

    const timeHeader = screen.getByTitle("时间排序");
    fireEvent.click(timeHeader);
    const clearTimeSort = await screen.findByRole("button", { name: "取消排序" });
    expect(clearTimeSort).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "升序" }));
    await waitFor(() => expect(transactionRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: "occurredAt", sortDirection: "asc" })));
    const timeHeaderAfterSort = screen.getByTitle("时间排序");
    expect(timeHeaderAfterSort).toBeInTheDocument();
    const clearTimeSortAfterSort = await screen.findByRole("button", { name: "取消排序" });
    expect(clearTimeSortAfterSort).not.toBeDisabled();
    fireEvent.click(clearTimeSortAfterSort);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: undefined, sortDirection: undefined })));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.click(timeHeaderAfterSort);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    const amountHeaderAfterClear = screen.getByTitle("筛选或排序金额");
    fireEvent.click(amountHeaderAfterClear);
    const clearAmountSort = await screen.findByRole("button", { name: "取消排序" });
    expect(clearAmountSort).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "金额升序" }));
    const amountHeaderAfterSort = screen.getByTitle("筛选或排序金额");
    expect(amountHeaderAfterSort).toBeInTheDocument();
    const clearAmountSortAfterSort = await screen.findByRole("button", { name: "取消排序" });
    expect(clearAmountSortAfterSort).not.toBeDisabled();
    fireEvent.click(clearAmountSortAfterSort);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: undefined, sortDirection: undefined })));
  });

  it("applies a header filter without losing the selected value", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());

    const accountHeader = screen.getByTitle("筛选账户");
    fireEvent.click(accountHeader);
    const callsBeforeFilter = transactionRepository.list.mock.calls.length;
    const accountOption = await screen.findByRole("checkbox", { name: "现金" });
    fireEvent.click(accountOption);

    await waitFor(() => expect(transactionRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ accountIds: [account.id] })));
    expect(transactionRepository.list.mock.calls.length).toBe(callsBeforeFilter + 1);
    expect(screen.getByTitle("筛选账户")).toHaveClass("text-primary");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("uses a native checkbox click without closing the header filter", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());

    fireEvent.click(screen.getByTitle("筛选账户"));
    const accountOption = await screen.findByRole("checkbox", { name: "现金" });
    fireEvent.click(accountOption);

    await waitFor(() => expect(transactionRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ accountIds: [account.id] })));
    expect(accountOption).toBeChecked();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("keeps the native filter checkbox keyboard-focusable", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());

    fireEvent.click(screen.getByTitle("筛选账户"));
    const accountOption = await screen.findByRole("checkbox", { name: "现金" });
    accountOption.focus();
    expect(accountOption).toHaveFocus();
    fireEvent.click(accountOption);

    await waitFor(() => expect(transactionRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ accountIds: [account.id] })));
    expect(accountOption).toBeChecked();
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.click(accountOption);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ accountIds: [] })));
    expect(accountOption).not.toBeChecked();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("keeps a multi-select filter menu open across consecutive pointer clicks", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());

    fireEvent.click(screen.getByTitle("筛选收支"));
    const expenseOption = await screen.findByRole("checkbox", { name: "支出" });
    fireEvent.click(expenseOption);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ tradeTypes: ["expense"] })));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    const incomeOption = screen.getByRole("checkbox", { name: "收入" });
    fireEvent.click(incomeOption);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ tradeTypes: ["expense", "income"] })));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.click(expenseOption);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ tradeTypes: ["income"] })));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("closes the open filter only from Escape or an outside pointer", async () => {
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(transactionRepository.list).toHaveBeenCalled());

    fireEvent.click(screen.getByTitle("筛选账户"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle("筛选账户"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
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

    const timeTrigger = screen.getByTitle("时间排序");
    const amountHeader = screen.getByTitle("筛选或排序金额").closest("th");
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

    const timeTrigger = screen.getByTitle("时间排序");
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
    const timeTrigger = screen.getByTitle("时间排序");
    fireEvent.click(timeTrigger);
    expect(await screen.findByRole("button", { name: "取消排序" })).toBeInTheDocument();

    cleanup();
    vi.clearAllMocks();
    transactionRepository.list.mockResolvedValue([transaction]);
    render(<TransactionsPage referenceData={referenceData} refreshVersion={0} onChanged={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByTitle("筛选或排序金额")).toBeInTheDocument());
    const amountHeader = screen.getByTitle("筛选或排序金额").closest("th");
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
    await waitFor(() => expect(screen.getByTitle("筛选或排序金额")).toBeInTheDocument());
    const timeTrigger = screen.getByTitle("时间排序");
    const amountHeader = screen.getByTitle("筛选或排序金额").closest("th");
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
    await waitFor(() => expect(screen.getByTitle("筛选或排序金额")).toBeInTheDocument());
    const timeTrigger = screen.getByTitle("时间排序");
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
