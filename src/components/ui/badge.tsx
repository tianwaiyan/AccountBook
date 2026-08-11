import { cn } from "@/utils/cn";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "income" | "expense" | "warning" }) {
  const tones = {
    neutral: "bg-muted text-muted-foreground",
    income: "bg-emerald-50 text-emerald-700",
    expense: "bg-rose-50 text-rose-700",
    warning: "bg-amber-50 text-amber-700",
  };
  return <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium", tones[tone], className)} {...props} />;
}

