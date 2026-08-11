import type { MonthlyRecurrenceRule } from "@/types/recurrence";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

export function MonthlyRuleFields({ rule, onChange }: { rule: MonthlyRecurrenceRule; onChange: (rule: MonthlyRecurrenceRule) => void }) {
  const kind = rule.kind;
  return <div className="space-y-3 rounded-md border border-border p-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="每月规则">
        <Select value={kind} onValueChange={(value) => onChange(value === "day" ? { frequency: "monthly", kind: "day", day: 1 } : { frequency: "monthly", kind: "weekday", weekday: 0, position: "first" })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="day">固定日期</SelectItem><SelectItem value="weekday">第几个星期几</SelectItem></SelectContent>
        </Select>
      </Field>
      {kind === "day" ? <Field label="日期">
        <Select value={String(rule.day)} onValueChange={(value) => onChange({ ...rule, day: value === "last" ? "last" : Number(value), missingDatePolicy: value === "last" || Number(value) < 29 ? undefined : rule.missingDatePolicy })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{Array.from({ length: 31 }, (_, index) => <SelectItem key={index + 1} value={String(index + 1)}>{index + 1} 日</SelectItem>)}<SelectItem value="last">最后一天</SelectItem></SelectContent>
        </Select>
      </Field> : <Field label="星期">
        <Select value={String(rule.weekday)} onValueChange={(value) => onChange({ ...rule, weekday: Number(value) })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{weekdays.map((label, value) => <SelectItem key={value} value={String(value)}>{label}</SelectItem>)}</SelectContent>
        </Select>
      </Field>}
    </div>
    {kind === "weekday" && <Field label="序位">
      <Select value={rule.position} onValueChange={(value) => onChange({ ...rule, position: value as "first" | "second" | "last" })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="first">第一个</SelectItem><SelectItem value="second">第二个</SelectItem><SelectItem value="last">最后一个</SelectItem></SelectContent>
      </Select>
    </Field>}
    {kind === "day" && rule.day !== "last" && rule.day >= 29 && <Field label="遇到没有该日期的月份">
      <Select value={rule.missingDatePolicy ?? "unset"} onValueChange={(value) => onChange({ ...rule, missingDatePolicy: value === "unset" ? undefined : value as "lastDay" | "skip" })}>
        <SelectTrigger><SelectValue placeholder="请选择处理方式" /></SelectTrigger>
        <SelectContent><SelectItem value="unset">请选择</SelectItem><SelectItem value="lastDay">顺延到月底</SelectItem><SelectItem value="skip">跳过该月</SelectItem></SelectContent>
      </Select>
      {!rule.missingDatePolicy && <p className="text-xs text-destructive">请先选择处理方式，规则才能保存。</p>}
    </Field>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0 space-y-1.5"><Label>{label}</Label>{children}</div>;
}
