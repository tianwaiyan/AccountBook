import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportCandidate } from "@/types/domain";

const { importService, backupService } = vi.hoisted(() => ({
  importService: {
    preview: vi.fn(),
    saveMapping: vi.fn(),
    commit: vi.fn(),
    canonicalCsv: vi.fn(),
  },
  backupService: {
    exportCsv: vi.fn(),
    createBackup: vi.fn(),
    restoreBackup: vi.fn(),
  },
}));

vi.mock("@/services/import-registry", () => ({ importService, backupService }));

import { ImportPage } from "@/pages/import-page";

const candidate: ImportCandidate = {
  rowId: "candidate-1",
  source: "alipay",
  occurredAt: "2026-08-08 08:00:00",
  accountName: "支付宝",
  tradeType: "expense",
  amountMinor: -1_000,
  sourceCategory: "餐饮美食",
  sourceTag: "",
  categoryId: "category-food",
  tagId: null,
  statusCode: null,
  remark: "普通消费",
  counterparty: "早餐店",
  paymentChannel: "余额",
  fingerprint: "candidate-fingerprint",
  excludedReason: null,
};

const automaticExcluded: ImportCandidate = {
  ...candidate,
  rowId: "candidate-2",
  occurredAt: "2026-08-08 09:00:00",
  remark: "余额宝收益",
  counterparty: "余额宝",
  paymentChannel: "余额宝",
  fingerprint: "excluded-fingerprint",
  excludedReason: "余额宝收益发放",
};

describe("ImportPage filtering", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    importService.preview.mockResolvedValue({
      candidates: [candidate],
      excluded: [automaticExcluded],
      sourceCategories: [candidate.sourceCategory],
    });
    importService.commit.mockResolvedValue({ inserted: 1, skipped: 0 });
  });

  async function openPreview() {
    const view = render(<ImportPage onChanged={vi.fn()} />);
    const fileInput = view.container.querySelector('input[type="file"]');
    if (!fileInput) throw new Error("file input not found");
    fireEvent.change(fileInput, { target: { files: [new File(["csv"], "alipay.csv", { type: "text/csv" })] } });
    await screen.findByText("普通消费");
    return view;
  }

  it("does not render category mapping controls in the import preview", async () => {
    await openPreview();

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("待分类")).not.toBeInTheDocument();
  });

  it("shows all preview rows and moves manual filters into the shared filtered list", async () => {
    await openPreview();

    expect(screen.getByText("1 条待导入")).toBeInTheDocument();
    expect(screen.getByText("1 条过滤")).toBeInTheDocument();
    expect(screen.getAllByText("余额宝收益发放")).toHaveLength(2);

    const manualFilter = screen.getByRole("checkbox", { name: /手动过滤.*普通消费/ });
    expect(manualFilter).not.toBeChecked();
    fireEvent.click(manualFilter);

    await waitFor(() => expect(screen.getByText("0 条待导入")).toBeInTheDocument());
    expect(screen.getByText("2 条过滤")).toBeInTheDocument();
    expect(screen.getAllByText("手动过滤")).toHaveLength(2);
    expect(screen.getAllByRole("checkbox", { name: /取消过滤/ })).toHaveLength(2);
  });

  it("restores automatic filters and submits only remaining candidates", async () => {
    await openPreview();

    fireEvent.click(screen.getByRole("checkbox", { name: /取消过滤.*余额宝收益/ }));
    await waitFor(() => expect(screen.getByText("2 条待导入")).toBeInTheDocument());
    expect(screen.getByText("0 条过滤")).toBeInTheDocument();
    expect(screen.queryByText("余额宝收益发放")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /手动过滤.*普通消费/ }));
    await waitFor(() => expect(screen.getByText("1 条待导入")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "导入 1 条" }));
    await waitFor(() => expect(importService.commit).toHaveBeenCalledTimes(1));
    expect(importService.commit.mock.calls[0][1]).toEqual([
      expect.objectContaining({ rowId: "candidate-2", excludedReason: null }),
    ]);
  });
});
