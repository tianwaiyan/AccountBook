import { forwardRef, memo, useRef } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { cn } from "@/utils/cn";

const SEGMENT_LENGTHS = [4, 2, 2, 2, 2, 2] as const;
const SEPARATORS = ["-", "-", " ", ":", ":", ""] as const;
const ADVANCE_DIGIT_COUNTS = new Set([4, 6, 8, 10, 12]);

type DateTimeParts = [string, string, string, string, string, string];

const FORM_INPUT_CLASS = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const CELL_INPUT_CLASS = "h-8 w-full min-w-0 rounded-none border border-transparent bg-white px-1 text-sm outline-none transition-shadow focus-visible:border-input focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export interface DateTimeInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

export const DateTimeInput = memo(forwardRef<HTMLInputElement, DateTimeInputProps>(function DateTimeInput({ value, onChange, onBlur, className, compact = false, disabled = false, ariaLabel = "交易时间" }, forwardedRef) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const assignRef = (element: HTMLInputElement | null) => {
    inputRef.current = element;
    if (typeof forwardedRef === "function") forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  };

  const scheduleCaret = (position: number) => {
    const update = () => {
      const input = inputRef.current;
      if (!input || document.activeElement !== input) return;
      input.setSelectionRange(position, position);
    };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(update);
    else window.setTimeout(update, 0);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.currentTarget.value;
    const caret = event.currentTarget.selectionStart ?? rawValue.length;
    const nextValue = formatPartialDateTime(rawValue);
    onChange(nextValue);
    scheduleCaret(getCaretPosition(rawValue, nextValue, caret));
  };

  const handleBlur = () => {
    const normalized = composeDateTime(normalizeDateTimeParts(splitDateTime(value)));
    if (normalized !== value) onChange(normalized);
    onBlur?.();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    if (event.key === "-" || event.key === ":" || event.key === " ") {
      const caret = input.selectionStart ?? 0;
      if (caret === input.selectionEnd && input.value[caret] === event.key) {
        event.preventDefault();
        input.setSelectionRange(caret + 1, caret + 1);
      }
    }
  };

  return <input ref={assignRef} className={cn(compact ? CELL_INPUT_CLASS : FORM_INPUT_CLASS, className)} type="text" inputMode="numeric" aria-label={ariaLabel} value={value} onChange={handleChange} onBlur={handleBlur} onKeyDown={handleKeyDown} disabled={disabled} />;
}));

DateTimeInput.displayName = "DateTimeInput";

function splitDateTime(value: string): DateTimeParts {
  const normalized = value.trim().replace("T", " ");
  if (!normalized) return ["", "", "", "", "", ""];

  if (/[-\s:]/.test(normalized)) {
    const [datePart = "", timePart = ""] = normalized.split(/\s+/, 2);
    const dateValues = datePart.split("-");
    const timeValues = timePart.split(":");
    return [
      digitsOnly(dateValues[0] ?? "").slice(0, 4),
      digitsOnly(dateValues[1] ?? "").slice(0, 2),
      digitsOnly(dateValues[2] ?? "").slice(0, 2),
      digitsOnly(timeValues[0] ?? "").slice(0, 2),
      digitsOnly(timeValues[1] ?? "").slice(0, 2),
      digitsOnly(timeValues[2] ?? "").slice(0, 2),
    ];
  }

  let offset = 0;
  const digits = digitsOnly(normalized).slice(0, 14);
  return SEGMENT_LENGTHS.map((length) => {
    const part = digits.slice(offset, offset + length);
    offset += length;
    return part;
  }) as DateTimeParts;
}

function formatPartialDateTime(value: string): string {
  return composePartialDateTime(splitDateTime(value));
}

function composePartialDateTime(parts: DateTimeParts): string {
  let result = "";
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (index === 0) {
      result = part;
      continue;
    }
    const previous = parts[index - 1];
    if (previous.length === SEGMENT_LENGTHS[index - 1] || part.length > 0) result += SEPARATORS[index - 1] + part;
    else break;
  }
  return result;
}

function composeDateTime(parts: DateTimeParts): string {
  return `${parts[0]}-${parts[1]}-${parts[2]} ${parts[3]}:${parts[4]}:${parts[5]}`;
}

function normalizeDateTimeParts(parts: DateTimeParts): DateTimeParts {
  return SEGMENT_LENGTHS.map((length, index) => parts[index].padStart(length, "0").slice(-length)) as DateTimeParts;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function getCaretPosition(rawValue: string, formattedValue: string, rawCaret: number): number {
  const digitsBeforeCaret = digitsOnly(rawValue.slice(0, rawCaret)).length;
  let seen = 0;
  for (let index = 0; index < formattedValue.length; index += 1) {
    if (!/\d/.test(formattedValue[index])) continue;
    seen += 1;
    if (seen === digitsBeforeCaret) {
      const nextPosition = index + 1;
      if (ADVANCE_DIGIT_COUNTS.has(digitsBeforeCaret) && formattedValue[nextPosition]) return nextPosition + 1;
      return nextPosition;
    }
  }
  return formattedValue.length;
}
