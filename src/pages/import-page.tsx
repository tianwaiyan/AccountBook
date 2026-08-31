import { Archive, Download, FileSpreadsheet, RefreshCcw, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReferenceData } from "@/hooks/use-reference-data";
import { backupService, importService } from "@/services/import-registry";
import type { ImportCandidate, ImportPreview, TradeType } from "@/types/domain";
import { DEFAULT_BOOK_ID, tradeTypeLabels } from "@/types/domain";
import { formatMoney } from "@/utils/money";

type ImportSource = "alipay" | "wechat" | "canonical_csv";

const sourceLabels: Record<ImportSource, string> = {
  alipay: "支付宝",
  wechat: "微信",
  canonical_csv: "标准 CSV",
};

const MANUAL_EXCLUSION_REASON = "手动过滤";

export function ImportPage({ referenceData, onChanged }: { referenceData: ReferenceData; onChanged: () => void }) {
  const [source, setSource] = useState<ImportSource>("alipay");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [excludedHistory, setExcludedHistory] = useState<ImportCandidate[]>([]);

  const mappingGroups = useMemo(() => {
    if (!preview) return [];
    const map = new Map<string, ImportCandidate>();
    for (const candidate of preview.candidates) map.set(`${candidate.tradeType}:${candidate.sourceCategory}`, candidate);
    return [...map.values()];
  }, [preview]);

  const selectFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError(null); setMessage(null); setFileName(file.name);
    try {
      const next = await importService.preview(file, source, DEFAULT_BOOK_ID);
      setPreview(next);
      setExcludedHistory((current) => [...current, ...next.excluded]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setPreview(null);
    } finally { setBusy(false); }
  };

  const setMapping = (candidate: ImportCandidate, categoryId: string) => {
    if (!preview) return;
    setPreview({
      ...preview,
      candidates: preview.candidates.map((row) => row.tradeType === candidate.tradeType && row.sourceCategory === candidate.sourceCategory ? { ...row, categoryId: categoryId || null } : row),
    });
  };

  const toggleFilter = (rowId: string, shouldExclude: boolean) => {
    if (!preview) return;
    if (shouldExclude) {
      const candidate = preview.candidates.find((row) => row.rowId === rowId);
      if (!candidate) return;
      const filtered = { ...candidate, excludedReason: MANUAL_EXCLUSION_REASON };
      setPreview({
        ...preview,
        candidates: preview.candidates.filter((row) => row.rowId !== rowId),
        excluded: [...preview.excluded, filtered],
      });
      setExcludedHistory((current) => [...current.filter((row) => row.rowId !== rowId), filtered]);
      return;
    }

    const excluded = preview.excluded.find((row) => row.rowId === rowId);
    if (!excluded) return;
    const restored = { ...excluded, excludedReason: null };
    setPreview({
      ...preview,
      candidates: [...preview.candidates, restored],
      excluded: preview.excluded.filter((row) => row.rowId !== rowId),
    });
    setExcludedHistory((current) => current.filter((row) => row.rowId !== rowId));
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true); setError(null);
    try {
      const uniqueMappings = new Map<string, ImportCandidate>();
      preview.candidates.filter((candidate) => candidate.categoryId).forEach((candidate) => uniqueMappings.set(`${candidate.tradeType}:${candidate.sourceCategory}`, candidate));
      for (const candidate of uniqueMappings.values()) await importService.saveMapping(DEFAULT_BOOK_ID, candidate, candidate.categoryId!);
      const result = await importService.commit(DEFAULT_BOOK_ID, preview.candidates);
      setMessage(`新增 ${result.inserted} 条，跳过 ${result.skipped} 条重复记录`);
      setPreview(null); setFileName(""); onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };

  const exportCsv = async () => {
    setBusy(true); setError(null);
    try { const path = await backupService.exportCsv(await importService.canonicalCsv(DEFAULT_BOOK_ID)); if (path) setMessage(`CSV 已导出：${path}`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };

  const createBackup = async () => {
    setBusy(true); setError(null);
    try { const report = await backupService.createBackup(); if (report) setMessage(`备份已创建：${report.backupPath}`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };

  return <div className="space-y-5">
    {message && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>}
    {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
    <Tabs value={source} onValueChange={(value) => { setSource(value as ImportSource); setPreview(null); setFileName(""); }}>
      <TabsList className="w-full justify-start overflow-x-auto"><TabsTrigger value="alipay">支付宝</TabsTrigger><TabsTrigger value="wechat">微信</TabsTrigger><TabsTrigger value="canonical_csv">标准 CSV</TabsTrigger></TabsList>
      {(Object.keys(sourceLabels) as ImportSource[]).map((item) => <TabsContent key={item} value={item}><Card><CardContent className="flex min-h-44 flex-col items-center justify-center gap-4 p-5 text-center"><span className="flex size-11 items-center justify-center rounded-md bg-muted"><FileSpreadsheet className="size-5 text-muted-foreground" /></span><div><p className="text-sm font-medium">{sourceLabels[item]}账单</p>{fileName && <p className="mt-1 text-xs text-muted-foreground">{fileName}</p>}</div><label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"><Upload className="size-4" />选择文件<input className="sr-only" type="file" accept={item === "canonical_csv" ? ".csv" : ".csv,.xlsx"} onChange={(event) => void selectFile(event.target.files?.[0])} /></label></CardContent></Card></TabsContent>)}
    </Tabs>

    {busy && <div className="text-sm text-muted-foreground">正在处理…</div>}
    {preview && <Card><CardHeader><CardTitle>导入预览</CardTitle><div className="flex gap-2"><Badge>{preview.candidates.length} 条待导入</Badge><Badge tone={preview.excluded.length ? "warning" : "neutral"}>{preview.excluded.length} 条过滤</Badge></div></CardHeader><CardContent className="space-y-4"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{mappingGroups.map((candidate) => <div key={`${candidate.tradeType}:${candidate.sourceCategory}`} className="rounded-md border border-border p-2"><p className="truncate text-xs text-muted-foreground">{tradeTypeLabels[candidate.tradeType]} · {candidate.sourceCategory || "空白分类"}</p><select className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={candidate.categoryId ?? ""} onChange={(event) => setMapping(candidate, event.target.value)}><option value="">待分类</option>{categoriesFor(candidate.tradeType, referenceData).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>)}</div><PreviewSection title="待导入" rows={preview.candidates} excluded={false} onToggle={toggleFilter} /><PreviewSection title="过滤清单" rows={preview.excluded} excluded onToggle={toggleFilter} /><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPreview(null)}>取消</Button><Button onClick={commit} disabled={busy || preview.candidates.length === 0}><Upload className="size-4" />导入 {preview.candidates.length} 条</Button></div></CardContent></Card>}

    <section className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>数据导出</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2"><Button variant="outline" onClick={exportCsv} disabled={busy}><Download className="size-4" />导出标准 CSV</Button><Button variant="outline" onClick={createBackup} disabled={busy}><Archive className="size-4" />创建完整备份</Button></CardContent></Card><Card><CardHeader><CardTitle>恢复备份</CardTitle></CardHeader><CardContent><Button variant="outline" onClick={() => void backupService.restoreBackup()} disabled={busy}><RefreshCcw className="size-4" />恢复完整备份</Button></CardContent></Card></section>
    {excludedHistory.length > 0 && <Card><CardHeader><CardTitle>本次会话过滤记录</CardTitle><Button size="sm" variant="ghost" onClick={() => setExcludedHistory([])}>清除</Button></CardHeader><CardContent className="space-y-2">{excludedHistory.slice(-50).map((row) => <div key={row.rowId} className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-0"><span className="truncate">{row.occurredAt} · {row.remark || row.sourceCategory}</span><Badge tone="warning">{row.excludedReason}</Badge></div>)}</CardContent></Card>}
  </div>;
}

function PreviewSection({ title, rows, excluded, onToggle }: { title: string; rows: ImportCandidate[]; excluded: boolean; onToggle: (rowId: string, checked: boolean) => void }) {
  return <section className="space-y-2"><div className="flex items-center gap-2"><h4 className="text-sm font-medium">{title}</h4><Badge tone={excluded && rows.length ? "warning" : "neutral"}>{rows.length}</Badge></div>{rows.length ? <div className="max-h-80 overflow-auto rounded-md border border-border"><table className="w-full min-w-[960px] text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="w-14 px-3 py-2 text-center">过滤</th><th className="px-3 py-2 text-left">时间</th><th className="px-3 py-2 text-left">账户</th><th className="px-3 py-2 text-left">收支</th><th className="px-3 py-2 text-right">金额</th><th className="px-3 py-2 text-left">交易对方</th><th className="px-3 py-2 text-left">支付方式</th><th className="px-3 py-2 text-left">来源分类</th><th className="px-3 py-2 text-left">备注</th><th className="px-3 py-2 text-left">过滤原因</th></tr></thead><tbody>{rows.map((candidate) => <tr key={candidate.rowId} data-import-row={candidate.rowId} className="border-t border-border"><td className="px-3 py-2 text-center"><input className="size-4 accent-primary" type="checkbox" checked={excluded} aria-label={`${excluded ? "取消过滤" : "手动过滤"} ${candidate.occurredAt} ${candidate.remark || candidate.sourceCategory}`} onChange={(event) => onToggle(candidate.rowId, event.currentTarget.checked)} /></td><td className="px-3 py-2">{candidate.occurredAt}</td><td className="px-3 py-2">{candidate.accountName}</td><td className="px-3 py-2">{tradeTypeLabels[candidate.tradeType]}</td><td className="px-3 py-2 text-right">{formatMoney(candidate.amountMinor)}</td><td className="max-w-44 truncate px-3 py-2" title={candidate.counterparty}>{candidate.counterparty}</td><td className="max-w-36 truncate px-3 py-2" title={candidate.paymentChannel}>{candidate.paymentChannel}</td><td className="max-w-36 truncate px-3 py-2" title={candidate.sourceCategory}>{candidate.sourceCategory}</td><td className="max-w-60 truncate px-3 py-2" title={candidate.remark}>{candidate.remark}</td><td className="px-3 py-2">{excluded ? <Badge tone="warning">{candidate.excludedReason}</Badge> : "-"}</td></tr>)}</tbody></table></div> : <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">暂无条目</p>}</section>;
}

function categoriesFor(type: TradeType, referenceData: ReferenceData) { const kind = type === "income" ? "income" : "expense"; return referenceData.categories.filter((category) => category.kind === kind && category.isActive); }
