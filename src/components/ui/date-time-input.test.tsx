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

  it("keeps the original compact cell style", () => {
    render(<DateTimeInput compact value="2026-08-08 08:10:00" onChange={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "交易时间" });

    expect(input).toHaveClass("h-8", "w-full", "rounded-none", "border-transparent", "bg-white", "px-1");
    expect(input).not.toHaveClass("border-input", "bg-background", "px-3");
  });
});
