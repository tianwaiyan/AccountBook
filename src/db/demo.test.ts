import { afterEach, describe, expect, it } from "vitest";
import { DemoTransactionRepository } from "@/db/demo";
import type { ImportCandidate } from "@/types/domain";

const defaultBookId = "book-default";

function candidate(overrides: Partial<ImportCandidate> = {}): ImportCandidate {
  return {
    rowId: "demo-candidate",
    source: "canonical_csv",
    occurredAt: "2026-08-08 08:10:00",
    accountName: "微信",
    tradeType: "expense",
    amountMinor: -1_850,
    sourceCategory: "餐饮美食",
    sourceTag: "",
    categoryId: null,
    tagId: null,
    statusCode: null,
    remark: "修改后的备注",
    counterparty: "社区早餐店",
    paymentChannel: "微信",
    fingerprint: "v2-demo-candidate",
    excludedReason: null,
    ...overrides,
  };
}

describe("DemoTransactionRepository.commitImport", () => {
  let createdIds: string[] = [];

  afterEach(async () => {
    if (!createdIds.length) return;
    await new DemoTransactionRepository().softDelete(createdIds);
    createdIds = [];
  });

  it("deduplicates an existing manual row even when the remark changed", async () => {
    const result = await new DemoTransactionRepository().commitImport(defaultBookId, [candidate()]);

    expect(result).toEqual({ inserted: 0, skipped: 1 });
  });

  it("skips a later candidate with the same business fields in one batch", async () => {
    const repository = new DemoTransactionRepository();
    const first = candidate({
      rowId: "demo-first",
      occurredAt: "2099-01-02 03:04:05",
      accountName: "现金",
      amountMinor: -321,
      counterparty: "测试商户",
      paymentChannel: "现金",
    });
    const second = { ...first, rowId: "demo-second", fingerprint: "v2-demo-second", remark: "另一条备注" };

    const result = await repository.commitImport(defaultBookId, [first, second]);
    const rows = await repository.list({ bookId: defaultBookId, yearMonth: "2099-01" });
    createdIds = rows.filter((row) => row.counterparty === "测试商户").map((row) => row.id);

    expect(result).toEqual({ inserted: 1, skipped: 1 });
    expect(createdIds).toHaveLength(1);
  });
});
