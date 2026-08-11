import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { recurrenceRuleService } from "@/services/recurrence-rule-service";
import type { RecurrenceRule } from "@/types/recurrence";
import { MonthlyRuleFields } from "./monthly-rule-fields";
import { WeeklyRuleFields } from "./weekly-rule-fields";
import { YearlyRuleFields } from "./yearly-rule-fields";
import { RulePreview } from "./rule-preview";

const defaultRule: RecurrenceRule = { frequency: "monthly", kind: "day", day: 1 };

export function RecurrenceRuleEditor({ open, onOpenChange, value, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; value: RecurrenceRule; onSave: (rule: RecurrenceRule) => void }) {
  const [draft, setDraft] = useState<RecurrenceRule>(value ?? defaultRule);
  useEffect(() => { if (open) setDraft(value ?? defaultRule); }, [open, value]);
  const validationError = useMemo(() => { try { recurrenceRuleService.validate(draft); return null; } catch (reason) { return reason instanceof Error ? reason.message : String(reason); } }, [draft]);
  const changeFrequency = (frequency: string) => {
    if (frequency === "monthly") setDraft({ frequency: "monthly", kind: "day", day: 1 });
    else if (frequency === "weekly") setDraft({ frequency: "weekly", weekday: 1 });
    else setDraft({ frequency: "yearly", kind: "date", month: 1, day: 1, missingDatePolicy: "lastDay" });
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-xl">
    <DialogHeader><DialogTitle>固定账目日期规则</DialogTitle><DialogDescription>使用中文选项设置重复日期，系统会自动计算实际日期。</DialogDescription></DialogHeader>
    <div className="space-y-4">
      <div className="space-y-1.5"><Label>重复周期</Label><Select value={draft.frequency} onValueChange={changeFrequency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">每月</SelectItem><SelectItem value="weekly">每周</SelectItem><SelectItem value="yearly">每年</SelectItem></SelectContent></Select></div>
      {draft.frequency === "monthly" && <MonthlyRuleFields rule={draft} onChange={setDraft} />}
      {draft.frequency === "weekly" && <WeeklyRuleFields rule={draft} onChange={setDraft} />}
      {draft.frequency === "yearly" && <YearlyRuleFields rule={draft} onChange={setDraft} />}
      <RulePreview rule={draft} />
      {validationError && <p className="text-sm text-destructive" role="alert">{validationError}</p>}
    </div>
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button onClick={() => { if (!validationError) { onSave(draft); onOpenChange(false); } }} disabled={Boolean(validationError)}>保存规则</Button></DialogFooter>
  </DialogContent></Dialog>;
}

export { MonthlyRuleFields } from "./monthly-rule-fields";
export { WeeklyRuleFields } from "./weekly-rule-fields";
export { YearlyRuleFields } from "./yearly-rule-fields";
export { RulePreview } from "./rule-preview";
