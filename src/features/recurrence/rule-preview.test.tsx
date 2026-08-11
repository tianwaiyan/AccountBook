import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RulePreview } from "@/features/recurrence/rule-preview";

describe("RulePreview", () => {
  it("shows three actual dates without exposing RRULE text", () => {
    render(<RulePreview rule={{ frequency: "monthly", kind: "weekday", weekday: 0, position: "last" }} referenceDate={new Date(2026, 7, 11)} />);
    expect(screen.getByText("2026-08-30")).toBeInTheDocument();
    expect(screen.getByText("2026-09-27")).toBeInTheDocument();
    expect(screen.getByText("2026-10-25")).toBeInTheDocument();
    expect(screen.queryByText(/RRULE|FREQ|BYDAY|cron/i)).toBeNull();
  });
});
