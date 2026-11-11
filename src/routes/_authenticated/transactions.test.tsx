import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let failTable: string | null = null;
// Rows the mocked views return (empty unless a test sets them).
const rows: Record<string, Array<Record<string, unknown>>> = {};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of [
        "select",
        "order",
        "eq",
        "neq",
        "gte",
        "lt",
        "lte",
        "is",
        "in",
        "not",
        "update",
      ]) {
        q[m] = () => q;
      }
      q["then"] = (resolve: (v: unknown) => void) =>
        resolve(
          table === failTable
            ? { data: null, error: { message: "boom" } }
            : { data: rows[table] ?? [], error: null },
        );
      return q;
    },
  },
}));

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: vi.fn(),
  }),
}));

import { Route } from "./transactions";

const Page = Route.options.component as () => React.JSX.Element;
const renderPage = (client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) =>
  render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );

afterEach(() => {
  toastSuccess.mockReset();
  for (const k of Object.keys(rows)) delete rows[k];
});

// Polish pass 4 #1 and #14: Make a rule sits in the transaction's sheet (a phone's sheet covers
// the toast), and isn't offered when a loaded rule already sorts the name.
describe("Make a rule in the transaction sheet", () => {
  const today = new Date().toISOString().slice(0, 10);
  const bankRow = {
    entry_reference: "e1",
    account_uid: "a1",
    booking_date: today,
    category: "Shopping",
    creditor_name: "Poste Italiane",
    currency: "EUR",
    amount: 12.75,
    signed_amount_eur: -12.75,
    credit_debit_indicator: "DBIT",
    flow_type: "spend",
  };
  const openSheet = async (name: RegExp) => {
    const [card] = await screen.findAllByRole("button", { name });
    await userEvent.click(card!);
    return screen.findByRole("dialog");
  };

  it("offers it for a bank transaction", async () => {
    rows["v_transactions_eur"] = [bankRow];
    renderPage();
    const sheet = await openSheet(/Poste Italiane/);
    expect(within(sheet).getByRole("button", { name: "Make a rule" })).toBeTruthy();
  });

  // pass5 #1: the rules come from the database, not only from a cache the Rules page filled
  it("leaves it out on a cold start when a saved rule already sorts the name", async () => {
    rows["v_transactions_eur"] = [bankRow];
    rows["category_rules"] = [
      {
        id: "r1",
        match_field: "creditor_name",
        match_text: "Poste",
        match_mode: "word",
        set_category: "Shopping",
        priority: 100,
      },
    ];
    renderPage();
    const sheet = await openSheet(/Poste Italiane/);
    await waitFor(() =>
      expect(within(sheet).queryByRole("button", { name: "Make a rule" })).toBeNull(),
    );
  });

  // pass5 #2: the sheet's overlay covers the toast, so a change made in the sheet gets no toast
  // button (the sheet has its own); an inline change in the table keeps it
  it("puts Make a rule on the toast only when the change wasn't made in the sheet", async () => {
    rows["v_transactions_eur"] = [bankRow];
    renderPage();
    const sheet = await openSheet(/Poste Italiane/);
    await userEvent.click(within(sheet).getByRole("button", { name: /Change category for/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Groceries" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(toastSuccess.mock.calls.at(-1)?.[1]).not.toHaveProperty("action");
  });

  it("keeps Make a rule on the toast for an inline change in the table", async () => {
    rows["v_transactions_eur"] = [bankRow];
    renderPage();
    const [inline] = await screen.findAllByRole("button", { name: /Change category for/ });
    await userEvent.click(inline!);
    await userEvent.click(await screen.findByRole("button", { name: "Groceries" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(toastSuccess.mock.calls.at(-1)?.[1]).toHaveProperty("action.label", "Make a rule");
  });

  it("leaves it out for a Splitwise share", async () => {
    rows["v_splitwise_eur"] = [
      {
        id: "s1",
        booking_date: today,
        category: "Dine Out",
        description: "Dinner",
        group_name: "Trip",
        currency: "EUR",
        amount: 12.5,
        amount_eur: 12.5,
      },
    ];
    renderPage();
    const sheet = await openSheet(/Dinner/);
    expect(within(sheet).queryByRole("button", { name: "Make a rule" })).toBeNull();
  });
});

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
