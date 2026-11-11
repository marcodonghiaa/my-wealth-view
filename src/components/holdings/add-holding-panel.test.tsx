import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AddHoldingPanel } from "./add-holding-panel";

describe("AddHoldingPanel", () => {
  it("left-open #1 says why an unclear amount like 1,250 is refused", async () => {
    invoke.mockResolvedValue({
      data: { results: [{ id: "btc", symbol: "BTC", name: "Bitcoin", detail: "" }] },
      error: null,
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AddHoldingPanel kind="crypto" defaultOpen />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "bitcoin" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(await screen.findByLabelText("Amount"), { target: { value: "1,250" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert")).toHaveTextContent('"1,250" could mean 1250 or 1.25');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
