import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
const invoke = vi.fn();
let existing: Array<object> = [];
let range = async () => ({ data: existing, error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    from: () => ({
      select: () => ({
        is: () => ({
          gte: () => ({
            lte: () => ({
              order: () => ({ range: () => range() }),
            }),
          }),
        }),
      }),
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

function upload(name: string, content: string | Uint8Array, size?: number) {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <ImportStatement />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Import statement" }));
  const file = new File([content as BlobPart], name, { type: "text/csv" });
  if (size != null) Object.defineProperty(file, "size", { value: size });
  fireEvent.change(screen.getByLabelText("Statement file"), { target: { files: [file] } });
  return { invalidate };
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [], error: null });
  existing = [];
  range = async () => ({ data: existing, error: null });
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

  it("#4 refuses a huge file before reading it into memory", async () => {
    const read = vi.spyOn(File.prototype, "arrayBuffer");
    upload("huge.csv", "Date,Description,Amount", 5_000_000_000);
    expect(await screen.findByRole("alert")).toHaveTextContent(/too large/i);
    expect(read).not.toHaveBeenCalled();
    read.mockRestore();
  });

  it("#6 keeps the From name to 60 characters", async () => {
    upload(`${"B".repeat(100)}.csv`, CSV);
    const from = (await screen.findByLabelText("From")) as HTMLInputElement;
    expect(from.value).toHaveLength(60);
    expect(from.maxLength).toBe(60);
  });

  it("asks for a CSV when given an Excel file", async () => {
    upload("movimenti.xlsx", "binary");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Save as → CSV/i);
  });

  it("sends a PDF to the AI and previews the rows it found", async () => {
    invoke.mockResolvedValue({
      data: {
        rows: [
          { date: "2026-04-25", description: "Ristorante Mario", amount: 45.5, direction: "DBIT" },
        ],
      },
      error: null,
    });
    upload("Fineco_estratto.pdf", "%PDF-1.4");
    expect(await screen.findByText(/1 new transaction/)).toBeTruthy();
    expect(invoke).toHaveBeenCalledWith("parse-statement", { body: { pdf: btoa("%PDF-1.4") } });
    expect(screen.queryByText("Columns")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Import 1" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        "add_manual_transaction",
        expect.objectContaining({ p_description: "Ristorante Mario", p_source: "Fineco" }),
      ),
    );
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

  it("reads a Windows-1252 file and says the decimal mark it found", async () => {
    // "Datum;Omschrijving;Bedrag\n03.02.2026;Café;-3,80" with é as the single byte 0xE9
    const text = "Datum;Omschrijving;Bedrag\n03.02.2026;Caf\u00e9;-3,80";
    const bytes = Uint8Array.from([...text].map((c) => c.charCodeAt(0)));
    upload("bank.csv", bytes);
    expect(await screen.findByText(/1 new transaction/)).toBeTruthy();
    expect(screen.getByText(/Café/)).toBeTruthy();
    expect(screen.getByText(/3 Feb 2026/)).toBeTruthy();
    expect(screen.getByText(/decimal comma/)).toBeTruthy();
  });

  it("names a known export and lets you flip signs and the date order", async () => {
    const revolut = [
      "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
      "CARD_PAYMENT,Current,2026-03-02 09:00:00,2026-03-03 10:00:00,Coffee,-3.20,0.00,EUR,COMPLETED,1",
    ].join("\n");
    upload("revolut.csv", revolut);
    expect(await screen.findByText(/Read as a Revolut export/)).toBeTruthy();
    expect(screen.getByText("−€3.20")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Spending is written as positive"));
    expect(await screen.findByText("+€3.20")).toBeTruthy();
  });

  it("re-reads the dates month first when picked", async () => {
    upload("card.csv", "Date,Description,Amount\n01/02/2026,Shop,-5");
    expect(await screen.findByText(/1 Feb 2026/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Date order"), { target: { value: "MDY" } });
    expect(await screen.findByText(/2 Jan 2026/)).toBeTruthy();
  });

  it("after a partial failure, offers only the rows that were not saved", async () => {
    rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    upload("Fineco.csv", CSV);
    fireEvent.click(await screen.findByRole("button", { name: "Import 2" }));
    // The first row is now in the app.
    existing = [
      {
        booking_date: "2026-04-25",
        amount: 45.5,
        credit_debit_indicator: "DBIT",
        creditor_name: "Ristorante Mario",
      },
    ];
    expect(await screen.findByRole("alert")).toHaveTextContent(/1 of 2 added/);
    expect(await screen.findByRole("button", { name: "Import 1" })).toBeTruthy();
  });

  it("shows only the latest read when an older duplicate check answers last", async () => {
    upload("card.csv", "Date,Description,Amount\n01/02/2026,Shop,-5");
    expect(await screen.findByText(/1 Feb 2026/)).toBeTruthy();
    let releaseSlow: () => void = () => {};
    range = () =>
      new Promise((resolve) => {
        releaseSlow = () => resolve({ data: existing, error: null });
      });
    fireEvent.change(screen.getByLabelText("Date order"), { target: { value: "MDY" } });
    range = async () => ({ data: existing, error: null });
    fireEvent.click(screen.getByLabelText("Spending is written as positive"));
    expect(await screen.findByText(/2 Jan 2026/)).toBeTruthy();
    expect(screen.getByText("+€5.00")).toBeTruthy();
    releaseSlow();
    await new Promise((r) => setTimeout(r, 20));
    // The slow, older read (not flipped) must not replace the newer preview.
    expect(screen.getByText("+€5.00")).toBeTruthy();
  });

  it("does not claim a decimal mark it could not tell", async () => {
    upload("bank.csv", "Date,Description,Amount\n2026-01-02,Shop,-5");
    expect(await screen.findByText(/1 new transaction/)).toBeTruthy();
    expect(screen.queryByText(/decimal/)).toBeNull();
  });

  it("lists the real header names for the pickers, even with quotes and pipes", async () => {
    upload("odd.csv", '"Quando"|"Cosa, breve"|"Quanto"\n2026-01-02|Shop|-5');
    expect((await screen.findAllByRole("option", { name: "Cosa, breve" })).length).toBeGreaterThan(
      0,
    );
  });
});
