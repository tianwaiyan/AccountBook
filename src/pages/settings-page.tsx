import { CalendarClock, CloudOff, DatabaseZap } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { settingsRepository, syncService } from "@/services/registry";
import type { TransactionDateDisplay } from "@/utils/date";

export function SettingsPage() {
  return <Tabs defaultValue="local-data">
    <TabsList><TabsTrigger value="local-data">本地数据</TabsTrigger><TabsTrigger value="sync">同步</TabsTrigger></TabsList>
    <TabsContent value="local-data"><LocalDataPanel /></TabsContent>
    <TabsContent value="sync"><SyncPanel /></TabsContent>
  </Tabs>;
}

function SyncPanel() {
  const [status, setStatus] = useState("local-only");
  useEffect(() => { void syncService.getStatus().then((result) => setStatus(result.mode)); }, []);
  return <Card><CardContent className="flex items-center gap-4 p-5"><span className="flex size-10 items-center justify-center rounded-md bg-muted"><CloudOff className="size-5 text-muted-foreground" /></span><div><p className="text-sm font-medium">仅本地模式</p><p className="text-xs text-muted-foreground">{status === "local-only" ? "云同步接口已预留，当前未连接服务器" : status}</p></div></CardContent></Card>;
}

function LocalDataPanel() {
  const [clearOnExit, setClearOnExit] = useState(true);
  const [dateDisplay, setDateDisplay] = useState<TransactionDateDisplay>("full");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([
      settingsRepository.get("clear_webview_data_on_exit", true),
      settingsRepository.get<TransactionDateDisplay>("transaction_date_display", "full"),
    ]).then(([clear, display]) => { setClearOnExit(clear); setDateDisplay(display); });
  }, []);

  const changeClearOnExit = async (checked: boolean) => {
    setSaving(true);
    try {
      await settingsRepository.set("clear_webview_data_on_exit", checked);
      setClearOnExit(checked);
    } finally {
      setSaving(false);
    }
  };

  const changeDateDisplay = async (display: TransactionDateDisplay) => {
    setSaving(true);
    try {
      await settingsRepository.set("transaction_date_display", display);
      setDateDisplay(display);
    } finally {
      setSaving(false);
    }
  };

  return <Card><CardHeader><CardTitle>本地数据</CardTitle></CardHeader><CardContent className="space-y-5"><label className="flex cursor-pointer items-start gap-3"><Checkbox checked={clearOnExit} disabled={saving} onCheckedChange={(checked) => { void changeClearOnExit(checked === true); }} aria-label="退出时清理 WebView2 浏览数据" /><span className="grid gap-1"><span className="flex items-center gap-2 text-sm font-medium"><DatabaseZap className="size-4" />退出时清理 WebView2 浏览数据</span><span className="text-xs text-muted-foreground">清理缓存、Cookie 和站点数据；不会删除账本数据库或备份。</span></span></label><div className="flex flex-wrap items-start gap-3"><CalendarClock className="mt-0.5 size-4 text-muted-foreground" /><label className="grid min-w-56 gap-1 text-sm font-medium">流水日期显示<select className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal" value={dateDisplay} disabled={saving} onChange={(event) => { void changeDateDisplay(event.target.value as TransactionDateDisplay); }}><option value="full">完整：YYYY-MM-DD HH:mm:ss</option><option value="short">简短：YYYY-MM-DD</option></select><span className="text-xs font-normal text-muted-foreground">只影响流水列表显示，数据库仍保存完整日期时间。</span></label></div></CardContent></Card>;
}
