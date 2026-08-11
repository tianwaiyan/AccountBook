import { AlertCircle, LoaderCircle } from "lucide-react";

export function LoadingState({ label = "正在加载" }: { label?: string }) {
  return <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{label}</div>;
}

export function ErrorState({ message }: { message: string }) {
  return <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-destructive"><AlertCircle className="size-4" />{message}</div>;
}

