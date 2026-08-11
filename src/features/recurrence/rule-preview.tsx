import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { recurrenceRuleService } from "@/services/recurrence-rule-service";
import type { RecurrenceRule } from "@/types/recurrence";

export function RulePreview({ rule, referenceDate }: { rule: RecurrenceRule; referenceDate?: Date }) {
  const result = useMemo(() => {
    try {
      return { dates: recurrenceRuleService.nextOccurrences(rule, referenceDate, 3), error: null };
    } catch (reason) {
      return { dates: [] as string[], error: reason instanceof Error ? reason.message : String(reason) };
    }
  }, [rule, referenceDate]);
  return <div className="rounded-md border border-primary/20 bg-primary/5 p-3" aria-live="polite">
    <p className="text-xs font-medium text-primary">未来 3 次实际日期</p>
    {result.error ? <p className="mt-1 text-sm text-destructive">{result.error}</p> : result.dates.length ? <div className="mt-2 flex flex-wrap gap-1.5">{result.dates.map((date) => <Badge key={date}>{date}</Badge>)}</div> : <p className="mt-1 text-sm text-muted-foreground">当前规则暂无可预览日期</p>}
  </div>;
}
