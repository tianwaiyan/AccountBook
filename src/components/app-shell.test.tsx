import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";

describe("AppShell", () => {
  afterEach(() => cleanup());

  it("collapses and expands the desktop sidebar without changing navigation", () => {
    render(<AppShell page="dashboard" onPageChange={vi.fn()} onQuickEntry={vi.fn()}>内容</AppShell>);

    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
    expect(screen.getByRole("button", { name: "展开侧边栏" })).toBeInTheDocument();
    expect(screen.getByTitle("流水列表")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展开侧边栏" }));
    expect(screen.getByRole("button", { name: "收起侧边栏" })).toBeInTheDocument();
  });
});
