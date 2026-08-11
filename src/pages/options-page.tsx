import { ArrowDown, ArrowUp, Plus, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "@/components/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { optionRepository } from "@/services/registry";
import type { Account, Category, CategoryKind, Tag } from "@/types/domain";
import { DEFAULT_BOOK_ID } from "@/types/domain";

interface OptionsData {
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
}

export function OptionsPage({ refreshVersion, onChanged }: { refreshVersion: number; onChanged: () => void }) {
  const [data, setData] = useState<OptionsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    try {
      const [accounts, categories, tags] = await Promise.all([
        optionRepository.listAccounts(DEFAULT_BOOK_ID, true),
        optionRepository.listCategories(DEFAULT_BOOK_ID, true),
        optionRepository.listTags(DEFAULT_BOOK_ID, true),
      ]);
      setData({ accounts, categories, tags });
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  useEffect(() => { void load(); }, [refreshVersion]);
  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState />;

  const changed = async (message: string) => { setNotice(message); await load(); onChanged(); };
  return <div className="space-y-4">
    {notice && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}
    <Tabs defaultValue="accounts">
      <div className="overflow-x-auto"><TabsList className="min-w-max"><TabsTrigger value="accounts">账户</TabsTrigger><TabsTrigger value="expense-categories">支出分类</TabsTrigger><TabsTrigger value="income-categories">收入分类</TabsTrigger><TabsTrigger value="expense-tags">支出标签</TabsTrigger><TabsTrigger value="income-tags">收入标签</TabsTrigger></TabsList></div>
      <TabsContent value="accounts"><AccountEditor rows={data.accounts} onChanged={changed} /></TabsContent>
      <TabsContent value="expense-categories"><CategoryEditor kind="expense" rows={data.categories.filter((item) => item.kind === "expense")} tags={data.tags.filter((item) => item.kind === "expense")} onChanged={changed} /></TabsContent>
      <TabsContent value="income-categories"><CategoryEditor kind="income" rows={data.categories.filter((item) => item.kind === "income")} tags={data.tags.filter((item) => item.kind === "income")} onChanged={changed} /></TabsContent>
      <TabsContent value="expense-tags"><TagEditor kind="expense" rows={data.tags.filter((item) => item.kind === "expense")} onChanged={changed} /></TabsContent>
      <TabsContent value="income-tags"><TagEditor kind="income" rows={data.tags.filter((item) => item.kind === "income")} onChanged={changed} /></TabsContent>
    </Tabs>
  </div>;
}

function AccountEditor({ rows, onChanged }: { rows: Account[]; onChanged: (message: string) => Promise<void> }) {
  const [drafts, setDrafts] = useState(rows);
  const [newName, setNewName] = useState("");
  useEffect(() => setDrafts(rows), [rows]);
  return <OptionPanel title="账户" newName={newName} setNewName={setNewName} onAdd={async () => { await optionRepository.createAccount(DEFAULT_BOOK_ID, newName); setNewName(""); await onChanged("账户已新增"); }}><OptionRows rows={drafts} render={(row, index) => <OptionRow key={row.id} name={row.name} setName={(name) => changeAt(setDrafts, index, { name })} active={row.isActive} setActive={(isActive) => changeAt(setDrafts, index, { isActive })} onMove={(offset) => moveAndPersist("accounts", drafts, setDrafts, index, offset)} onSave={async () => { await optionRepository.updateAccount(row); await onChanged("账户已保存"); }} /> } /></OptionPanel>;
}

function CategoryEditor({ kind, rows, tags, onChanged }: { kind: CategoryKind; rows: Category[]; tags: Tag[]; onChanged: (message: string) => Promise<void> }) {
  const [drafts, setDrafts] = useState(rows);
  const [newName, setNewName] = useState("");
  useEffect(() => setDrafts(rows), [rows]);
  return <OptionPanel title={kind === "expense" ? "支出分类" : "收入分类"} newName={newName} setNewName={setNewName} onAdd={async () => { await optionRepository.createCategory(DEFAULT_BOOK_ID, kind, newName); setNewName(""); await onChanged("分类已新增"); }}><OptionRows rows={drafts} render={(row, index) => <OptionRow key={row.id} name={row.name} setName={(name) => changeAt(setDrafts, index, { name })} active={row.isActive} setActive={(isActive) => changeAt(setDrafts, index, { isActive })} activeLocked={Boolean(row.systemKey)} onMove={(offset) => moveAndPersist("categories", drafts, setDrafts, index, offset)} onSave={async () => { await optionRepository.updateCategory(row); await onChanged("分类已保存"); }} extra={<div className="w-full sm:w-44"><Label className="sr-only">自动标签</Label><select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={row.defaultTagId ?? ""} disabled={Boolean(row.systemKey)} onChange={(event) => changeAt(setDrafts, index, { defaultTagId: event.target.value || null })}><option value="">无自动标签</option>{tags.filter((tag) => tag.isActive).map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></div>} badge={row.systemKey ? "系统分类" : row.isActive ? undefined : "已停用"} /> } /></OptionPanel>;
}

function TagEditor({ kind, rows, onChanged }: { kind: CategoryKind; rows: Tag[]; onChanged: (message: string) => Promise<void> }) {
  const [drafts, setDrafts] = useState(rows);
  const [newName, setNewName] = useState("");
  useEffect(() => setDrafts(rows), [rows]);
  return <OptionPanel title={kind === "expense" ? "支出标签" : "收入标签"} newName={newName} setNewName={setNewName} onAdd={async () => { await optionRepository.createTag(DEFAULT_BOOK_ID, kind, newName); setNewName(""); await onChanged("标签已新增"); }}><OptionRows rows={drafts} render={(row, index) => <OptionRow key={row.id} name={row.name} setName={(name) => changeAt(setDrafts, index, { name })} active={row.isActive} setActive={(isActive) => changeAt(setDrafts, index, { isActive })} onMove={(offset) => moveAndPersist("tags", drafts, setDrafts, index, offset)} onSave={async () => { await optionRepository.updateTag(row); await onChanged("标签已保存"); }} /> } /></OptionPanel>;
}

function OptionPanel({ title, newName, setNewName, onAdd, children }: { title: string; newName: string; setNewName: (value: string) => void; onAdd: () => Promise<void>; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex gap-2"><Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={`新增${title}`} /><Button onClick={onAdd} disabled={!newName.trim()}><Plus className="size-4" />新增</Button></div>{children}</CardContent></Card>;
}

function OptionRows<T>({ rows, render }: { rows: T[]; render: (row: T, index: number) => React.ReactNode }) { return <div className="divide-y divide-border rounded-md border border-border">{rows.map(render)}</div>; }

function OptionRow({ name, setName, active, setActive, activeLocked, onMove, onSave, extra, badge }: { name: string; setName: (value: string) => void; active: boolean; setActive: (value: boolean) => void; activeLocked?: boolean; onMove: (offset: number) => void; onSave: () => Promise<void>; extra?: React.ReactNode; badge?: string }) {
  return <div className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center"><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => onMove(-1)} title="上移"><ArrowUp className="size-4" /></Button><Button size="icon" variant="ghost" onClick={() => onMove(1)} title="下移"><ArrowDown className="size-4" /></Button></div><Input className="min-w-0 flex-1" value={name} onChange={(event) => setName(event.target.value)} />{extra}{badge && <Badge tone={badge === "系统分类" ? "neutral" : "warning"}>{badge}</Badge>}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} disabled={activeLocked} onChange={(event) => setActive(event.target.checked)} />启用</label><Button variant="outline" onClick={onSave}><Save className="size-4" />保存</Button></div>;
}

function changeAt<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, index: number, patch: Partial<T>) { setter((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row)); }

async function moveAndPersist<T extends { id: string }>(entity: "accounts" | "categories" | "tags", rows: T[], setter: React.Dispatch<React.SetStateAction<T[]>>, index: number, offset: number) {
  const target = index + offset;
  if (target < 0 || target >= rows.length) return;
  const next = [...rows];
  [next[index], next[target]] = [next[target], next[index]];
  setter(next);
  await optionRepository.reorder(entity, next.map((row) => row.id));
}
