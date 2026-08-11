import { describe, expect, it } from "vitest";
import { recurrenceRuleService } from "@/services/recurrence-rule-service";

describe("recurrenceRuleService", () => {
  it("previews the last Sunday of the next three months", () => {
    expect(recurrenceRuleService.nextOccurrences({ frequency: "monthly", kind: "weekday", weekday: 0, position: "last" }, new Date(2026, 7, 11))).toEqual([
      "2026-08-30",
      "2026-09-27",
      "2026-10-25",
    ]);
  });

  it("handles a fixed day by moving to month end when configured", () => {
    expect(recurrenceRuleService.occurrencesForMonth({ frequency: "monthly", kind: "day", day: 31, missingDatePolicy: "lastDay" }, "2026-02")).toEqual(["2026-02-28"]);
    expect(recurrenceRuleService.occurrencesForMonth({ frequency: "monthly", kind: "day", day: 31, missingDatePolicy: "lastDay" }, "2028-02")).toEqual(["2028-02-29"]);
    expect(recurrenceRuleService.nextOccurrences({ frequency: "monthly", kind: "day", day: 31, missingDatePolicy: "lastDay" }, new Date(2026, 7, 11), 2)).toEqual(["2026-08-31", "2026-09-30"]);
  });

  it("skips a fixed day when the month does not contain it", () => {
    expect(recurrenceRuleService.occurrencesForMonth({ frequency: "monthly", kind: "day", day: 31, missingDatePolicy: "skip" }, "2026-02")).toEqual([]);
    expect(recurrenceRuleService.occurrencesForMonth({ frequency: "monthly", kind: "day", day: 31, missingDatePolicy: "skip" }, "2026-01")).toEqual(["2026-01-31"]);
  });

  it("supports weekly and yearly rules", () => {
    expect(recurrenceRuleService.occurrencesForMonth({ frequency: "weekly", weekday: 1 }, "2026-08")).toEqual([
      "2026-08-03",
      "2026-08-10",
      "2026-08-17",
      "2026-08-24",
      "2026-08-31",
    ]);
    expect(recurrenceRuleService.occurrencesForMonth({ frequency: "yearly", kind: "date", month: 2, day: 29, missingDatePolicy: "lastDay" }, "2027-02")).toEqual(["2027-02-28"]);
  });

  it("serializes only validated structured rules", () => {
    const rule = { frequency: "monthly", kind: "day", day: 15, missingDatePolicy: "skip" } as const;
    expect(recurrenceRuleService.deserialize(recurrenceRuleService.serialize(rule))).toEqual(rule);
    expect(() => recurrenceRuleService.deserialize({ frequency: "monthly", kind: "day", day: 31 })).toThrow("处理方式");
  });
});
