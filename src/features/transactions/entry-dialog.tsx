import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReferenceData } from "@/hooks/use-reference-data";
import { BatchPresetForm } from "@/features/monthly-presets/batch-preset-dialog";
import { QuickEntryForm } from "@/features/transactions/quick-entry-dialog";
import { currentYearMonth } from "@/utils/date";

type EntryMode = "single" | "preset";

export function EntryDialog({ open, onOpenChange, referenceData, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; referenceData: ReferenceData; onSaved: () => void }) {
  const [mode, setMode] = useState<EntryMode>("single");

  useEffect(() => {
    if (!open) setMode("single");
  }, [open]);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none">
      <DialogHeader>
        <DialogTitle>记一笔</DialogTitle>
        <DialogDescription>选择单笔记账或按月度预设生成流水。</DialogDescription>
      </DialogHeader>
      <Tabs value={mode} onValueChange={(value) => setMode(value as EntryMode)}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="single">单笔记账</TabsTrigger>
          <TabsTrigger value="preset">预设记账</TabsTrigger>
        </TabsList>
        <TabsContent value="single">
          <QuickEntryForm referenceData={referenceData} onSaved={onSaved} onCancel={() => onOpenChange(false)} />
        </TabsContent>
        <TabsContent value="preset">
          <BatchPresetForm active={open && mode === "preset"} selectedMonth={currentYearMonth()} onGenerated={onSaved} onCancel={() => onOpenChange(false)} />
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>;
}
