import { Fragment, memo, useRef } from "react";
import type { FocusEvent, KeyboardEvent } from "react";
import { cn } from "@/utils/cn";

const SEGMENTS = [
  { label: "年", length: 4, separator: "-", width: "w-9", wideWidth: "w-12", singleDigitMax: null },
  { label: "月", length: 2, separator: "-", width: "w-5", wideWidth: "w-7", singleDigitMax: 1 },
  { label: "日", length: 2, separator: " ", width: "w-5", wideWidth: "w-7", singleDigitMax: 3 },
  { label: "时", length: 2, separator: ":", width: "w-5", wideWidth: "w-7", singleDigitMax: 2 },
  { label: "分", length: 2, separator: ":", width: "w-5", wideWidth: "w-7", singleDigitMax: 5 },
  { label: "秒", length: 2, separator: "", width: "w-5", wideWidth: "w-7", singleDigitMax: 5 },
] as const;

type DateTimeParts = [string, string, string, string, string, string];

export interface DateTimeInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

export const DateTimeInput = memo(function DateTimeInput({ value, onChange, onBlur, className, compact = false, disabled = false, ariaLabel = "交易时间" }: DateTimeInputProps) {
  const parts = splitDateTime(value);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const updatePart = (index: number, rawValue: string) => {
    const nextValue = rawValue.replace(/\D/g, "").slice(0, SEGMENTS[index].length);
    const next = copyParts(parts);
    next[index] = nextValue;
    if (shouldAdvance(index, nextValue)) {
      next[index] = padSegment(nextValue, SEGMENTS[index].length);
      onChange(composeDateTime(next));
      inputRefs.current[index + 1]?.focus();
      return;
    }
    onChange(composeDateTime(next));
  };

  const padPartOnBlur = (index: number) => {
    const current = parts[index];
    if (!current || current.length >= SEGMENTS[index].length) return;
    const next = copyParts(parts);
    next[index] = padSegment(current, SEGMENTS[index].length);
    onChange(composeDateTime(next));
  };

  const handleContainerBlur = (event: FocusEvent<HTMLDivElement>) => {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
    const normalized = normalizeDateTimeParts(parts);
    if (composeDateTime(normalized) !== composeDateTime(parts)) onChange(composeDateTime(normalized));
    onBlur?.();
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    if (event.key === "ArrowRight" && input.selectionStart === input.value.length && index < SEGMENTS.length - 1) {
      event.preventDefault();
      inputRefs.current[index + 1]?.focus();
    } else if (event.key === "ArrowLeft" && input.selectionStart === 0 && index > 0) {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === "Backspace" && !input.value && input.selectionStart === 0 && index > 0) {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }
  };

  return <div role="group" aria-label={ariaLabel} className={cn("flex min-w-0 items-center whitespace-nowrap", className)} onBlurCapture={handleContainerBlur}>
    {SEGMENTS.map((segment, index) => <Fragment key={segment.label}>
      <input
        ref={(element) => { inputRefs.current[index] = element; }}
        className={cn("rounded-md border border-input bg-background px-0 text-center outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50", compact ? "h-8 text-xs" : "h-9 text-sm", compact ? segment.width : segment.wideWidth)}
        type="text"
        inputMode="numeric"
        maxLength={segment.length}
        placeholder={"0".repeat(segment.length)}
        aria-label={`${ariaLabel}${segment.label}`}
        value={parts[index]}
        onChange={(event) => updatePart(index, event.target.value)}
        onBlur={() => padPartOnBlur(index)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => handleKeyDown(index, event)}
        disabled={disabled}
      />
      {segment.separator && <span className="px-0.5 text-muted-foreground" aria-hidden="true">{segment.separator}</span>}
    </Fragment>)}
  </div>;
});

function splitDateTime(value: string): DateTimeParts {
  const normalized = value.trim().replace("T", " ");
  const structured = normalized.match(/^(\d*)-(\d*)-(\d*)\s+(\d*):(\d*):(\d*)$/);
  const values = structured ? structured.slice(1) : normalized.match(/\d+/g) ?? [];
  return SEGMENTS.map((segment, index) => values[index]?.slice(0, segment.length) ?? "") as DateTimeParts;
}

function copyParts(parts: DateTimeParts): DateTimeParts {
  return [...parts] as DateTimeParts;
}

function composeDateTime(parts: DateTimeParts): string {
  return `${parts[0]}-${parts[1]}-${parts[2]} ${parts[3]}:${parts[4]}:${parts[5]}`;
}

function normalizeDateTimeParts(parts: DateTimeParts): DateTimeParts {
  return SEGMENTS.map((segment, index) => padSegment(parts[index], segment.length)) as DateTimeParts;
}

function padSegment(value: string, length: number): string {
  return value.padStart(length, "0").slice(-length);
}

function shouldAdvance(index: number, value: string): boolean {
  if (value.length >= SEGMENTS[index].length) return true;
  return value.length === 1 && index > 0 && SEGMENTS[index].singleDigitMax !== null && Number(value) > SEGMENTS[index].singleDigitMax;
}
