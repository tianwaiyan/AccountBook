import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WeeklyRecurrenceRule } from "@/types/recurrence";

const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

export function WeeklyRuleFields({ rule, onChange }: { rule: WeeklyRecurrenceRule; onChange: (rule: WeeklyRecurrenceRule) => void }) {
  return <div className="rounded-md border border-border p-3"><Label>每周星期</Label><div className="mt-1.5"><Select value={String(rule.weekday)} onValueChange={(value) => onChange({ ...rule, weekday: Number(value) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{weekdays.map((label, value) => <SelectItem key={value} value={String(value)}>{label}</SelectItem>)}</SelectContent></Select></div></div>;
}
