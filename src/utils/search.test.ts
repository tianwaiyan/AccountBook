import { describe, expect, it } from "vitest";
import { matchesKeyword, parseKeywordExpression } from "@/utils/search";

describe("keyword expressions", () => {
  it("gives AND higher priority than OR", () => {
    expect(parseKeywordExpression("水果 AND 超市 OR 咖啡")).toEqual([["水果", "超市"], ["咖啡"]]);
  });

  it("supports Chinese operators", () => {
    expect(matchesKeyword(["社区超市", "水果", ""], "水果 且 超市")).toBe(true);
    expect(matchesKeyword(["咖啡店", "饮品", ""], "水果 或 咖啡")).toBe(true);
    expect(matchesKeyword(["地铁", "交通", ""], "水果 且 超市")).toBe(false);
  });
});

