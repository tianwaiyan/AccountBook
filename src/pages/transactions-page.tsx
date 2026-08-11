import {
  type ColumnDef,
  type ColumnOrderState,
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Copy,
  ChevronDown,
  Edit3,
  Filter,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { createContext, memo, useCallback, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState, LoadingState } from "@/components/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReferenceData } from "@/hooks/use-reference-data";
import { settingsRepository, transactionRepository, transactionService } from "@/services/registry";
import type { Category, StatusCode, Transaction, TransactionFilters, TransactionInput, TradeType } from "@/types/domain";
import { DEFAULT_BOOK_ID, statusLabels, tradeTypeLabels } from "@/types/domain";
import { currentYearMonth, formatTransactionDisplayDateTime, type TransactionDateDisplay } from "@/utils/date";
import { cn } from "@/utils/cn";
import { formatMoney, signedMinor } from "@/utils/money";

const DEFAULT_COLUMN_ORDER = ["select", "occurredAt", "account", "tradeType", "amount", "category", "tag", "status", "counterparty", "remark", "paymentChannel"];
const DESKTOP_TRANSACTION_ROW_HEIGHT = 36;

const STATUS_BY_SYSTEM: Record<string, StatusCode[]> = {
  public_expense: ["pending_reimbursement", "settled"],
  reimbursement: ["settled"],
  pass_through_income: ["pending_transfer", "transferred"],
  pass_through_expense: ["transferred"],
};

const DEFAULT_STATUS: Record<string, StatusCode> = {
  public_expense: "pending_reimbursement",
  reimbursement: "settled",
  pass_through_income: "pending_transfer",
  pass_through_expense: "transferred",
};

export function TransactionsPage({
  referenceData,
  refreshVersion,
  onChanged,
  onDirtyChange,
}: {
  referenceData: ReferenceData;
  refreshVersion: number;
  onChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const initialMonth = referenceData.months.includes(currentYearMonth()) ? currentYearMonth() : referenceData.months[0] ?? currentYearMonth();
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [keyword, setKeyword] = useState("");
  const deferredKeyword = useDeferredValue(keyword.trim());
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [tradeTypes, setTradeTypes] = useState<TradeType[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<Array<StatusCode | "blank">>([]);
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [sort, setSort] = useState<{ by: "occurredAt" | "amount" | null; direction: "asc" | "desc" }>({ by: null, direction: "desc" });
  const [rows, setRows] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [drafts, setDrafts] = useState<Map<string, Transaction>>(new Map());
  const [amountTexts, setAmountTexts] = useState<Map<string, string>>(new Map());
  const [baselines, setBaselines] = useState<Map<string, Transaction>>(new Map());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [newDraftIds, setNewDraftIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(DEFAULT_COLUMN_ORDER);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [dateDisplay, setDateDisplay] = useState<TransactionDateDisplay>("full");
  const [columnPreferencesReady, setColumnPreferencesReady] = useState(false);
  const draftsRef = useRef(drafts);
  const amountTextsRef = useRef(amountTexts);
  draftsRef.current = drafts;
  amountTextsRef.current = amountTexts;

  const dirty = editMode && (deletedIds.size > 0 || newDraftIds.size > 0 || [...drafts].some(([id, draft]) => {
    const baseline = baselines.get(id);
    const amountText = amountTexts.get(id) ?? formatDraftAmount(baseline?.amountMinor ?? draft.amountMinor);
    return baseline && (transactionSignature(draft) !== transactionSignature(baseline) || amountText !== formatDraftAmount(baseline.amountMinor));
  }));
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  useEffect(() => {
    void Promise.all([
      settingsRepository.get<ColumnOrderState>("transaction_column_order", DEFAULT_COLUMN_ORDER),
      settingsRepository.get<ColumnSizingState>("transaction_column_sizing", {}),
      settingsRepository.get<TransactionDateDisplay>("transaction_date_display", "full"),
    ]).then(([order, sizing, display]) => {
      setColumnOrder(order);
      setColumnSizing(sizing);
      setDateDisplay(display);
      setColumnPreferencesReady(true);
    });
  }, []);

  useEffect(() => {
    if (!columnPreferencesReady) return;
    const timer = window.setTimeout(() => {
      void settingsRepository.set("transaction_column_sizing", columnSizing);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [columnPreferencesReady, columnSizing]);

  const filters = useMemo<TransactionFilters>(() => ({
    bookId: DEFAULT_BOOK_ID,
    yearMonth: selectedMonth,
    keyword: deferredKeyword,
    accountIds,
    tradeTypes,
    categoryIds,
    tagIds,
    statuses,
    amountMinMinor: amountMin ? Math.round(Number(amountMin) * 100) : undefined,
    amountMaxMinor: amountMax ? Math.round(Number(amountMax) * 100) : undefined,
    sortBy: sort.by ?? undefined,
    sortDirection: sort.by ? sort.direction : undefined,
  }), [selectedMonth, deferredKeyword, accountIds, tradeTypes, categoryIds, tagIds, statuses, amountMin, amountMax, sort]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    transactionRepository.list(filters).then((result) => {
      if (!active) return;
      setRows(result);
      if (editMode) {
        setBaselines((current) => mergeTransactions(current, result));
        setDrafts((current) => mergeTransactions(current, result));
        setAmountTexts((current) => {
          const next = new Map(current);
          result.forEach((row) => { if (!next.has(row.id)) next.set(row.id, formatDraftAmount(row.amountMinor)); });
          return next;
        });
      }
      setError(null);
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : String(reason))).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [filters, refreshVersion, editMode]);

  const visibleRows = useMemo(() => rows.filter((row) => !deletedIds.has(row.id)), [rows, deletedIds]);

  const beginEdit = () => {
    setBaselines((current) => mergeTransactions(current, rows));
    setDrafts((current) => mergeTransactions(current, rows));
    setAmountTexts(new Map(rows.map((row) => [row.id, formatDraftAmount(row.amountMinor)])));
    setEditMode(true);
    setNotice("整表草稿已开启");
  };

  const cancelEdit = () => {
    setEditMode(false);
    setDrafts(new Map());
    setAmountTexts(new Map());
    setBaselines(new Map());
    setDeletedIds(new Set());
    setNewDraftIds(new Set());
    setSelectedIds(new Set());
    setNotice("已放弃草稿");
  };

  const saveEdit = async () => {
    try {
      const updates: Array<{ id: string; input: TransactionInput }> = [];
      for (const [id, draft] of drafts) {
        if (newDraftIds.has(id) || deletedIds.has(id)) continue;
        const baseline = baselines.get(id);
        const materialized = materializeDraftAmount(id, draft, amountTextsRef.current);
        if (baseline && transactionSignature(materialized) !== transactionSignature(baseline)) updates.push({ id, input: toInput(materialized) });
      }
      await transactionService.bulkUpdate(updates);
      for (const id of newDraftIds) {
        const draft = drafts.get(id);
        if (draft && !deletedIds.has(id)) {
          const materialized = materializeDraftAmount(id, draft, amountTextsRef.current);
          await transactionService.createManual(DEFAULT_BOOK_ID, toInput(materialized));
        }
      }
      if (deletedIds.size) await transactionRepository.softDelete([...deletedIds].filter((id) => !newDraftIds.has(id)));
      const message = `已保存 ${updates.length} 条修改，新增 ${[...newDraftIds].filter((id) => !deletedIds.has(id)).length} 条，删除 ${deletedIds.size} 条`;
      cancelEdit();
      setNotice(message);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const deleteSelected = async () => {
    if (editMode) {
      setDeletedIds((current) => new Set([...current, ...selectedIds]));
      setSelectedIds(new Set());
      return;
    }
    const deleted = await transactionRepository.softDelete([...selectedIds]);
    setSelectedIds(new Set());
    setNotice(`已删除 ${deleted} 条流水`);
    onChanged();
  };

  const copySelected = async () => {
    const sourceRow = visibleRows.find((row) => selectedIds.has(row.id));
    const source = sourceRow && editMode ? draftsRef.current.get(sourceRow.id) ?? sourceRow : sourceRow;
    if (!source || selectedIds.size !== 1) return;
    if (editMode) {
      const id = `draft-${crypto.randomUUID()}`;
      const copied = { ...source, id, source: "copy" as const, importFingerprint: null };
      setDrafts((current) => new Map(current).set(id, copied));
      setAmountTexts((current) => new Map(current).set(id, amountTextsRef.current.get(source.id) ?? formatDraftAmount(source.amountMinor)));
      setRows((current) => [copied, ...current]);
      setNewDraftIds((current) => new Set(current).add(id));
      setSelectedIds(new Set([id]));
    } else {
      await transactionService.copy(DEFAULT_BOOK_ID, source);
      setNotice("已复制 1 条流水");
      onChanged();
    }
  };

  const updateDraft = (id: string, patch: Partial<Transaction>) => {
    setDrafts((current) => {
      const next = new Map(current);
      const row = next.get(id);
      if (row) next.set(id, normalizeDraft({ ...row, ...patch }, referenceData));
      return next;
    });
  };

  const columns = useMemo<ColumnDef<Transaction>[]>(() => [
    { id: "select", size: 44, header: ({ table }) => { const tableRows = table.getRowModel().rows; return <Checkbox checked={tableRows.length > 0 && selectedIds.size === tableRows.length} onCheckedChange={(checked) => setSelectedIds(checked ? new Set(tableRows.map((row) => row.original.id)) : new Set())} />; }, cell: ({ row }) => <Checkbox checked={selectedIds.has(row.original.id)} onCheckedChange={(checked) => setSelectedIds((current) => { const next = new Set(current); checked ? next.add(row.original.id) : next.delete(row.original.id); return next; })} /> },
    { id: "occurredAt", accessorKey: "occurredAt", header: () => <SortMenu label="时间" active={sort.by === "occurredAt"} direction={sort.direction} onSort={(direction) => setSort({ by: "occurredAt", direction })} onClearSort={() => setSort({ by: null, direction: "desc" })} />, size: 168, cell: ({ row }) => { const current = editMode ? draftsRef.current.get(row.original.id) ?? row.original : row.original; return editMode ? <CellInput value={current.occurredAt} onChange={(value) => updateDraft(row.original.id, { occurredAt: value })} /> : <CellText value={formatTransactionDisplayDateTime(current.occurredAt, dateDisplay)} className="tabular-nums" />; } },
    { id: "account", accessorKey: "accountName", header: "账户", size: 112, cell: ({ row }) => { const current = editMode ? draftsRef.current.get(row.original.id) ?? row.original : row.original; return editMode ? <CellSelect value={current.accountId} options={referenceData.accounts.map((item) => ({ value: item.id, label: item.name }))} onChange={(value) => { const account = referenceData.accounts.find((item) => item.id === value); updateDraft(row.original.id, { accountId: value, accountName: account?.name ?? "" }); }} /> : <CellText value={current.accountName} />; } },
    { id: "tradeType", accessorKey: "tradeType", header: "收支", size: 86, cell: ({ row }) => { const current = editMode ? draftsRef.current.get(row.original.id) ?? row.original : row.original; return editMode ? <CellSelect value={current.tradeType} options={Object.entries(tradeTypeLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => updateDraft(row.original.id, { tradeType: value as TradeType, categoryId: null, categoryName: null, categorySystemKey: null, tagId: null, tagName: null, statusCode: null })} /> : <Badge tone={current.tradeType === "income" ? "income" : current.tradeType === "expense" ? "expense" : "neutral"}>{tradeTypeLabels[current.tradeType]}</Badge>; } },
    { id: "amount", accessorKey: "amountMinor", header: () => <AmountHeaderFilter minimum={amountMin} maximum={amountMax} setMinimum={setAmountMin} setMaximum={setAmountMax} sort={sort} setSort={setSort} onClearSort={() => setSort({ by: null, direction: "desc" })} />, size: 108, cell: ({ row }) => { const current = editMode ? draftsRef.current.get(row.original.id) ?? row.original : row.original; return editMode ? <CellInput type="text" inputMode="decimal" value={amountTextsRef.current.get(row.original.id) ?? formatDraftAmount(current.amountMinor)} onChange={(value) => setAmountTexts((currentTexts) => new Map(currentTexts).set(row.original.id, value))} /> : <span className={cn("font-medium tabular-nums", current.tradeType === "income" ? "text-emerald-600" : current.tradeType === "expense" ? "text-rose-600" : "text-blue-600")}>{current.tradeType === "expense" ? "-" : "+"}{formatMoney(current.amountMinor)}</span>; } },
    { id: "category", accessorKey: "categoryName", header: "分类", size: 130, cell: ({ row }) => { const current = editMode ? draftsRef.current.get(row.original.id) ?? row.original : row.original; return editMode ? <CellSelect allowBlank value={current.categoryId ?? ""} options={categoriesFor(current.tradeType, referenceData).map((item) => ({ value: item.id, label: item.name }))} onChange={(value) => { const category = referenceData.categories.find((item) => item.id === value); updateDraft(row.original.id, { categoryId: value || null, categoryName: category?.name ?? null, categorySystemKey: category?.systemKey ?? null, tagId: category?.systemKey ? null : category?.defaultTagId ?? null, tagName: referenceData.tags.find((tag) => tag.id === category?.defaultTagId)?.name ?? null, statusCode: category?.systemKey ? DEFAULT_STATUS[category.systemKey] ?? null : null }); }} /> : current.categoryName ? <CellText value={current.categoryName} /> : <Badge tone="warning">待分类</Badge>; } },
    { id: "tag", accessorKey: "tagName", header: "标签", size: 118, cell: ({ row }) => { const current = editMode ? draftsRef.current.get(row.original.id) ?? row.original : row.original; return editMode ? <CellSelect allowBlank disabled={Boolean(current.categorySystemKey)} value={current.tagId ?? ""} options={tagsFor(current.tradeType, referenceData).map((item) => ({ value: item.id, label: item.name }))} onChange={(value) => { const tag = referenceData.tags.find((item) => item.id === value); updateDraft(row.original.id, { tagId: value || null, tagName: tag?.name ?? null }); }} /> : <CellText value={current.tagName} />; } },
    { id: "status", accessorKey: "statusCode", header: "状态", size: 108, cell: ({ row }) => { const current = editMode ? draftsRef.current.get(row.original.id) ?? row.original : row.original; return editMode ? <CellSelect allowBlank disabled={!current.categorySystemKey} value={current.statusCode ?? ""} options={(current.categorySystemKey ? STATUS_BY_SYSTEM[current.categorySystemKey] ?? [] : []).map((value) => ({ value, label: statusLabels[value] }))} onChange={(value) => updateDraft(row.original.id, { statusCode: (value || null) as StatusCode | null })} /> : current.statusCode ? <Badge tone={current.statusCode.startsWith("pending") ? "warning" : "income"}>{statusLabels[current.statusCode]}</Badge> : ""; } },
    { id: "counterparty", accessorKey: "counterparty", header: "交易对方", size: 140, cell: ({ row }) => { const current = editMode ? draftsRef.current.get(row.original.id) ?? row.original : row.original; return editMode ? <CellInput value={current.counterparty} onChange={(value) => updateDraft(row.original.id, { counterparty: value })} /> : <CellText value={current.counterparty} />; } },
    { id: "remark", accessorKey: "remark", header: "备注", size: 190, cell: ({ row }) => { const current = editMode ? draftsRef.current.get(row.original.id) ?? row.original : row.original; return editMode ? <CellInput value={current.remark} onChange={(value) => updateDraft(row.original.id, { remark: value })} /> : <CellText value={current.remark} />; } },
    { id: "paymentChannel", accessorKey: "paymentChannel", header: "支付方式", size: 130, cell: ({ row }) => { const current = editMode ? draftsRef.current.get(row.original.id) ?? row.original : row.original; return editMode ? <CellInput value={current.paymentChannel} onChange={(value) => updateDraft(row.original.id, { paymentChannel: value })} /> : <CellText value={current.paymentChannel} />; } },
  ], [selectedIds, editMode, referenceData, sort, amountMin, amountMax, dateDisplay]);

  const headerFilters: Record<string, React.ReactNode> = {
    account: <HeaderMultiFilter label="账户" values={accountIds} options={referenceData.accounts.map((item) => ({ value: item.id, label: item.name }))} onChange={setAccountIds} />,
    tradeType: <HeaderMultiFilter label="收支" values={tradeTypes} options={(Object.entries(tradeTypeLabels) as Array<[TradeType, string]>).map(([value, label]) => ({ value, label }))} onChange={(values) => setTradeTypes(values as TradeType[])} />,
    amount: null,
    category: <HeaderMultiFilter label="分类" values={categoryIds} options={referenceData.categories.map((item) => ({ value: item.id, label: item.name }))} onChange={setCategoryIds} />,
    tag: <HeaderMultiFilter label="标签" values={tagIds} options={referenceData.tags.map((item) => ({ value: item.id, label: item.name }))} onChange={setTagIds} />,
    status: <HeaderMultiFilter label="状态" values={statuses} options={[{ value: "blank", label: "空白" }, ...(Object.entries(statusLabels) as Array<[StatusCode, string]>).map(([value, label]) => ({ value, label }))]} onChange={(values) => setStatuses(values as Array<StatusCode | "blank">)} />,
  };

  const clearColumnFilters = () => {
    setAccountIds([]);
    setTradeTypes([]);
    setCategoryIds([]);
    setTagIds([]);
    setStatuses([]);
    setAmountMin("");
    setAmountMax("");
    setSort({ by: null, direction: "desc" });
  };

  const hasActiveTableQuery = Boolean(accountIds.length || tradeTypes.length || categoryIds.length || tagIds.length || statuses.length || amountMin || amountMax || sort.by);

  const table = useReactTable({ data: visibleRows, columns, getRowId: (row) => row.id, state: { columnOrder, columnSizing }, onColumnOrderChange: (updater) => setColumnOrder((current) => { const next = typeof updater === "function" ? updater(current) : updater; void settingsRepository.set("transaction_column_order", next); return next; }), onColumnSizingChange: setColumnSizing, columnResizeMode: "onChange", getCoreRowModel: getCoreRowModel() });
  const getEditableRow = (row: Transaction) => editMode ? draftsRef.current.get(row.id) ?? row : row;

  if (error) return <ErrorState message={error} />;
  return <div className="space-y-4">
    <TransactionToolbar selectedMonth={selectedMonth} onMonthChange={(month: string) => { setSelectedMonth(month); setKeyword(""); clearColumnFilters(); }} months={referenceData.months} keyword={keyword} onKeywordChange={setKeyword} />
    <MobileTransactionFilters referenceData={referenceData} filters={{ accountIds, tradeTypes, categoryIds, tagIds, statuses }} setters={{ setAccountIds, setTradeTypes, setCategoryIds, setTagIds, setStatuses }} amountMin={amountMin} amountMax={amountMax} setAmountMin={setAmountMin} setAmountMax={setAmountMax} onClear={clearColumnFilters} />
    <div className="flex min-h-9 flex-wrap items-center gap-2">
      {!editMode ? <Button variant="outline" onClick={beginEdit} disabled={!rows.length}><Edit3 className="size-4" />修改流水</Button> : <><Button onClick={saveEdit}><Save className="size-4" />保存修改</Button><Button variant="outline" onClick={cancelEdit}><X className="size-4" />取消</Button><Button variant="outline" onClick={() => setBatchOpen(true)} disabled={!selectedIds.size}><SlidersHorizontal className="size-4" />批量修改</Button></>}
      <Button variant="outline" onClick={clearColumnFilters} disabled={!hasActiveTableQuery}><RotateCcw className="size-4" />取消筛选</Button>
      <Button variant="outline" onClick={copySelected} disabled={selectedIds.size !== 1}><Copy className="size-4" />复制</Button>
      <Button variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={!selectedIds.size}><Trash2 className="size-4" />删除</Button>
      <span className="ml-auto text-xs text-muted-foreground">{deferredKeyword ? "全库" : selectedMonth} · {visibleRows.length} 条{selectedIds.size ? ` · 已选 ${selectedIds.size}` : ""}</span>
    </div>
    {notice && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}
    {loading && rows.length === 0 ? <LoadingState label="正在读取流水" /> : <><DesktopTransactionGrid table={table} editMode={editMode} selectedIds={selectedIds} setColumnOrder={setColumnOrder} headerFilters={headerFilters} /><MobileTransactionCards rows={visibleRows} getEditableRow={getEditableRow} selectedIds={selectedIds} setSelectedIds={setSelectedIds} editMode={editMode} referenceData={referenceData} updateDraft={updateDraft} dateDisplay={dateDisplay} /></>}
    <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={editMode ? "从草稿移除流水" : "删除流水"} description={editMode ? "删除将在保存整表修改后写入数据库。" : `确定删除已选择的 ${selectedIds.size} 条流水吗？`} confirmLabel="删除" destructive onConfirm={deleteSelected} />
    <BatchDialog open={batchOpen} onOpenChange={setBatchOpen} selectedIds={selectedIds} drafts={drafts} referenceData={referenceData} setDrafts={setDrafts} />
  </div>;
}

function TransactionToolbar({ selectedMonth, onMonthChange, months, keyword, onKeywordChange }: { selectedMonth: string; onMonthChange: (month: string) => void; months: string[]; keyword: string; onKeywordChange: (keyword: string) => void }) {
  const year = selectedMonth.slice(0, 4);
  const years = [...new Set(months.map((month) => month.slice(0, 4)))];
  return <div className="space-y-2"><div className="flex gap-2 overflow-x-auto pb-1"><select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={year} onChange={(event) => { const latest = months.find((month) => month.startsWith(event.target.value)); if (latest) onMonthChange(latest); }}>{years.map((item) => <option key={item} value={item}>{item}年</option>)}</select>{Array.from({ length: 12 }, (_, index) => { const month = `${year}-${String(index + 1).padStart(2, "0")}`; return <Button key={month} size="sm" variant={selectedMonth === month ? "default" : "outline"} disabled={months.length > 0 && !months.includes(month)} onClick={() => onMonthChange(month)}>{index + 1}月</Button>; })}</div><div className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" value={keyword} onChange={(event) => onKeywordChange(event.target.value)} placeholder="搜索备注、分类、对方；支持 AND / OR" /></div></div>;
}

function MobileTransactionFilters({ referenceData, filters, setters, amountMin, amountMax, setAmountMin, setAmountMax, onClear }: { referenceData: ReferenceData; filters: { accountIds: string[]; tradeTypes: TradeType[]; categoryIds: string[]; tagIds: string[]; statuses: Array<StatusCode | "blank"> }; setters: { setAccountIds: (values: string[]) => void; setTradeTypes: (values: TradeType[]) => void; setCategoryIds: (values: string[]) => void; setTagIds: (values: string[]) => void; setStatuses: (values: Array<StatusCode | "blank">) => void }; amountMin: string; amountMax: string; setAmountMin: (value: string) => void; setAmountMax: (value: string) => void; onClear: () => void }) {
  const tradeTypeOptions = (Object.entries(tradeTypeLabels) as Array<[TradeType, string]>).map(([value, label]) => ({ value, label }));
  const statusOptions = (Object.entries(statusLabels) as Array<[StatusCode, string]>).map(([value, label]) => ({ value, label }));
  return <div className="flex flex-wrap gap-2 md:hidden"><MultiFilter label="账户" values={filters.accountIds} options={referenceData.accounts.map((item) => ({ value: item.id, label: item.name }))} onChange={setters.setAccountIds} /><MultiFilter label="收支" values={filters.tradeTypes} options={tradeTypeOptions} onChange={(values) => setters.setTradeTypes(values as TradeType[])} /><MultiFilter label="分类" values={filters.categoryIds} options={referenceData.categories.map((item) => ({ value: item.id, label: item.name }))} onChange={setters.setCategoryIds} /><MultiFilter label="标签" values={filters.tagIds} options={referenceData.tags.map((item) => ({ value: item.id, label: item.name }))} onChange={setters.setTagIds} /><MultiFilter label="状态" values={filters.statuses} options={[{ value: "blank", label: "空白" }, ...statusOptions]} onChange={(values) => setters.setStatuses(values as Array<StatusCode | "blank">)} /><Input className="w-28" value={amountMin} onChange={(event) => setAmountMin(event.target.value)} type="text" inputMode="decimal" placeholder="最低金额" /><Input className="w-28" value={amountMax} onChange={(event) => setAmountMax(event.target.value)} type="text" inputMode="decimal" placeholder="最高金额" /><Button variant="ghost" size="icon" title="清除筛选" aria-label="清除筛选" onClick={onClear}><RotateCcw className="size-4" /></Button></div>;
}

function MultiFilter({ label, values, options, onChange }: { label: string; values: string[]; options: Array<{ value: string; label: string }>; onChange: (values: string[]) => void }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline"><Filter className="size-4" />{label}{values.length ? ` ${values.length}` : ""}</Button></DropdownMenuTrigger><DropdownMenuContent>{options.map((option) => <DropdownMenuCheckboxItem key={option.value} checked={values.includes(option.value)} onCheckedChange={(checked) => onChange(checked ? [...values, option.value] : values.filter((value) => value !== option.value))}>{option.label}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu>;
}

type HeaderDragContextValue = {
  registerMenuCloser: (closer: () => void) => () => void;
};

const HeaderDragContext = createContext<HeaderDragContextValue | null>(null);

function useHeaderMenu() {
  const dragContext = useContext(HeaderDragContext);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => dragContext?.registerMenuCloser(close), [dragContext, close]);

  return { open, onOpenChange: setOpen };
}

function HeaderMultiFilter({ label, values, options, onChange }: { label: string; values: string[]; options: Array<{ value: string; label: string }>; onChange: (values: string[]) => void }) {
  const { open, onOpenChange } = useHeaderMenu();
  return <DropdownMenu open={open} onOpenChange={onOpenChange}><DropdownMenuTrigger asChild><button data-header-menu-trigger className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", values.length && "text-primary")} title={`筛选${label}`}><span>{label}</span><ChevronDown className="size-3" /></button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">{options.map((option) => <DropdownMenuCheckboxItem key={option.value} checked={values.includes(option.value)} onCheckedChange={(checked) => onChange(checked ? [...values, option.value] : values.filter((value) => value !== option.value))}>{option.label}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu>;
}

function SortMenu({ label, active, direction, onSort, onClearSort }: { label: string; active: boolean; direction: "asc" | "desc"; onSort: (direction: "asc" | "desc") => void; onClearSort: () => void }) {
  const { open, onOpenChange } = useHeaderMenu();
  return <DropdownMenu open={open} onOpenChange={onOpenChange}><DropdownMenuTrigger asChild><button data-header-menu-trigger className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", active && "text-primary")} title={`${label}排序`}><span>{label}</span><ChevronDown className="size-3" /></button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuCheckboxItem checked={active && direction === "asc"} onCheckedChange={() => onSort("asc")}>升序</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem checked={active && direction === "desc"} onCheckedChange={() => onSort("desc")}>降序</DropdownMenuCheckboxItem><DropdownMenuItem disabled={!active} onSelect={onClearSort} className="flex h-8 select-none items-center rounded-sm px-2 text-sm outline-none transition-colors focus:bg-primary/5 focus:text-primary data-[highlighted]:bg-primary/5 data-[highlighted]:text-primary data-[disabled]:opacity-50">取消排序</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}

function AmountHeaderFilter({ minimum, maximum, setMinimum, setMaximum, sort, setSort, onClearSort }: { minimum: string; maximum: string; setMinimum: (value: string) => void; setMaximum: (value: string) => void; sort: { by: "occurredAt" | "amount" | null; direction: "asc" | "desc" }; setSort: (value: { by: "occurredAt" | "amount" | null; direction: "asc" | "desc" }) => void; onClearSort: () => void }) {
  const { open, onOpenChange } = useHeaderMenu();
  const active = Boolean(minimum || maximum);
  return <DropdownMenu open={open} onOpenChange={onOpenChange}><DropdownMenuTrigger asChild><button data-header-menu-trigger className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", (active || sort.by === "amount") && "text-primary")} title="筛选或排序金额"><span>金额</span><ChevronDown className="size-3" /></button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-60 space-y-2 p-3"><div className="grid grid-cols-2 gap-1"><Button size="sm" variant={sort.by === "amount" && sort.direction === "asc" ? "default" : "outline"} onClick={() => setSort({ by: "amount", direction: "asc" })}>金额升序</Button><Button size="sm" variant={sort.by === "amount" && sort.direction === "desc" ? "default" : "outline"} onClick={() => setSort({ by: "amount", direction: "desc" })}>金额降序</Button></div><DropdownMenuItem disabled={sort.by !== "amount"} onSelect={onClearSort} className="flex h-8 select-none items-center rounded-sm px-2 text-sm outline-none transition-colors focus:bg-primary/5 focus:text-primary data-[highlighted]:bg-primary/5 data-[highlighted]:text-primary data-[disabled]:opacity-50">取消排序</DropdownMenuItem><Label className="text-xs">金额范围</Label><div className="grid grid-cols-2 gap-2"><Input value={minimum} onChange={(event) => setMinimum(event.target.value)} type="text" inputMode="decimal" placeholder="最低" /><Input value={maximum} onChange={(event) => setMaximum(event.target.value)} type="text" inputMode="decimal" placeholder="最高" /></div>{active && <Button className="w-full" size="sm" variant="ghost" onClick={() => { setMinimum(""); setMaximum(""); }}><RotateCcw className="size-3" />清除金额筛选</Button>}</DropdownMenuContent></DropdownMenu>;
}

type HeaderDragSession = {
  pointerId: number;
  sourceId: string;
  targetId: string;
  sourceElement: HTMLElement;
  timer: number | null;
  active: boolean;
};

function DesktopTransactionGrid({ table, editMode, selectedIds, setColumnOrder, headerFilters }: { table: ReturnType<typeof useReactTable<Transaction>>; editMode: boolean; selectedIds: Set<string>; setColumnOrder: React.Dispatch<React.SetStateAction<ColumnOrderState>>; headerFilters: Record<string, React.ReactNode> }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<HeaderDragSession | null>(null);
  const menuClosersRef = useRef(new Set<() => void>());
  const suppressClickRef = useRef(false);
  const suppressClickTimerRef = useRef<number | null>(null);
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => DESKTOP_TRANSACTION_ROW_HEIGHT, overscan: 10 });
  const rowItems = editMode ? rows.map((_, index) => ({ index, start: index * DESKTOP_TRANSACTION_ROW_HEIGHT })) : virtualizer.getVirtualItems();
  const totalSize = editMode ? rows.length * DESKTOP_TRANSACTION_ROW_HEIGHT : virtualizer.getTotalSize();

  const registerMenuCloser = useCallback((closer: () => void) => {
    menuClosersRef.current.add(closer);
    return () => menuClosersRef.current.delete(closer);
  }, []);
  const closeHeaderMenus = useCallback(() => {
    menuClosersRef.current.forEach((closer) => closer());
  }, []);
  const headerDragContext = useMemo<HeaderDragContextValue>(() => ({ registerMenuCloser }), [registerMenuCloser]);

  const resetDragVisuals = useCallback(() => {
    setDraggingColumn(null);
    setDragOverColumnId(null);
  }, []);

  const releasePointer = useCallback((session: HeaderDragSession) => {
    try {
      if (session.sourceElement.hasPointerCapture?.(session.pointerId)) session.sourceElement.releasePointerCapture?.(session.pointerId);
    } catch {
      // Pointer capture can already be released by WebView2 during cancellation.
    }
  }, []);

  const getColumnAtPoint = useCallback((event: PointerEvent) => {
    const pointTarget = document.elementFromPoint?.(event.clientX, event.clientY) ?? (event.target as Element | null);
    if (!(pointTarget instanceof Element) || pointTarget.closest("[data-column-resize]")) return null;
    const header = pointTarget.closest<HTMLElement>("[data-transaction-column]");
    const columnId = header?.dataset.transactionColumn;
    return columnId && columnId !== "select" ? columnId : null;
  }, []);

  const finishPointer = useCallback((event: PointerEvent, cancelled: boolean) => {
    const session = sessionRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    if (session.timer !== null) window.clearTimeout(session.timer);
    session.timer = null;
    sessionRef.current = null;
    releasePointer(session);
    const shouldReorder = !cancelled && session.active;
    const source = session.sourceId;
    const target = session.targetId;
    resetDragVisuals();
    if (!shouldReorder) {
      if (cancelled) suppressClickRef.current = false;
      return;
    }
    suppressClickRef.current = true;
    if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current);
    suppressClickTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      suppressClickTimerRef.current = null;
    }, 0);
    if (source === target) return;
    setColumnOrder((current) => {
      const next = current.filter((id) => id !== source);
      const targetIndex = next.indexOf(target);
      next.splice(targetIndex < 0 ? next.length : targetIndex, 0, source);
      void settingsRepository.set("transaction_column_order", next);
      return next;
    });
  }, [releasePointer, resetDragVisuals, setColumnOrder]);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const session = sessionRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    const targetId = getColumnAtPoint(event);
    if (!targetId || targetId === session.targetId) return;
    session.targetId = targetId;
    if (session.active) setDragOverColumnId(targetId);
  }, [getColumnAtPoint]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => handlePointerMove(event);
    const onPointerUp = (event: PointerEvent) => finishPointer(event, false);
    const onPointerCancel = (event: PointerEvent) => finishPointer(event, true);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
      const session = sessionRef.current;
      if (session?.timer !== null && session) window.clearTimeout(session.timer);
      if (session) releasePointer(session);
      if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current);
      suppressClickTimerRef.current = null;
      sessionRef.current = null;
    };
  }, [finishPointer, handlePointerMove, releasePointer]);

  const startHeaderLongPress = useCallback((headerId: string, event: React.PointerEvent<HTMLElement>) => {
    if (headerId === "select" || (event.pointerType === "mouse" && event.button !== 0)) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-column-resize]")) return;
    const currentTarget = event.currentTarget as HTMLElement;
    const pointerId = event.pointerId;
    const previous = sessionRef.current;
    if (previous) {
      if (previous.timer !== null) window.clearTimeout(previous.timer);
      releasePointer(previous);
    }
    suppressClickRef.current = false;
    const session: HeaderDragSession = { pointerId, sourceId: headerId, targetId: headerId, sourceElement: currentTarget, timer: null, active: false };
    sessionRef.current = session;
    try {
      currentTarget.setPointerCapture?.(pointerId);
    } catch {
      // Pointer capture is best effort; document listeners remain as a fallback.
    }
    session.timer = window.setTimeout(() => {
      const current = sessionRef.current;
      if (!current || current.pointerId !== pointerId) return;
      current.timer = null;
      current.active = true;
      closeHeaderMenus();
      setDraggingColumn(headerId);
      setDragOverColumnId(current.targetId);
    }, 450);
  }, [closeHeaderMenus, releasePointer]);

  const handleHeaderClickCapture = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return <HeaderDragContext.Provider value={headerDragContext}><div ref={parentRef} className="scrollbar-thin hidden h-[520px] overflow-auto rounded-lg border border-border bg-card md:block">
    <table className="grid min-w-max text-sm">
      <thead className="sticky top-0 z-10 grid border-b border-border bg-muted">
        <tr className="flex w-full">
          {table.getHeaderGroups()[0].headers.map((header) => <th key={header.id} data-transaction-column={header.id} aria-grabbed={draggingColumn === header.id || undefined} onPointerDownCapture={(event) => startHeaderLongPress(header.id, event)} onPointerCancel={(event) => finishPointer(event.nativeEvent, true)} onLostPointerCapture={(event) => finishPointer(event.nativeEvent, true)} onClickCapture={handleHeaderClickCapture} className={cn("relative flex h-10 shrink-0 select-none items-center touch-none border-r border-border px-1.5 text-left text-xs font-semibold", header.id !== "select" && "cursor-grab", draggingColumn === header.id && "cursor-grabbing opacity-70", dragOverColumnId === header.id && draggingColumn !== header.id && "bg-primary/10")} style={{ width: header.getSize() }}>
            <div className={cn("min-w-0 flex-1 truncate", header.id === "select" && "flex justify-center")}>{headerFilters[header.id] ?? flexRender(header.column.columnDef.header, header.getContext())}</div>
            <div data-column-resize onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => { event.stopPropagation(); header.getResizeHandler()(event); }} onTouchStart={(event) => { event.stopPropagation(); header.getResizeHandler()(event); }} onDoubleClick={() => header.column.resetSize()} className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none hover:bg-primary/60" title="拖动调整列宽；双击恢复默认宽度" />
          </th>)}
        </tr>
      </thead>
      <tbody className="relative grid" style={{ height: `${totalSize}px` }}>
        {rowItems.map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          const pending = row.original.statusCode === "pending_reimbursement" || row.original.statusCode === "pending_transfer";
          const settled = row.original.statusCode === "settled" || row.original.statusCode === "transferred";
          return <tr key={row.id} className={cn("absolute flex w-full border-b border-border", pending && "bg-rose-50/70", settled && "bg-emerald-50/70", editMode && selectedIds.has(row.id) && !pending && !settled && "bg-primary/5", editMode && selectedIds.has(row.id) && "ring-1 ring-inset ring-primary/25")} style={{ transform: `translateY(${virtualRow.start}px)` }}>
            {row.getVisibleCells().map((cell) => <td key={cell.id} className={cn("flex h-9 shrink-0 items-center overflow-hidden border-r border-border text-xs", editMode ? "px-1" : "px-2")} style={{ width: cell.column.getSize() }}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
          </tr>;
        })}
      </tbody>
    </table>
  </div></HeaderDragContext.Provider>;
}

function MobileTransactionCards({ rows, getEditableRow, selectedIds, setSelectedIds, editMode, referenceData, updateDraft, dateDisplay }: { rows: Transaction[]; getEditableRow: (row: Transaction) => Transaction; selectedIds: Set<string>; setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>; editMode: boolean; referenceData: ReferenceData; updateDraft: (id: string, patch: Partial<Transaction>) => void; dateDisplay: TransactionDateDisplay }) {
  return <div className={cn("space-y-2 md:hidden", editMode && "rounded-md bg-primary/[0.02] p-1")}>{rows.map((row) => {
    const current = getEditableRow(row);
    const mobileTitle = current.counterparty || current.remark || current.categoryName || "待分类";
    return <article key={row.id} className={cn("rounded-lg border border-border bg-card p-3", current.statusCode?.startsWith("pending") && "border-rose-200 bg-rose-50/50", editMode && selectedIds.has(row.id) && !current.statusCode?.startsWith("pending") && "bg-primary/5 ring-1 ring-inset ring-primary/25")}><div className="flex items-start gap-3"><Checkbox checked={selectedIds.has(row.id)} onCheckedChange={(checked) => setSelectedIds((selected) => { const next = new Set(selected); checked ? next.add(row.id) : next.delete(row.id); return next; })} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="line-clamp-2 break-words text-sm font-medium" title={mobileTitle}>{mobileTitle}</p><p className="text-xs text-muted-foreground">{formatTransactionDisplayDateTime(current.occurredAt, dateDisplay)}</p></div><span className={cn("shrink-0 text-sm font-semibold", current.tradeType === "income" ? "text-emerald-600" : "text-rose-600")}>{current.tradeType === "expense" ? "-" : "+"}{formatMoney(current.amountMinor)}</span></div>{editMode ? <div className="mt-3 grid gap-2"><CellInput value={current.occurredAt} onChange={(value) => updateDraft(row.id, { occurredAt: value })} /><div className="grid grid-cols-2 gap-2"><CellSelect value={current.accountId} options={referenceData.accounts.map((item) => ({ value: item.id, label: item.name }))} onChange={(value) => updateDraft(row.id, { accountId: value, accountName: referenceData.accounts.find((item) => item.id === value)?.name ?? "" })} /><CellSelect allowBlank value={current.categoryId ?? ""} options={categoriesFor(current.tradeType, referenceData).map((item) => ({ value: item.id, label: item.name }))} onChange={(value) => { const category = referenceData.categories.find((item) => item.id === value); updateDraft(row.id, { categoryId: value || null, categoryName: category?.name ?? null, categorySystemKey: category?.systemKey ?? null }); }} /></div><CellInput value={current.remark} onChange={(value) => updateDraft(row.id, { remark: value })} /></div> : <div className="mt-2 flex flex-wrap gap-1"><Badge>{tradeTypeLabels[current.tradeType]}</Badge>{current.categoryName && <Badge>{current.categoryName}</Badge>}{current.tagName && <Badge>{current.tagName}</Badge>}</div>}</div></div></article>;
  })}</div>;
}

function BatchDialog({ open, onOpenChange, selectedIds, drafts, referenceData, setDrafts }: { open: boolean; onOpenChange: (open: boolean) => void; selectedIds: Set<string>; drafts: Map<string, Transaction>; referenceData: ReferenceData; setDrafts: React.Dispatch<React.SetStateAction<Map<string, Transaction>>> }) {
  const [tradeType, setTradeType] = useState(""); const [categoryId, setCategoryId] = useState(""); const [tagId, setTagId] = useState(""); const [status, setStatus] = useState("");
  const effectiveType = tradeType as TradeType | "";
  const apply = () => { setDrafts((current) => { const next = new Map(current); for (const id of selectedIds) { const row = next.get(id); if (!row) continue; let patch: Partial<Transaction> = {}; if (effectiveType) patch = { ...patch, tradeType: effectiveType, categoryId: null, categoryName: null, categorySystemKey: null, tagId: null, tagName: null, statusCode: null }; if (categoryId) { const category = referenceData.categories.find((item) => item.id === categoryId); patch = { ...patch, categoryId: categoryId === "clear" ? null : categoryId, categoryName: category?.name ?? null, categorySystemKey: category?.systemKey ?? null, statusCode: category?.systemKey ? DEFAULT_STATUS[category.systemKey] ?? null : null, tagId: category?.systemKey ? null : category?.defaultTagId ?? null }; } if (tagId) { const tag = referenceData.tags.find((item) => item.id === tagId); patch = { ...patch, tagId: tagId === "clear" ? null : tagId, tagName: tag?.name ?? null }; } if (status) patch = { ...patch, statusCode: status === "clear" ? null : status as StatusCode }; next.set(id, normalizeDraft({ ...row, ...patch }, referenceData)); } return next; }); onOpenChange(false); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>批量修改 {selectedIds.size} 条流水</DialogTitle></DialogHeader><div className="space-y-3"><BatchField label="收支" value={tradeType} onChange={setTradeType} options={Object.entries(tradeTypeLabels).map(([value, label]) => ({ value, label }))} /><BatchField label="分类" value={categoryId} onChange={setCategoryId} options={[{ value: "clear", label: "清空" }, ...referenceData.categories.filter((item) => !effectiveType || item.kind === (effectiveType === "income" ? "income" : "expense")).map((item) => ({ value: item.id, label: item.name }))]} /><BatchField label="标签" value={tagId} onChange={setTagId} options={[{ value: "clear", label: "清空" }, ...referenceData.tags.filter((item) => !effectiveType || item.kind === (effectiveType === "income" ? "income" : "expense")).map((item) => ({ value: item.id, label: item.name }))]} /><BatchField label="状态" value={status} onChange={setStatus} options={[{ value: "clear", label: "清空" }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button onClick={apply}>应用到草稿</Button></DialogFooter></DialogContent></Dialog>;
}

function BatchField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) { return <div className="space-y-1"><Label>{label}</Label><select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={value} onChange={(event) => onChange(event.target.value)}><option value="">不修改</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>; }

const CellText = memo(function CellText({ value, className }: { value?: string | null; className?: string }) {
  const text = value ?? "";
  return <span className={cn("block w-full min-w-0 truncate", className)} title={text || undefined}>{text}</span>;
});

const CellInput = memo(function CellInput({ value, onChange, type = "text", inputMode }: { value: string; onChange: (value: string) => void; type?: React.HTMLInputTypeAttribute; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"] }) { return <input className="h-8 w-full min-w-0 rounded-none border border-transparent bg-white px-1 text-sm outline-none transition-shadow focus-visible:border-input focus-visible:ring-2 focus-visible:ring-ring" type={type} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} />; });

const DRAFT_EMPTY_VALUE = "__accountbook_empty__";
const DraftSelect = memo(function DraftSelect({ value, options, onChange, allowBlank, disabled }: { value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; allowBlank?: boolean; disabled?: boolean }) {
  const selectedValue = value || (allowBlank ? DRAFT_EMPTY_VALUE : options[0]?.value ?? DRAFT_EMPTY_VALUE);
  return <Select value={selectedValue} onValueChange={(next) => onChange(next === DRAFT_EMPTY_VALUE ? "" : next)} disabled={disabled}>
    <SelectTrigger className="h-8 w-full min-w-0 rounded-none border border-transparent bg-white px-1 text-left text-xs outline-none focus-visible:border-input focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45">
      <SelectValue placeholder={allowBlank ? "未设置" : "请选择"} />
    </SelectTrigger>
    <SelectContent className="min-w-[var(--radix-select-trigger-width)]">
      {(allowBlank || selectedValue === DRAFT_EMPTY_VALUE) && <SelectItem showIndicator={false} value={DRAFT_EMPTY_VALUE}>未设置</SelectItem>}
      {options.map((option) => <SelectItem showIndicator={false} key={option.value} value={option.value}>{option.label}</SelectItem>)}
    </SelectContent>
  </Select>;
});
const CellSelect = DraftSelect;
function mergeTransactions(current: Map<string, Transaction>, rows: Transaction[]): Map<string, Transaction> { const next = new Map(current); rows.forEach((row) => { if (!next.has(row.id)) next.set(row.id, row); }); return next; }
function formatDraftAmount(amountMinor: number): string { return (Math.abs(amountMinor) / 100).toFixed(2); }
function materializeDraftAmount(id: string, draft: Transaction, amountTexts: Map<string, string>): Transaction { return { ...draft, amountMinor: signedMinor(amountTexts.get(id) ?? formatDraftAmount(draft.amountMinor), draft.tradeType) }; }
function transactionSignature(row: Transaction): string { return JSON.stringify([row.occurredAt, row.accountId, row.tradeType, row.amountMinor, row.categoryId, row.tagId, row.statusCode, row.remark, row.counterparty, row.paymentChannel]); }
function toInput(row: Transaction): TransactionInput { return { occurredAt: row.occurredAt, accountId: row.accountId, tradeType: row.tradeType, amountMinor: row.amountMinor, categoryId: row.categoryId, tagId: row.tagId, statusCode: row.statusCode, remark: row.remark, counterparty: row.counterparty, paymentChannel: row.paymentChannel, source: row.source, sourceCategory: row.sourceCategory }; }
function categoriesFor(type: TradeType, referenceData: ReferenceData): Category[] { const kind = type === "income" ? "income" : "expense"; return referenceData.categories.filter((item) => item.kind === kind && item.isActive); }
function tagsFor(type: TradeType, referenceData: ReferenceData) { const kind = type === "income" ? "income" : "expense"; return referenceData.tags.filter((item) => item.kind === kind && item.isActive); }
function normalizeDraft(row: Transaction, referenceData: ReferenceData): Transaction { const category = row.categoryId ? referenceData.categories.find((item) => item.id === row.categoryId) : undefined; if (!category) return { ...row, categoryId: null, categoryName: null, categorySystemKey: null, tagId: null, tagName: null, statusCode: null }; const expectedKind = row.tradeType === "income" ? "income" : "expense"; if (category.kind !== expectedKind) return { ...row, categoryId: null, categoryName: null, categorySystemKey: null, tagId: null, tagName: null, statusCode: null }; if (category.systemKey) return { ...row, tagId: null, tagName: null, statusCode: row.statusCode && STATUS_BY_SYSTEM[category.systemKey]?.includes(row.statusCode) ? row.statusCode : DEFAULT_STATUS[category.systemKey] ?? null }; return { ...row, statusCode: null }; }
