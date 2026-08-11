import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { YearlyRecurrenceRule } from "@/types/recurrence";

export function YearlyRuleFields({ rule, onChange }: { rule: YearlyRecurrenceRule; onChange: (rule: YearlyRecurrenceRule) => void }) {
  return <div className="space-y-3 rounded-md border border-border p-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="月份"><Select value={String(rule.month)} onValueChange={(value) => onChange({ ...rule, month: Number(value) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 12 }, (_, index) => <SelectItem key={index + 1} value={String(index + 1)}>{index + 1} 月</SelectItem>)}</SelectContent></Select></Field>
      <Field label="日期"><Select value={String(rule.day)} onValueChange={(value) => onChange({ ...rule, day: Number(value) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 31 }, (_, index) => <SelectItem key={index + 1} value={String(index + 1)}>{index + 1} 日</SelectItem>)}</SelectContent></Select></Field>
    </div>
    <Field label="遇到没有该日期的年份或月份"><Select value={rule.missingDatePolicy} onValueChange={(value) => onChange({ ...rule, missingDatePolicy: value as "lastDay" | "skip" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="lastDay">顺延到月底</SelectItem><SelectItem value="skip">跳过该次</SelectItem></SelectContent></Select></Field>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0 space-y-1.5"><Label>{label}</Label>{children}</div>;
}
