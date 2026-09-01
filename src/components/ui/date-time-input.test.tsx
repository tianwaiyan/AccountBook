import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DateTimeInput } from "@/components/ui/date-time-input";

describe("DateTimeInput", () => {
  afterEach(cleanup);

  it("moves to the next segment after a segment is complete", () => {
    const onChange = vi.fn();
    render(<DateTimeInput value="2026-08-08 08:10:00" onChange={onChange} />);

    const year = screen.getByLabelText("交易时间年");
    const month = screen.getByLabelText("交易时间月");
    year.focus();
    fireEvent.change(year, { target: { value: "2027" } });

    expect(onChange).toHaveBeenLastCalledWith("2027-08-08 08:10:00");
    expect(month).toHaveFocus();
  });

  it("pads a one-digit segment when it advances", () => {
    const onChange = vi.fn();
    render(<DateTimeInput value="2026-08-08 08:10:00" onChange={onChange} />);

    const month = screen.getByLabelText("交易时间月");
    const day = screen.getByLabelText("交易时间日");
    month.focus();
    fireEvent.change(month, { target: { value: "8" } });

    expect(onChange).toHaveBeenLastCalledWith("2026-08-08 08:10:00");
    expect(day).toHaveFocus();
  });

  it("fills every empty segment with zero when the control loses focus", () => {
    const onChange = vi.fn();
    render(<DateTimeInput value="" onChange={onChange} />);

    fireEvent.blur(screen.getByLabelText("交易时间年"));

    expect(onChange).toHaveBeenLastCalledWith("0000-00-00 00:00:00");
  });

  it("keeps empty segments in place while editing and pads the active segment on blur", () => {
    const onChange = vi.fn();
    render(<DateTimeInput value="2026--08 08:10:00" onChange={onChange} />);

    const month = screen.getByLabelText("交易时间月");
    const day = screen.getByLabelText("交易时间日");
    expect(month).toHaveValue("");
    expect(day).toHaveValue("08");

    fireEvent.change(month, { target: { value: "9" } });
    fireEvent.blur(month, { relatedTarget: day });

    expect(onChange).toHaveBeenLastCalledWith("2026-09-08 08:10:00");
  });
});
