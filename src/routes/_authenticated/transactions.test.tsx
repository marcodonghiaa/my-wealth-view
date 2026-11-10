import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let failTable: string | null = null;
let txRows: Array<Record<string, unknown>> = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "eq", "neq", "gte", "lt", "lte", "is", "in", "not"]) {
        q[m] = () => q;
      }
      q["then"] = (resolve: (v: unknown) => void) =>
        resolve(
          table === failTable
            ? { data: null, error: { message: "boom" } }
            : { data: table === "v_transactions_eur" ? txRows : [], error: null },
        );
      return q;
    },
  },
}));

import { Route } from "./transactions";

const Page = Route.options.component as () => React.JSX.Element;
const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Page />
    </QueryClientProvider>,
  );

describe("Transactions page when an extra source fails to load", () => {
  // protects=a failed Splitwise or account query is reported, not shown as missing rows or labels;
  // fails_when=the page ignores the error state of its shares, accounts or transfers queries
  it.each(["v_splitwise_eur", "accounts"])("shows an error when %s fails", async (table) => {
    failTable = table;
    renderPage();
    expect((await screen.findByRole("alert")).textContent).toContain("boom");
    failTable = null;
  });

  it("shows no error when everything loads", async () => {
    renderPage();
    await screen.findAllByText(/No transactions for/);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

// protects=the tag filter keeps only rows with that tag; fails_when=the filter ignores tags
describe("Transactions page tag filter", () => {
  it("filters the month by tag", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const base = {
      account_uid: "a",
      booking_date: today,
      category: "Travel",
      currency: "EUR",
      amount: 10,
      signed_amount_eur: -10,
      credit_debit_indicator: "DBIT",
      flow_type: "spend",
    };
    txRows = [
      { ...base, entry_reference: "1", creditor_name: "Hotel Alpha", tags: ["trip"] },
      { ...base, entry_reference: "2", creditor_name: "Cafe Beta", tags: [] },
    ];
    renderPage();
    expect((await screen.findAllByText("Cafe Beta")).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Filter by tag"), { target: { value: "trip" } });
    expect(screen.queryAllByText("Cafe Beta")).toHaveLength(0);
    expect(screen.getAllByText("Hotel Alpha").length).toBeGreaterThan(0);
    txRows = [];
  });
});
