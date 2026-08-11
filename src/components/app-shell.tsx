import { LayoutDashboard, List, ListTree, Plus, Settings, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

export type PageId = "dashboard" | "transactions" | "import" | "options" | "settings";

const navigation: Array<{ id: PageId; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "概览", icon: LayoutDashboard },
  { id: "transactions", label: "流水列表", icon: List },
  { id: "import", label: "导入账单", icon: Upload },
  { id: "options", label: "选项管理", icon: ListTree },
  { id: "settings", label: "设置", icon: Settings },
];

export function AppShell({
  page,
  onPageChange,
  onQuickEntry,
  children,
}: {
  page: PageId;
  onPageChange: (page: PageId) => void;
  onQuickEntry: () => void;
  children: React.ReactNode;
}) {
  const title = navigation.find((item) => item.id === page)?.label ?? "AccountBook";
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-card lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b border-border px-5">
          <div><p className="text-base font-semibold">AccountBook</p><p className="text-xs text-muted-foreground">我的账本</p></div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => onPageChange(id)} className={cn("flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground", page === id && "bg-accent font-medium text-foreground")}>
              <Icon className="size-4" />{label}
            </button>
          ))}
        </nav>
        <div className="border-t border-border p-3 text-xs text-muted-foreground">本地 SQLite</div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
          <h1 className="text-lg font-semibold">{title}</h1>
          {page !== "settings" && page !== "options" && <Button onClick={onQuickEntry}><Plus className="size-4" /><span className="hidden sm:inline">记一笔</span></Button>}
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-3 pb-24 pt-4 sm:px-6 sm:pt-6 lg:pb-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-border bg-background px-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {navigation.slice(0, 2).map(({ id, label, icon: Icon }) => <MobileNav key={id} active={page === id} label={label} icon={Icon} onClick={() => onPageChange(id)} />)}
        <button onClick={onQuickEntry} className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-primary"><span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground"><Plus className="size-5" /></span>记账</button>
        {navigation.slice(2).map(({ id, label, icon: Icon }) => <MobileNav key={id} active={page === id} label={label} icon={Icon} onClick={() => onPageChange(id)} />)}
      </nav>
    </div>
  );
}

function MobileNav({ active, label, icon: Icon, onClick }: { active: boolean; label: string; icon: typeof LayoutDashboard; onClick: () => void }) {
  return <button onClick={onClick} className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-xs text-muted-foreground", active && "font-medium text-primary")}><Icon className="size-5" />{label}</button>;
}
