import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { settingsRepository, syncService } = vi.hoisted(() => ({
  settingsRepository: {
    get: vi.fn(async <T,>(_key: string, fallback: T) => fallback),
    set: vi.fn(async () => undefined),
  },
  syncService: { getStatus: vi.fn(async () => ({ mode: "local-only" })) },
}));

vi.mock("@/services/registry", () => ({ settingsRepository, syncService }));

import { SettingsPage } from "@/pages/settings-page";

describe("SettingsPage", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a right-aligned switch for WebView2 cleanup and saves changes", async () => {
    render(<SettingsPage />);

    const cleanupSwitch = await screen.findByRole("switch", { name: "退出时清理 WebView2 浏览数据" });
    await waitFor(() => expect(cleanupSwitch).toHaveAttribute("aria-checked", "true"));
    expect(cleanupSwitch).toHaveAttribute("data-state", "checked");

    fireEvent.click(cleanupSwitch);

    await waitFor(() => expect(settingsRepository.set).toHaveBeenCalledWith("clear_webview_data_on_exit", false));
    expect(cleanupSwitch).toHaveAttribute("aria-checked", "false");
    expect(cleanupSwitch).toHaveAttribute("data-state", "unchecked");
  });
});
