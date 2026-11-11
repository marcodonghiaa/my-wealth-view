import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

// Restore spies even when a test fails (polish-3 #20).
afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [], error: null });
  existing = [];
  range = async () => ({ data: existing, error: null });
});

describe("ImportStatement", () => {
  it("reads a Fineco-style CSV, takes the source from the file name and imports every row", async () => {
    const { invalidate } = upload("Fineco_movimenti.csv", CSV);
    expect(await screen.findByText(/2 new transactions/)).toBeInTheDocument();
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
    expect(await screen.findByText(/1 new transaction, 1 already here/)).toBeInTheDocument();
  });

  it("#4 refuses a huge file before reading it into memory", async () => {
    const read = vi.spyOn(File.prototype, "arrayBuffer");
    upload("huge.csv", "Date,Description,Amount", 5_000_000_000);
    expect(await screen.findByRole("alert")).toHaveTextContent(/too large/i);
    expect(read).not.toHaveBeenCalled();
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
    expect(await screen.findByText(/1 new transaction/)).toBeInTheDocument();
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
    const alert = await screen.findByRole("alert");
    // polish-4 #5: the pickers sit above the message, and it says so.
    expect(alert).toHaveTextContent(/pick them above/i);
    expect(
      screen.getByLabelText("Date column").compareDocumentPosition(alert) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Date column"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Description column"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Amount (+/−) column"), { target: { value: "2" } });
    expect(await screen.findByText(/1 new transaction/)).toBeInTheDocument();
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
    expect(await screen.findByText(/1 new transaction/)).toBeInTheDocument();
    expect(screen.getByText(/Café/)).toBeInTheDocument();
    expect(screen.getByText(/3 Feb 2026/)).toBeInTheDocument();
    expect(screen.getByText(/decimal comma/)).toBeInTheDocument();
  });

  it("names a known export and lets you flip signs and the date order", async () => {
    const revolut = [
      "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
      "CARD_PAYMENT,Current,2026-03-02 09:00:00,2026-03-03 10:00:00,Coffee,-3.20,0.00,EUR,COMPLETED,1",
    ].join("\n");
    upload("revolut.csv", revolut);
    expect(await screen.findByText(/Read as an export from Revolut/)).toBeInTheDocument();
    expect(screen.getByText("−€3.20")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Spending is written as positive"));
    expect(await screen.findByText("+€3.20")).toBeInTheDocument();
  });

  it("polish-5 #6 hides the sign flip when a debit/credit column decides the sign", async () => {
    upload(
      "bank.csv",
      "Date,Description,Amount,Soll/Haben\n2026-02-03,Bakery,3.80,S\n2026-02-04,Salary,100,H",
    );
    expect(await screen.findByText(/2 new transactions/)).toBeInTheDocument();
    expect(screen.getByText("−€3.80")).toBeInTheDocument();
    expect(screen.queryByLabelText("Spending is written as positive")).toBeNull();
  });

  it("polish-5 #7 names a preset without a/an grammar slips", async () => {
    upload(
      "actual.csv",
      "Account,Date,Payee,Notes,Category,Amount,Split_Amount,Cleared\nChecking,2026-01-15,Grocery,,Food,-54.32,0,Cleared",
    );
    expect(await screen.findByText(/Read as an export from Actual Budget\./)).toBeInTheDocument();
  });

  it("polish-4 #12 gives the Columns toggle a 44px tap target", async () => {
    upload("Fineco_movimenti.csv", CSV);
    expect(await screen.findByText("Columns")).toHaveClass("min-h-11");
  });

  it("polish-4 #9 names the date menu by the words you see above it, like the column pickers", async () => {
    upload("Fineco_movimenti.csv", CSV);
    const menu = await screen.findByRole("combobox", { name: "Date order" });
    expect(menu).not.toHaveAttribute("aria-label");
    expect(screen.getByText("Date order")).toBeInTheDocument();
  });

  it("#10 hides the sign flip for files with separate in and out columns", async () => {
    upload("Fineco_movimenti.csv", CSV);
    expect(await screen.findByText("Ristorante Mario")).toBeInTheDocument();
    expect(screen.getByLabelText("Date order")).toBeInTheDocument();
    expect(screen.queryByLabelText("Spending is written as positive")).toBeNull();
  });

  it("re-reads the dates month first when picked", async () => {
    upload("card.csv", "Date,Description,Amount\n01/02/2026,Shop,-5");
    expect(await screen.findByText(/1 Feb 2026/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Date order"), { target: { value: "MDY" } });
    expect(await screen.findByText(/2 Jan 2026/)).toBeInTheDocument();
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
    expect(await screen.findByRole("button", { name: "Import 1" })).toBeInTheDocument();
  });

  it("polish-3 #12 refreshes accounts too when an import stops partway", async () => {
    rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const { invalidate } = upload("Fineco.csv", CSV);
    fireEvent.click(await screen.findByRole("button", { name: "Import 2" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/1 of 2 added/);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["accounts"] });
  });

  it("polish-3 #13 says it is checking for duplicates while it does", async () => {
    let release: () => void = () => {};
    range = () =>
      new Promise((resolve) => {
        release = () => resolve({ data: existing, error: null });
      });
    upload("card.csv", "Date,Description,Amount\n2026-02-01,Shop,-5");
    expect(await screen.findByText("Checking for duplicates…")).toBeInTheDocument();
    await act(async () => release());
    expect(await screen.findByText(/1 new transaction/)).toBeInTheDocument();
    expect(screen.queryByText("Checking for duplicates…")).toBeNull();
  });

  it("polish-4 #10 announces the check and its result in one live region", async () => {
    let release: () => void = () => {};
    range = () =>
      new Promise((resolve) => {
        release = () => resolve({ data: existing, error: null });
      });
    upload("card.csv", "Date,Description,Amount\n2026-02-01,Shop,-5");
    const status = await screen.findByRole("status");
    await waitFor(() => expect(status).toHaveTextContent("Checking for duplicates…"));
    await act(async () => release());
    await waitFor(() => expect(status).toHaveTextContent(/1 new transaction/));
    expect(screen.getByRole("status")).toBe(status);
  });

  it("polish-3 #14 says to pick the file again when the re-check after a failure fails too", async () => {
    rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    upload("Fineco.csv", CSV);
    const button = await screen.findByRole("button", { name: "Import 2" });
    range = async () => ({ data: null, error: { message: "offline" } }) as never;
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(/1 of 2 added/);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/pick the file again/i),
    );
  });

  it("polish-4 #4 says why a line was skipped when its currency can't be told", async () => {
    upload(
      "card.csv",
      "Date,Description,Amount,Currency\n01/02/2026,Shop,-5,EUR\n02/02/2026,Diner,-10,$",
    );
    expect(await screen.findByText(/1 other line skipped/)).toBeInTheDocument();
    expect(screen.getByText(/currency isn't clear: \$/)).toBeInTheDocument();
  });

  it("shows only the latest read when an older duplicate check answers last", async () => {
    upload("card.csv", "Date,Description,Amount\n01/02/2026,Shop,-5");
    expect(await screen.findByText(/1 Feb 2026/)).toBeInTheDocument();
    let releaseSlow: () => void = () => {};
    range = () =>
      new Promise((resolve) => {
        releaseSlow = () => resolve({ data: existing, error: null });
      });
    fireEvent.change(screen.getByLabelText("Date order"), { target: { value: "MDY" } });
    range = async () => ({ data: existing, error: null });
    fireEvent.click(screen.getByLabelText("Spending is written as positive"));
    expect(await screen.findByText(/2 Jan 2026/)).toBeInTheDocument();
    expect(screen.getByText("+€5.00")).toBeInTheDocument();
    await act(async () => releaseSlow());
    // The slow, older read (not flipped) must not replace the newer preview.
    expect(screen.getByText("+€5.00")).toBeInTheDocument();
  });

  it("#1 drops a slow read when another file is picked meanwhile", async () => {
    let releaseSlow: () => void = () => {};
    range = () =>
      new Promise((resolve) => {
        releaseSlow = () => resolve({ data: existing, error: null });
      });
    upload("a.csv", "Date,Description,Amount\n2026-02-01,Shop,-5");
    await waitFor(() => expect(releaseSlow).not.toBe(undefined));
    const other = new File(["binary"], "b.xlsx");
    fireEvent.change(screen.getByLabelText("Statement file"), { target: { files: [other] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Save as → CSV/i);
    await act(async () => releaseSlow());
    expect(screen.queryByText("Shop")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(/Save as → CSV/i);
  });

  it("does not claim a decimal mark it could not tell", async () => {
    upload("bank.csv", "Date,Description,Amount\n2026-01-02,Shop,-5");
    expect(await screen.findByText(/1 new transaction/)).toBeInTheDocument();
    expect(screen.queryByText(/decimal/)).toBeNull();
  });

  it("lists the real header names for the pickers, even with quotes and pipes", async () => {
    upload("odd.csv", '"Quando"|"Cosa, breve"|"Quanto"\n2026-01-02|Shop|-5');
    expect((await screen.findAllByRole("option", { name: "Cosa, breve" })).length).toBeGreaterThan(
      0,
    );
  });
});
