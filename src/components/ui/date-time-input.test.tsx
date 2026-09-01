import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DateTimeInput } from "@/components/ui/date-time-input";

describe("DateTimeInput", () => {
  afterEach(cleanup);

  it("keeps the original single-input structure and styles", () => {
    render(<DateTimeInput value="2026-08-08 08:10:00" onChange={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "交易时间" }) as HTMLInputElement;

    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(input).toHaveClass("flex", "h-9", "w-full", "rounded-md", "border-input", "bg-background", "px-3");
  });

  it("inserts the next separator and moves the caret after a completed segment", async () => {
    let value = "";
    const onChange = vi.fn((next: string) => { value = next; view.rerender(<DateTimeInput value={value} onChange={onChange} />); });
    const view = render(<DateTimeInput value={value} onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "交易时间" }) as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "2026", selectionStart: 4, selectionEnd: 4 } });

    expect(onChange).toHaveBeenLastCalledWith("2026-");
    await waitFor(() => expect(input.selectionStart).toBe(5));
  });

  it("accepts a compact pasted value and formats all separators", () => {
    const onChange = vi.fn();
    render(<DateTimeInput value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox", { name: "交易时间" }), { target: { value: "20260808081000" } });

    expect(onChange).toHaveBeenLastCalledWith("2026-08-08 08:10:00");
  });

  it("pads incomplete and empty segments with zero on blur", () => {
    const onChange = vi.fn();
    render(<DateTimeInput value="2026-8-9 7:3" onChange={onChange} />);
    fireEvent.blur(screen.getByRole("textbox", { name: "交易时间" }));

    expect(onChange).toHaveBeenLastCalledWith("2026-08-09 07:03:00");
  });

  it("selects the numeric segment under the caret and the next segment after a separator", async () => {
    render(<DateTimeInput value="2026-08-08 08:10:00" onChange={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "交易时间" }) as HTMLInputElement;
    input.focus();
    input.setSelectionRange(6, 6);
    fireEvent.click(input);
    await waitFor(() => {
      expect(input.selectionStart).toBe(5);
      expect(input.selectionEnd).toBe(7);
    });

    input.setSelectionRange(10, 10);
    fireEvent.click(input);
    await waitFor(() => {
      expect(input.selectionStart).toBe(11);
      expect(input.selectionEnd).toBe(13);
    });
  });

  it("selects each date and time segment when clicked", async () => {
    render(<DateTimeInput value="2026-08-08 08:10:00" onChange={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "交易时间" }) as HTMLInputElement;
    const ranges = [[0, 4], [5, 7], [8, 10], [11, 13], [14, 16], [17, 19]];

    for (const [start, end] of ranges) {
      input.focus();
      input.setSelectionRange(start, start);
      fireEvent.click(input);
      await waitFor(() => {
        expect(input.selectionStart).toBe(start);
        expect(input.selectionEnd).toBe(end);
      });
    }
  });

  it("selects an empty segment and the seconds segment at the end", async () => {
    const view = render(<DateTimeInput value="2026-08-" onChange={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "交易时间" }) as HTMLInputElement;
    input.focus();
    input.setSelectionRange(8, 8);
    fireEvent.click(input);
    await waitFor(() => {
      expect(input.selectionStart).toBe(8);
      expect(input.selectionEnd).toBe(8);
    });

    view.rerender(<DateTimeInput value="2026-08-08 08:10:00" onChange={vi.fn()} />);
    input.focus();
    input.setSelectionRange(19, 19);
    fireEvent.click(input);
    await waitFor(() => {
      expect(input.selectionStart).toBe(17);
      expect(input.selectionEnd).toBe(19);
    });
  });

  it("reports invalid completed date and time values without changing the input", () => {
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    render(<DateTimeInput value="2026-02-30 24:60:60" onChange={onChange} onValidityChange={onValidityChange} />);
    const input = screen.getByRole("textbox", { name: "交易时间" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(onValidityChange).toHaveBeenLastCalledWith("日期不符合实际月份");
  });

  it("keeps the original compact cell style", () => {
    render(<DateTimeInput compact value="2026-08-08 08:10:00" onChange={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "交易时间" });

    expect(input).toHaveClass("h-8", "w-full", "rounded-none", "border-transparent", "bg-white", "px-1");
    expect(input).not.toHaveClass("border-input", "bg-background", "px-3");
  });
});
