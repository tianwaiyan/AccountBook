import { CheckCheck, ListX, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "@/components/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { monthlyPresetService } from "@/services/registry";
import { recurrenceRuleService } from "@/services/recurrence-rule-service";
import type { MonthlyPreset } from "@/types/recurrence";
import { displayEntryTime } from "@/services/monthly-preset-service";
import { DEFAULT_BOOK_ID } from "@/types/domain";

export function BatchPresetDialog({ open, onOpenChange, selectedMonth, onGenerated }: { open: boolean; onOpenChange: (open: boolean) => void; selectedMonth: string; onGenerated: () => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none">
    <DialogHeader><DialogTitle>批量记账</DialogTitle><DialogDescription>选择预设后，将目标月份内符合日期规则的流水一次写入账本。</DialogDescription></DialogHeader>
    <BatchPresetForm active={open} selectedMonth={selectedMonth} onGenerated={onGenerated} onCancel={() => onOpenChange(false)} />
  </DialogContent></Dialog>;
}

export function BatchPresetForm({ active, selectedMonth, onGenerated, onCancel }: { active: boolean; selectedMonth: string; onGenerated: () => void; onCancel: () => void }) {
  const [targetMonth, setTargetMonth] = useState(selectedMonth);
  const [rows, setRows] = useState<MonthlyPreset[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!active) return;
    setTargetMonth(selectedMonth);
    setResult(null);
    setError(null);
    void monthlyPresetService.list(DEFAULT_BOOK_ID).then((presets) => { setRows(presets); setSelectedIds(new Set(presets.filter((preset) => preset.defaultSelected).map((preset) => preset.id))); }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [active, selectedMonth]);

  const occurrenceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!rows) return counts;
    rows.forEach((preset) => { try { counts.set(preset.id, recurrenceRuleService.occurrencesForMonth(preset.rule, targetMonth).length); } catch { counts.set(preset.id, 0); } });
    return counts;
  }, [rows, targetMonth]);

  const submit = async () => {
    if (!selectedIds.size) { setError("请至少选择一个预设"); return; }
    setBusy(true);
    setError(null);
    try {
      const summary = await monthlyPresetService.generateForMonth(DEFAULT_BOOK_ID, targetMonth, [...selectedIds]);
      setResult(`已生成 ${summary.generated} 条流水；跳过 ${summary.skippedPresets} 个已处理预设；${summary.emptyPresets} 个预设在本月没有符合日期。`);
      onGenerated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return <>
    {!rows && !error && active ? <LoadingState label="正在读取月度预设" /> : error && !rows ? <ErrorState message={error} /> : <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_1fr]"><label className="space-y-1.5 text-sm font-medium">目标月份<Input type="month" value={targetMonth} onChange={(event) => setTargetMonth(event.target.value)} /></label><div className="flex items-end gap-2"><Button type="button" variant="outline" onClick={() => setSelectedIds(new Set(rows?.map((preset) => preset.id) ?? []))}><CheckCheck className="size-4" />全选</Button><Button type="button" variant="outline" onClick={() => setSelectedIds(new Set())}><ListX className="size-4" />清空</Button><span className="ml-auto text-xs text-muted-foreground">已选 {selectedIds.size} 个</span></div></div>
      {rows?.length ? <div className="max-h-[min(22rem,55vh)] divide-y divide-border overflow-y-auto rounded-md border border-border">{rows.map((preset) => <label key={preset.id} className="flex cursor-pointer items-start gap-3 p-3 hover:bg-accent/50"><Checkbox checked={selectedIds.has(preset.id)} onCheckedChange={(checked) => setSelectedIds((current) => { const next = new Set(current); checked ? next.add(preset.id) : next.delete(preset.id); return next; })} /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2 text-sm font-medium">{preset.name}<Badge>{occurrenceCounts.get(preset.id) ?? 0} 条</Badge></span><span className="mt-1 block truncate text-xs text-muted-foreground">{recurrenceRuleService.describe(preset.rule)} · {displayEntryTime(preset.entryTime)} · {Math.abs(preset.amountMinor / 100).toFixed(2)} 元</span></span></label>)}</div> : <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">还没有可用的月度预设，请先到“选项管理”中新增。</div>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {result && <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">{result}</p>}
    </div>}
    <DialogFooter><Button variant="outline" onClick={onCancel}>关闭</Button><Button onClick={() => void submit()} disabled={busy || !rows?.length}><Play className="size-4" />{busy ? "正在生成" : "生成记账"}</Button></DialogFooter>
  </>;
}
