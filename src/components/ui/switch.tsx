import * as React from "react";
import { cn } from "@/utils/cn";

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked = false, onCheckedChange, className, disabled, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border border-transparent bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <span className={cn("pointer-events-none absolute text-[10px] font-semibold leading-none", checked ? "left-1 text-primary-foreground" : "right-1 text-muted-foreground")}>
        {checked ? "开启" : "关闭"}
      </span>
      <span className={cn("pointer-events-none absolute left-1 size-5 rounded-full bg-background shadow-sm transition-transform", checked && "translate-x-7")} />
    </button>
  ),
);
Switch.displayName = "Switch";
