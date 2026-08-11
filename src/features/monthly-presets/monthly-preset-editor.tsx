import { Edit3, Plus, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "@/components/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { monthlyPresetService } from "@/services/registry";
import { displayEntryTime } from "@/services/monthly-preset-service";
import { recurrenceRuleService } from "@/services/recurrence-rule-service";
import type { Account, Category, StatusCode, Tag, TradeType } from "@/types/domain";
import { DEFAULT_BOOK_ID, statusLabels, tradeTypeLabels } from "@/types/domain";
import type { MonthlyPreset, MonthlyPresetInput, RecurrenceRule } from "@/types/recurrence";
import { signedMinor } from "@/utils/money";
import { RecurrenceRuleEditor } from "@/features/recurrence/recurrence-rule-editor";

const statusOptions: Record<string, StatusCode[]> = {
  public_expense: ["pending_reimbursement", "settled"],
  reimbursement: ["settled"],
  pass_through_income: ["pending_transfer", "transferred"],
  pass_through_expense: ["transferred"],
};

const statusDefaults: Record<string, StatusCode> = {
  public_expense: "pending_reimbursement",
  reimbursement: "settled",
  pass_through_income: "pending_transfer",
  pass_through_expense: "transferred",
};

interface OptionsReferenceData {
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
}

interface DraftPreset extends MonthlyPresetInput {
  id?: string;
}

function emptyDraft(accounts: Account[]): DraftPreset {
  return {
    name: "",
    rule: { frequency: "monthly", kind: "day", day: 1 },
    entryTime: "09:00",
    accountId: accounts[0]?.id ?? "",
    tradeType: "expense",
    amountMinor: 0,
    categoryId: null,
    tagId: null,
    statusCode: null,
    remark: "",
    counterparty: "",
    paymentChannel: "",
    defaultSelected: true,
    isActive: true,
  };
}

export function MonthlyPresetEditor({ referenceData, refreshVersion, onChanged }: { referenceData: OptionsReferenceData; refreshVersion: number; onChanged: (message: string) => Promise<void> }) {
  const [rows, setRows] = useState<MonthlyPreset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftPreset>(() => emptyDraft(referenceData.accounts));
  const [amountText, setAmountText] = useState("");
  const [ruleOpen, setRuleOpen] = useState(false);

  const load = async () => {
    try {
      setRows(await monthlyPresetService.list(DEFAULT_BOOK_ID, true));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  useEffect(() => { void load(); }, [refreshVersion]);
  useEffect(() => { if (!draft.accountId && referenceData.accounts[0]) setDraft((current) => ({ ...current, accountId: referenceData.accounts[0].id })); }, [draft.accountId, referenceData.accounts]);

  const categories = useMemo(() => referenceData.categories.filter((item) => item.kind === (draft.tradeType === "income" ? "income" : "expense") && item.isActive), [draft.tradeType, referenceData.categories]);
  const tags = useMemo(() => referenceData.tags.filter((item) => item.kind === (draft.tradeType === "income" ? "income" : "expense") && item.isActive), [draft.tradeType, referenceData.tags]);
  const selectedCategory = referenceData.categories.find((item) => item.id === draft.categoryId);
  const statuses = selectedCategory?.systemKey ? statusOptions[selectedCategory.systemKey] ?? [] : [];

  if (error) return <ErrorState message={error} />;
  if (!rows) return <LoadingState label="正在读取月度预设" />;

  const reset = () => { setDraft(emptyDraft(referenceData.accounts)); setAmountText(""); setNotice(null); };
  const edit = (row: MonthlyPreset) => { setDraft({ ...row, entryTime: displayEntryTime(row.entryTime) }); setAmountText((Math.abs(row.amountMinor) / 100).toFixed(2)); setNotice(null); };
  const changeTradeType = (value: TradeType) => setDraft((current) => ({ ...current, tradeType: value, categoryId: null, tagId: null, statusCode: null }));
  const changeCategory = (value: string) => {
    const category = referenceData.categories.find((item) => item.id === value);
    setDraft((current) => ({ ...current, categoryId: value === "none" ? null : value, tagId: category?.systemKey ? null : category?.defaultTagId ?? null, statusCode: category?.systemKey ? statusDefaults[category.systemKey] ?? null : null }));
  };
  const save = async () => {
    try {
      const input: MonthlyPresetInput = { ...draft, amountMinor: signedMinor(amountText, draft.tradeType) };
      if (draft.id) await monthlyPresetService.update(draft.id, input);
      else await monthlyPresetService.create(DEFAULT_BOOK_ID, input);
      reset();
      await load();
      setNotice("月度预设已保存");
      await onChanged("月度预设已保存");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return <div className="space-y-4">
    {notice && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">{notice}</div>}
    <Card>
      <CardHeader><CardTitle>{draft.id ? "编辑月度预设" : "新增月度预设"}</CardTitle>{draft.id && <Button variant="ghost" size="sm" onClick={reset}><X className="size-4" />取消编辑</Button>}</CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="预设名称"><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如：每月工资" /></Field>
          <Field label="记账时间"><Input type="time" value={draft.entryTime.slice(0, 5)} onChange={(event) => setDraft({ ...draft, entryTime: event.target.value })} /></Field>
          <Field label="日期规则"><div className="flex gap-2"><Input className="min-w-0 flex-1" value={safeDescribe(draft.rule)} readOnly aria-label="日期规则摘要" /><Button type="button" variant="outline" onClick={() => setRuleOpen(true)}>编辑规则</Button></div><p className="mt-1 text-xs text-muted-foreground">{safeNextDate(draft.rule)}</p></Field>
          <Field label="账户"><Select value={draft.accountId} onValueChange={(value) => setDraft({ ...draft, accountId: value })}><SelectTrigger><SelectValue placeholder="选择账户" /></SelectTrigger><SelectContent>{referenceData.accounts.filter((item) => item.isActive).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="收支"><Select value={draft.tradeType} onValueChange={(value) => changeTradeType(value as TradeType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(tradeTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="金额"><Input type="text" inputMode="decimal" value={amountText} onChange={(event) => setAmountText(event.target.value)} placeholder="0.00" /></Field>
          <Field label="分类"><Select value={draft.categoryId ?? "none"} onValueChange={changeCategory}><SelectTrigger><SelectValue placeholder="待分类" /></SelectTrigger><SelectContent><SelectItem value="none">待分类</SelectItem>{categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="标签"><Select value={draft.tagId ?? "none"} onValueChange={(value) => setDraft({ ...draft, tagId: value === "none" ? null : value })} disabled={Boolean(selectedCategory?.systemKey)}><SelectTrigger><SelectValue placeholder="未设置" /></SelectTrigger><SelectContent><SelectItem value="none">未设置</SelectItem>{tags.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="状态"><Select value={draft.statusCode ?? "none"} onValueChange={(value) => setDraft({ ...draft, statusCode: value === "none" ? null : value as StatusCode })} disabled={!statuses.length}><SelectTrigger><SelectValue placeholder="无" /></SelectTrigger><SelectContent><SelectItem value="none">无</SelectItem>{statuses.map((status) => <SelectItem key={status} value={status}>{statusLabels[status]}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="交易对方"><Input value={draft.counterparty} onChange={(event) => setDraft({ ...draft, counterparty: event.target.value })} /></Field>
          <Field label="支付方式"><Input value={draft.paymentChannel} onChange={(event) => setDraft({ ...draft, paymentChannel: event.target.value })} /></Field>
        </div>
        <Field label="备注"><Textarea value={draft.remark} onChange={(event) => setDraft({ ...draft, remark: event.target.value })} rows={2} /></Field>
        <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><Checkbox checked={draft.defaultSelected} onCheckedChange={(checked) => setDraft({ ...draft, defaultSelected: checked === true })} />默认勾选</label><label className="flex items-center gap-2"><Checkbox checked={draft.isActive} onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked === true })} />启用</label></div>
        <div className="flex justify-end"><Button onClick={() => void save()} disabled={!draft.name.trim() || !draft.accountId}><Save className="size-4" />保存预设</Button></div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>已有预设</CardTitle><Button variant="outline" size="sm" onClick={reset}><Plus className="size-4" />新增预设</Button></CardHeader>
      <CardContent>{rows.length ? <div className="divide-y divide-border rounded-md border border-border">{rows.map((row) => <div key={row.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{row.name}</span>{!row.isActive && <Badge tone="warning">已停用</Badge>}{row.defaultSelected && <Badge>默认勾选</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{safeDescribe(row.rule)} · {displayEntryTime(row.entryTime)} · {tradeTypeLabels[row.tradeType]} {Math.abs(row.amountMinor / 100).toFixed(2)} 元</p><p className="text-xs text-muted-foreground">最近生成：{row.latestGeneratedMonth ?? "尚未生成"}</p></div><Button variant="outline" size="sm" onClick={() => edit(row)}><Edit3 className="size-4" />编辑</Button></div>)}</div> : <p className="py-8 text-center text-sm text-muted-foreground">还没有固定账目预设</p>}</CardContent>
    </Card>
    <RecurrenceRuleEditor open={ruleOpen} onOpenChange={setRuleOpen} value={draft.rule} onSave={(rule: RecurrenceRule) => setDraft({ ...draft, rule })} />
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0 space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function safeDescribe(rule: RecurrenceRule): string {
  try { return recurrenceRuleService.describe(rule); } catch { return "规则尚未完整"; }
}

function safeNextDate(rule: RecurrenceRule): string {
  try { return recurrenceRuleService.nextOccurrences(rule, new Date(), 1)[0] ?? "暂无日期"; } catch { return "请完成规则设置"; }
}
