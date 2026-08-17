import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/utils/cn";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuItem = DropdownMenuPrimitive.Item;

export function DropdownMenuContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content className={cn("z-[70] min-w-48 rounded-md border border-border bg-background p-1 shadow-lg", className)} sideOffset={5} {...props} />
    </DropdownMenuPrimitive.Portal>
  );
}

type DropdownMenuCheckboxItemProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export function DropdownMenuCheckboxItem({ className, children, checked = false, onCheckedChange, onClick, onKeyDown, onPointerUp, type = "button", ...props }: DropdownMenuCheckboxItemProps) {
  const suppressPointerClickRef = useRef(false);
  const pointerClickTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (pointerClickTimerRef.current !== null) window.clearTimeout(pointerClickTimerRef.current);
  }, []);

  const toggle = () => onCheckedChange?.(!checked);
  const suppressFollowingClick = () => {
    suppressPointerClickRef.current = true;
    if (pointerClickTimerRef.current !== null) window.clearTimeout(pointerClickTimerRef.current);
    pointerClickTimerRef.current = window.setTimeout(() => {
      suppressPointerClickRef.current = false;
      pointerClickTimerRef.current = null;
    }, 0);
  };

  return (
    <button
      {...props}
      type={type}
      role="menuitemcheckbox"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      onPointerUp={(event) => {
        onPointerUp?.(event);
        if (event.defaultPrevented || (event.pointerType === "mouse" && event.button !== 0)) return;
        event.preventDefault();
        suppressFollowingClick();
        toggle();
      }}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        if (suppressPointerClickRef.current) {
          suppressPointerClickRef.current = false;
          return;
        }
        toggle();
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          suppressFollowingClick();
          toggle();
        }
      }}
      className={cn("relative flex h-8 w-full select-none items-center rounded-sm border-0 bg-transparent pl-8 pr-2 text-left text-sm outline-none transition-colors focus:bg-primary/5 focus:text-primary data-[highlighted]:bg-primary/5 data-[highlighted]:text-primary data-[state=checked]:bg-primary/10 data-[state=checked]:font-medium data-[state=checked]:text-primary disabled:cursor-not-allowed disabled:opacity-50", className)}
    >
      <span aria-hidden="true" className="absolute left-2 text-primary">{checked && <Check className="size-4" />}</span>
      {children}
    </button>
  );
}
