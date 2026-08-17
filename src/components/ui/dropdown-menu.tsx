import { Check } from "lucide-react";
import {
  cloneElement,
  createContext,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type LabelHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type MutableRefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/cn";

type DropdownMenuAlign = "start" | "center" | "end";
const POINTER_CLICK_SUPPRESSION_MS = 500;

type DropdownMenuContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: MutableRefObject<HTMLElement | null>;
  contentRef: MutableRefObject<HTMLDivElement | null>;
};

const DropdownMenuContext = createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenuContext(): DropdownMenuContextValue {
  const context = useContext(DropdownMenuContext);
  if (!context) throw new Error("DropdownMenu components must be used inside DropdownMenu");
  return context;
}

export function DropdownMenu({ children, open: controlledOpen, defaultOpen = false, onOpenChange }: { children: ReactNode; open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = useCallback((nextOpen: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [controlledOpen, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || contentRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, setOpen]);

  return <DropdownMenuContext.Provider value={{ open, setOpen, triggerRef, contentRef }}>{children}</DropdownMenuContext.Provider>;
}

type DropdownMenuTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  children?: ReactElement<ButtonHTMLAttributes<HTMLElement>>;
};

export function DropdownMenuTrigger({ asChild = false, children, onPointerDown, onClick, type = "button", ...props }: DropdownMenuTriggerProps) {
  const { open, setOpen, triggerRef } = useDropdownMenuContext();
  const suppressClickRef = useRef(false);
  const suppressClickTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current);
  }, []);

  const toggleFromPointer = (event: React.PointerEvent<HTMLElement>) => {
    if (event.defaultPrevented || (event.pointerType === "mouse" && event.button !== 0)) return;
    setOpen(!open);
    suppressClickRef.current = true;
    if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current);
    suppressClickTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      suppressClickTimerRef.current = null;
    }, POINTER_CLICK_SUPPRESSION_MS);
  };

  const toggleFromClick = (event: React.MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setOpen(!open);
  };

  const triggerProps = {
    ...props,
    type,
    "aria-haspopup": "menu" as const,
    "aria-expanded": open,
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      onPointerDown?.(event as React.PointerEvent<HTMLButtonElement>);
      toggleFromPointer(event);
    },
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      onClick?.(event as React.MouseEvent<HTMLButtonElement>);
      toggleFromClick(event);
    },
  };

  if (asChild && children) {
    return cloneElement(children, {
      ...children.props,
      ...triggerProps,
      ref: (node: HTMLElement | null) => { triggerRef.current = node; },
    } as Partial<ButtonHTMLAttributes<HTMLElement>> & { ref: (node: HTMLElement | null) => void });
  }

  return <button ref={(node) => { triggerRef.current = node; }} {...triggerProps} />;
}

type DropdownMenuContentProps = HTMLAttributes<HTMLDivElement> & {
  align?: DropdownMenuAlign;
};

export function DropdownMenuContent({ className, align = "start", children, style, ...props }: DropdownMenuContentProps) {
  const { open, triggerRef, contentRef } = useDropdownMenuContext();
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const content = contentRef.current;
    if (!trigger) return;
    const triggerRect = trigger.getBoundingClientRect();
    const contentWidth = content?.offsetWidth ?? 192;
    const contentHeight = content?.offsetHeight ?? 0;
    const viewportPadding = 8;
    const preferredLeft = align === "end" ? triggerRect.right - contentWidth : align === "center" ? triggerRect.left + (triggerRect.width - contentWidth) / 2 : triggerRect.left;
    const left = Math.max(viewportPadding, Math.min(preferredLeft, window.innerWidth - contentWidth - viewportPadding));
    const preferredTop = triggerRect.bottom + 5;
    const top = preferredTop + contentHeight + viewportPadding <= window.innerHeight || triggerRect.top < contentHeight + viewportPadding + 5
      ? preferredTop
      : Math.max(viewportPadding, triggerRect.top - contentHeight - 5);
    setPosition({ left, top });
  }, [align, contentRef, triggerRef]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  if (!open) return null;
  return createPortal(
    <div
      {...props}
      ref={contentRef}
      role="menu"
      aria-orientation="vertical"
      className={cn("z-[70] min-w-48 rounded-md border border-border bg-background p-1 shadow-lg", className)}
      style={{ position: "fixed", left: position?.left ?? 8, top: position?.top ?? 8, visibility: position ? "visible" : "hidden", ...style }}
    >
      {children}
    </div>,
    document.body,
  );
}

type DropdownMenuItemProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function DropdownMenuItem({ className, children, disabled = false, onClick, type = "button", ...props }: DropdownMenuItemProps) {
  const { setOpen } = useDropdownMenuContext();
  return (
    <button
      {...props}
      type={type}
      role="menuitem"
      disabled={disabled}
      data-disabled={disabled ? "" : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !disabled) setOpen(false);
      }}
      className={cn("flex h-8 w-full select-none items-center rounded-sm border-0 bg-transparent px-2 text-left text-sm outline-none transition-colors hover:bg-primary/5 focus:bg-primary/5 focus:text-primary disabled:cursor-not-allowed disabled:opacity-50", className)}
    >
      {children}
    </button>
  );
}

type DropdownMenuCheckboxItemProps = Omit<LabelHTMLAttributes<HTMLLabelElement>, "onChange"> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export function DropdownMenuCheckboxItem({ className, children, checked = false, onCheckedChange, onClick, onKeyDown, onPointerUp, ...props }: DropdownMenuCheckboxItemProps) {
  const suppressPointerClickRef = useRef(false);
  const pointerClickTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (pointerClickTimerRef.current !== null) window.clearTimeout(pointerClickTimerRef.current);
  }, []);

  const suppressFollowingClick = () => {
    suppressPointerClickRef.current = true;
    if (pointerClickTimerRef.current !== null) window.clearTimeout(pointerClickTimerRef.current);
    pointerClickTimerRef.current = window.setTimeout(() => {
      suppressPointerClickRef.current = false;
      pointerClickTimerRef.current = null;
    }, POINTER_CLICK_SUPPRESSION_MS);
  };

  return (
    <label
      {...props}
      role="menuitemcheckbox"
      aria-checked={checked}
      tabIndex={0}
      data-state={checked ? "checked" : "unchecked"}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          suppressFollowingClick();
          onCheckedChange?.(!checked);
        }
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event);
        if (event.defaultPrevented || (event.pointerType === "mouse" && event.button !== 0)) return;
        event.preventDefault();
        suppressFollowingClick();
        onCheckedChange?.(!checked);
      }}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        if (suppressPointerClickRef.current) {
          suppressPointerClickRef.current = false;
          return;
        }
        onCheckedChange?.(!checked);
      }}
      className={cn("relative flex min-h-8 w-full select-none items-center gap-2 rounded-sm px-2 text-left text-sm outline-none transition-colors hover:bg-primary/5 focus:bg-primary/5 focus:text-primary data-[state=checked]:bg-primary/10 data-[state=checked]:font-medium data-[state=checked]:text-primary", className)}
    >
      <input
        type="checkbox"
        checked={checked}
        tabIndex={-1}
        aria-hidden="true"
        readOnly
        onChange={() => undefined}
        className="sr-only"
      />
      <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center text-primary">{checked && <Check className="size-4" />}</span>
      <span className="min-w-0">{children}</span>
    </label>
  );
}
