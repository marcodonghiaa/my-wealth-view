import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyRows } from "@/lib/import/splitwise-classify";
import { parseSplitwiseCsv } from "@/lib/import/splitwise-parse";

type Answer = { data: unknown[]; error: { message: string } | null };
const tables: { transactions: Answer; fx_rates: Answer; splitwise_expenses: Answer } = {
  transactions: { data: [], error: null },
  fx_rates: { data: [], error: null },
  splitwise_expenses: { data: [], error: null },
};

// Every query method returns the same chain; awaiting it gives the table's canned answer.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const chain: { [method: string]: unknown } = {};
      for (const m of ["select", "gte", "lte", "in", "limit", "eq"]) chain[m] = () => chain;
      chain["then"] = (resolve: (v: unknown) => unknown) =>
        resolve(tables[table as keyof typeof tables]);
      return chain;
    },
  },
}));

import { SplitwiseReview } from "./splitwise-review";

const CSV = [
  "Date,Description,Category,Cost,Currency,Ann,Bob",
  "",
  "2026-08-16,Dinner,Dining out,30.00,USD,-15.00,15.00",
  "2026-08-17,Taxi,Taxi,20.00,USD,10.00,-10.00",
  "",
  "2026-08-18,Total balance, , ,USD,-5.00,5.00",
].join("\n");
const rows = classifyRows(parseSplitwiseCsv(CSV), 0);

const bankRow = {
  account_uid: "acc",
  entry_reference: "e1",
  booking_date: "2026-08-18",
  amount: 18.4,
  currency: "EUR",
  credit_debit_indicator: "DBIT",
  personal_amount: null,
  flow_type: null,
  deleted_at: null,
};

beforeEach(() => {
  tables.transactions = { data: [bankRow], error: null };
  tables.fx_rates = {
    data: [{ currency: "USD", date: "2026-08-10", rate_to_eur: 0.92 }],
    error: null,
  };
  tables.splitwise_expenses = { data: [], error: null };
});

describe("SplitwiseReview", () => {
  // protects=a sure match is offered and counted; fails_when=matching or planning is not wired
  it("offers the bank match ticked and counts what will be recorded", async () => {
    render(<SplitwiseReview rows={rows} group="berkeley" />);
    expect(await screen.findByText(/matches the bank on 2026-08-18/)).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: /Taxi/ }) as HTMLInputElement).checked).toBe(true);
    // 1 share paid by the friend (Dinner) + the taxi share linked to the bank
    expect(screen.getByText(/2 shares of expenses, 1 bank transactions updated/)).toBeTruthy();
  });

  it("stops counting the bank change when the match is unticked", async () => {
    render(<SplitwiseReview rows={rows} group="berkeley" />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /Taxi/ }));
    expect(screen.getByText(/1 shares of expenses, 0 bank transactions updated/)).toBeTruthy();
  });

  // protects=nothing is blocked silently; fails_when=a missing exchange rate is not shown
  it("shows a problem when an exchange rate is missing", async () => {
    tables.fx_rates = { data: [], error: null };
    render(<SplitwiseReview rows={rows} group="berkeley" />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/No exchange rate for USD/);
  });

  it("offers the unmatched expenses I paid only after a tick", async () => {
    tables.transactions = { data: [], error: null };
    render(<SplitwiseReview rows={rows} group="berkeley" />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /Also count the 1 expenses/ }));
    expect(screen.getByText(/2 shares of expenses, 0 bank transactions updated/)).toBeTruthy();
  });

  it("lets the category be changed", async () => {
    render(<SplitwiseReview rows={rows} group="berkeley" />);
    const select = (await screen.findByLabelText("Dining out")) as HTMLSelectElement;
    expect(select.value).toBe("Dine Out");
    fireEvent.change(select, { target: { value: "Shopping" } });
    expect(select.value).toBe("Shopping");
  });

  it("shows a database error", async () => {
    tables.transactions = { data: [], error: { message: "boom" } };
    render(<SplitwiseReview rows={rows} group="berkeley" />);
    expect((await screen.findByRole("alert")).textContent).toBe("boom");
  });

  it("refuses a result that may have been cut at the page limit", async () => {
    tables.transactions = { data: Array.from({ length: 1000 }, () => bankRow), error: null };
    render(<SplitwiseReview rows={rows} group="berkeley" />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Too many bank transactions/);
  });
});
