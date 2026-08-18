import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/utils/cn";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon><ChevronDown className="size-4 text-muted-foreground" /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  viewportClassName,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & { viewportClassName?: string }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className={cn("z-[70] max-h-72 min-w-[8rem] overflow-hidden rounded-md border border-border bg-background shadow-lg", className)}
        position="popper"
        sideOffset={4}
        {...props}
      >
        <SelectPrimitive.Viewport className={cn("p-1", viewportClassName)}>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  showIndicator = true,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & { showIndicator?: boolean }) {
  return (
    <SelectPrimitive.Item
      className={cn("relative flex h-8 cursor-default select-none items-center rounded-sm py-1 pr-2 text-sm outline-none transition-colors focus:bg-primary/5 focus:text-primary data-[highlighted]:bg-primary/5 data-[highlighted]:text-primary data-[state=checked]:bg-primary/10 data-[state=checked]:font-medium data-[state=checked]:text-primary data-[disabled]:opacity-50", showIndicator ? "pl-8" : "pl-2", className)}
      {...props}
    >
      {showIndicator && <span className="absolute left-2 text-primary"><SelectPrimitive.ItemIndicator><Check className="size-4" /></SelectPrimitive.ItemIndicator></span>}
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}
