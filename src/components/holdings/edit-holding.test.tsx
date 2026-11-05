import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EditHolding } from "./edit-holding";

function setup(target: Parameters<typeof EditHolding>[0]["target"]) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <EditHolding target={target} name="Test ETF" quantity={1} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit Test ETF" }));
  return { invalidate };
}

beforeEach(() => rpc.mockReset());

describe("EditHolding delete", () => {
  it("asks to confirm, then deletes the stock and refreshes holdings and net worth", async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    const { invalidate } = setup({ kind: "stock", isin: "IE00TEST" });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("delete_holding", {
        p_kind: "stock",
        p_key: "IE00TEST",
        p_source: null,
      }),
    );
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["portfolio-latest"] }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["net-worth-daily"] });
    // Regression: returns kept the deleted holding's trades until a reload.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["holding-performance"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["holding-trades"] });
  });

  it("a new quantity refreshes returns too, which compare trades with it", async () => {
    const { invalidate } = setup({ kind: "stock", isin: "IE00TEST" });
    fireEvent.change(screen.getByLabelText("How many you hold now"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["holding-performance"] }),
    );
  });

  it("sends the crypto source", async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    setup({ kind: "crypto", symbol: "BTC", source: "Manual" });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("delete_holding", {
        p_kind: "crypto",
        p_key: "BTC",
        p_source: "Manual",
      }),
    );
  });

  it("says the database update is missing when the function is not there yet", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "not found" } });
    setup({ kind: "stock", isin: "IE00TEST" });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/database update/i);
  });
});
