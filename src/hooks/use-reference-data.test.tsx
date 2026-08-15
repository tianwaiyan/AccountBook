import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { optionRepository, transactionRepository } = vi.hoisted(() => ({
  optionRepository: {
    listAccounts: vi.fn(async () => []),
    listCategories: vi.fn(async () => []),
    listTags: vi.fn(async () => []),
  },
  transactionRepository: {
    listAvailableMonths: vi.fn(async () => ["2026-08"]),
  },
}));

vi.mock("@/services/registry", () => ({ optionRepository, transactionRepository }));

import { useReferenceData } from "@/hooks/use-reference-data";

function Harness() {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { data, loading } = useReferenceData(refreshVersion);
  return <div><span>{loading ? "加载中" : "已加载"}</span><span>{data.months.join(",")}</span><button onClick={() => setRefreshVersion((value) => value + 1)}>刷新</button></div>;
}

describe("useReferenceData", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    transactionRepository.listAvailableMonths.mockResolvedValue(["2026-08"]);
  });

  it("keeps the loaded page mounted while refreshing reference data", async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByText("已加载")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    expect(screen.getByText("已加载")).toBeInTheDocument();
    await waitFor(() => expect(transactionRepository.listAvailableMonths).toHaveBeenCalledTimes(2));
  });
});
