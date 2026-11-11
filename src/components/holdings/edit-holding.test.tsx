import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
const update = vi.fn((_patch: unknown) => ({
  eq: () => {
    const done = Promise.resolve({ error: null });
    return Object.assign(done, { eq: () => done });
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({ update: (patch: unknown) => update(patch) }),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EditHolding } from "./edit-holding";
import { setLocaleOverride } from "@/lib/locale";
import { parseQuantity } from "@/lib/holdings";

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

beforeEach(() => {
  rpc.mockReset();
  update.mockClear();
});

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

  // Regression: Mark as sold left the old value in net worth until the next price sync.
  it("Mark as sold goes through set_holding_quantity, which also updates today's value", async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    const { invalidate } = setup({ kind: "crypto", symbol: "BTC", source: "Manual" });
    fireEvent.click(screen.getByRole("button", { name: "Mark as sold" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("set_holding_quantity", {
        p_kind: "crypto",
        p_key: "BTC",
        p_quantity: 0,
        p_source: "Manual",
      }),
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["net-worth-daily"] }));
    expect(update).not.toHaveBeenCalled();
  });

  it("falls back to changing the quantity alone before the backend migration", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "missing" } });
    setup({ kind: "stock", isin: "IE00TEST" });
    fireEvent.click(screen.getByRole("button", { name: "Mark as sold" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ shares: 0 }));
  });

  it("a new quantity refreshes returns too, which compare trades with it", async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    const { invalidate } = setup({ kind: "stock", isin: "IE00TEST" });
    fireEvent.change(screen.getByLabelText("How many you hold now"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["holding-performance"] }),
    );
  });

  it("polish-5 #4 audit: fills the box in the chosen format, so saving unchanged keeps 1.125", () => {
    setLocaleOverride("it-IT");
    try {
      render(
        <QueryClientProvider client={new QueryClient()}>
          <EditHolding target={{ kind: "stock", isin: "IE00TEST" }} name="Coin" quantity={1.125} />
        </QueryClientProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Edit Coin" }));
      const box = screen.getByLabelText("How many you hold now") as HTMLInputElement;
      expect(box.value).toBe("1,125");
      expect(parseQuantity(box.value)).toBe(1.125);
    } finally {
      setLocaleOverride("");
    }
  });

  it("left-open #1 says why an unclear quantity like 1,250 is refused", () => {
    setup({ kind: "stock", isin: "IE00TEST" });
    fireEvent.change(screen.getByLabelText("How many you hold now"), {
      target: { value: "1,250" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent('"1,250" could mean 1250 or 1.25');
    expect(rpc).not.toHaveBeenCalled();
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
