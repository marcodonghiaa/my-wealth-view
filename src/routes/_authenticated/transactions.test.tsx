import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let failTable: string | null = null;
let tableData: Record<string, unknown> = {};
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
        "maybeSingle",
      ]) {
        q[m] = () => q;
      }
      q["then"] = (resolve: (v: unknown) => void) =>
        resolve(
          table === failTable
            ? { data: null, error: { message: "boom" } }
            : { data: table in tableData ? tableData[table] : [], error: null },
        );
      return q;
    },
  },
}));

let searchParams: Record<string, string> = {};
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useSearch: () => searchParams,
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

const thisMonth = (day: number) => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
const row = (ref: string, over: Record<string, unknown> = {}) => ({
  entry_reference: ref,
  account_uid: "a1",
  booking_date: thisMonth(1),
  category: "Groceries",
  transaction_type: "One-time",
  creditor_name: `Shop ${ref}`,
  currency: "EUR",
  amount: 10,
  signed_amount_eur: -10,
  credit_debit_indicator: "DBIT",
  created_at: null,
  worth_it: null,
  personal_amount: null,
  owed_by: null,
  flow_type: "spend",
  refund_of: null,
  ...over,
});

// protects=the phone page answers "what happened" in the first viewport: month in/out line, day
// groups, and empty states that say why and offer the way out;
// fails_when=the in/out line is missing or shown without data, or an empty list is a dead end
describe("Activity page", () => {
  afterEach(() => {
    tableData = {};
  });

  it("shows the month's money in and out under the month", async () => {
    tableData = { v_income_vs_expenses_monthly: { income_eur: 2450, expenses_eur: 1382.34 } };
    renderPage();
    expect(await screen.findByText("€2,450.00")).toBeInTheDocument();
    expect(screen.getByText("€1,382.34")).toBeInTheDocument();
  });

  it("leaves the in/out line empty when the month has no figures", async () => {
    tableData = { v_income_vs_expenses_monthly: null };
    renderPage();
    await screen.findAllByText(/No transactions for/);
    expect(screen.queryByText(/^In /)).toBeNull();
  });

  it("titles the phone page Activity, like its tab, and the desktop page Transactions", () => {
    renderPage();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Activity");
    expect(h1).toHaveTextContent("Transactions");
  });

  it("offers the previous month when this one is empty", async () => {
    renderPage();
    await screen.findAllByText(/No transactions for/);
    const label = () => document.querySelector("[aria-live]")?.textContent;
    const before = label();
    // The empty state's own button, not the switcher's icon button with the same label.
    await userEvent.click(screen.getAllByText("Previous month", { selector: "button" })[0]!);
    expect(label()).not.toBe(before);
  });

  it("groups the phone list by day", async () => {
    tableData = {
      v_transactions_eur: [row("1", { booking_date: thisMonth(2) }), row("2"), row("3")],
    };
    renderPage();
    const sections = await screen.findAllByRole("heading", { level: 2 });
    expect(sections.map((h) => h.textContent)).toHaveLength(2);
  });

  it("says when a search finds nothing, and clears it", async () => {
    tableData = { v_transactions_eur: [row("1")] };
    renderPage();
    await screen.findAllByText("Shop 1");
    await userEvent.type(screen.getByLabelText("Search by merchant"), "zzz");
    expect(screen.getAllByText("Nothing matches “zzz”.").length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole("button", { name: "Clear search" })[0]!);
    expect(screen.getAllByText("Shop 1").length).toBeGreaterThan(0);
  });

  it("says when filters hide everything, and clears them", async () => {
    tableData = { v_transactions_eur: [row("1"), row("2", { category: "Dine Out" })] };
    renderPage();
    await screen.findAllByText("Shop 1");
    await userEvent.selectOptions(screen.getByLabelText("Filter by category"), "Dine Out");
    await userEvent.type(screen.getByLabelText("Search by merchant"), "Shop 1");
    expect(screen.getAllByText("No transactions match your filters.").length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
    expect(screen.getAllByText("Shop 2").length).toBeGreaterThan(0);
  });

  it("shows the account badge only when the month spans more than one account", async () => {
    tableData = { v_transactions_eur: [row("1"), row("2", { account_uid: "a2" })] };
    const { unmount } = renderPage();
    await screen.findAllByText("Shop 1");
    expect(screen.getAllByTitle("Unknown account")).toHaveLength(2);
    unmount();
    tableData = { v_transactions_eur: [row("1"), row("2")] };
    renderPage();
    await screen.findAllByText("Shop 1");
    expect(screen.queryByTitle("Unknown account")).toBeNull();
  });
});

// protects=a Spending category row opens Activity on that category and month;
// fails_when=the route ignores ?category / ?month, or the month param is applied off by one
describe("Activity deep link", () => {
  afterEach(() => {
    tableData = {};
    searchParams = {};
  });

  it("opens on the linked month and category", async () => {
    tableData = { v_transactions_eur: [row("1"), row("2", { category: "Dine Out" })] };
    searchParams = { category: "Dine Out", month: "2026-03" };
    renderPage();
    expect(document.querySelector("[aria-live]")?.textContent).toBe("March 2026");
    expect((await screen.findAllByText("Shop 2")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Shop 1")).toBeNull();
  });

  it("opens on this month with every category without params", async () => {
    tableData = { v_transactions_eur: [row("1"), row("2", { category: "Dine Out" })] };
    renderPage();
    expect((await screen.findAllByText("Shop 1")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Shop 2").length).toBeGreaterThan(0);
  });

  it("validates its search params", () => {
    const validate = Route.options.validateSearch as (s: Record<string, unknown>) => unknown;
    expect(validate({ category: "Dine Out", month: "2026-03", junk: 1 })).toEqual({
      category: "Dine Out",
      month: "2026-03",
    });
    expect(validate({ category: 5, month: "2026-13" })).toEqual({});
  });
});
