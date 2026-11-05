import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
let existing: Array<object> = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({
      select: () => ({ gte: () => ({ lte: async () => ({ data: existing, error: null }) }) }),
    }),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ImportStatement } from "./import-statement";

const CSV = [
  "Conto Corrente: 1234",
  "Data;Entrate;Uscite;Descrizione",
  "25/04/2026;;45,50;Ristorante Mario",
  "24/04/2026;5.000,00;;Bonifico papà",
].join("\n");

function upload(name: string, content: string) {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <ImportStatement />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Import statement" }));
  const file = new File([content], name, { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("Statement file"), { target: { files: [file] } });
  return { invalidate };
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [], error: null });
  existing = [];
});

describe("ImportStatement", () => {
  it("reads a Fineco-style CSV, takes the source from the file name and imports every row", async () => {
    const { invalidate } = upload("Fineco_movimenti.csv", CSV);
    expect(await screen.findByText(/2 new transactions/)).toBeTruthy();
    expect((screen.getByLabelText("From") as HTMLInputElement).value).toBe("Fineco");
    fireEvent.click(screen.getByRole("button", { name: "Import 2" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc).toHaveBeenCalledWith(
      "add_manual_transaction",
      expect.objectContaining({
        p_description: "Ristorante Mario",
        p_amount: 45.5,
        p_direction: "DBIT",
        p_source: "Fineco",
      }),
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["transactions"] }));
  });

  it("leaves out what is already in the app", async () => {
    existing = [
      {
        booking_date: "2026-04-25",
        amount: 45.5,
        credit_debit_indicator: "DBIT",
        creditor_name: "Ristorante Mario",
      },
    ];
    upload("statement.csv", CSV);
    expect(await screen.findByText(/1 new transaction, 1 already here/)).toBeTruthy();
  });

  it("asks for a CSV when given an Excel file", async () => {
    upload("movimenti.xlsx", "binary");
    expect(await screen.findByRole("alert")).toHaveTextContent(/save the statement as CSV/i);
  });

  it("lets you pick the columns when they can't be guessed", async () => {
    upload("x.csv", "Quando,Cosa,Quanto\n2026-04-25,Coffee,-2.50");
    expect(await screen.findByRole("alert")).toHaveTextContent(/pick them/i);
    fireEvent.change(screen.getByLabelText("Date column"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Description column"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Amount (+/−) column"), { target: { value: "2" } });
    expect(await screen.findByText(/1 new transaction/)).toBeTruthy();
  });

  it("shows how far it got when the database refuses", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "missing" } });
    upload("Fineco.csv", CSV);
    fireEvent.click(await screen.findByRole("button", { name: "Import 2" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/0 of 2 added.*database update/);
  });
});
