import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AddTransaction } from "./add-transaction";

function open() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <AddTransaction today="2026-11-05" />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
  return { invalidate };
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => rpc.mockReset());

describe("AddTransaction", () => {
  it("adds an expense with today's date and refreshes the lists", async () => {
    rpc.mockResolvedValue({
      data: [{ account_uid: "a", entry_reference: "manual-1" }],
      error: null,
    });
    const { invalidate } = open();
    type("Amount", "45,50");
    type("Description", " Cena ");
    type("From", "Fineco");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("add_manual_transaction", {
        p_booking_date: "2026-11-05",
        p_description: "Cena",
        p_amount: 45.5,
        p_direction: "DBIT",
        p_category: null,
        p_source: "Fineco",
      }),
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["transactions"] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["income"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["accounts"] });
  });

  it("sends money in with its category", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Money in" }));
    type("Amount", "5000");
    type("Description", "Papà");
    type("Category", "Transfer");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        "add_manual_transaction",
        expect.objectContaining({ p_direction: "CRDT", p_category: "Transfer", p_source: null }),
      ),
    );
  });

  it("checks the amount and description before sending", async () => {
    open();
    type("Amount", "abc");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/amount/i);
    type("Amount", "10");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/description/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("says the database update is missing when the function is not there yet", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "not found" } });
    open();
    type("Amount", "10");
    type("Description", "Cena");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/database update/i);
  });
});
