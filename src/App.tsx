import { lazy, Suspense, useState } from "react";
import { AppShell, type PageId } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState, LoadingState } from "@/components/feedback";
import { QuickEntryDialog } from "@/features/transactions/quick-entry-dialog";
import { useReferenceData } from "@/hooks/use-reference-data";

const DashboardPage = lazy(() => import("@/pages/dashboard-page").then((module) => ({ default: module.DashboardPage })));
const TransactionsPage = lazy(() => import("@/pages/transactions-page").then((module) => ({ default: module.TransactionsPage })));
const ImportPage = lazy(() => import("@/pages/import-page").then((module) => ({ default: module.ImportPage })));
const OptionsPage = lazy(() => import("@/pages/options-page").then((module) => ({ default: module.OptionsPage })));
const SettingsPage = lazy(() => import("@/pages/settings-page").then((module) => ({ default: module.SettingsPage })));

export default function App() {
  const [page, setPage] = useState<PageId>("dashboard");
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [transactionsDirty, setTransactionsDirty] = useState(false);
  const [pendingPage, setPendingPage] = useState<PageId | null>(null);
  const { data, loading, error } = useReferenceData(refreshVersion);
  const changed = () => setRefreshVersion((value) => value + 1);

  const requestPage = (nextPage: PageId) => {
    if (nextPage === page) return;
    if (page === "transactions" && transactionsDirty) {
      setPendingPage(nextPage);
      return;
    }
    setPage(nextPage);
  };

  let content: React.ReactNode;
  if (loading) content = <LoadingState label="正在打开账本" />;
  else if (error) content = <ErrorState message={error} />;
  else if (page === "dashboard") content = <DashboardPage referenceData={data} refreshVersion={refreshVersion} />;
  else if (page === "transactions") content = <TransactionsPage referenceData={data} refreshVersion={refreshVersion} onChanged={changed} onDirtyChange={setTransactionsDirty} />;
  else if (page === "import") content = <ImportPage referenceData={data} onChanged={changed} />;
  else if (page === "options") content = <OptionsPage refreshVersion={refreshVersion} onChanged={changed} />;
  else content = <SettingsPage />;

  return <>
    <AppShell page={page} onPageChange={requestPage} onQuickEntry={() => setQuickEntryOpen(true)}><Suspense fallback={<LoadingState />}>{content}</Suspense></AppShell>
    <QuickEntryDialog open={quickEntryOpen} onOpenChange={setQuickEntryOpen} referenceData={data} onSaved={changed} />
    <ConfirmDialog
      open={Boolean(pendingPage)}
      onOpenChange={(open) => { if (!open) setPendingPage(null); }}
      title="放弃未保存修改"
      description="流水草稿尚未保存，离开后将丢失当前编辑内容。"
      confirmLabel="放弃并离开"
      destructive
      onConfirm={() => { if (pendingPage) setPage(pendingPage); setPendingPage(null); }}
    />
  </>;
}
