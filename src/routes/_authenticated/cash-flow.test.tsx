import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cloneElement, type ReactElement } from "react";
import { formatISODate } from "@/lib/date";

const now = new Date();
const monthISO = (offset: number) =>
  formatISODate(new Date(now.getFullYear(), now.getMonth() + offset, 1));

let tables: Record<string, Array<Record<string, unknown>>> = {};
let failTable: string | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "eq", "gt", "gte", "lt"]) q[m] = () => q;
      q["then"] = (resolve: (v: unknown) => void) =>
        resolve(
          table === failTable
            ? { data: null, error: { message: "boom" } }
            : { data: tables[table] ?? [], error: null },
        );
      return q;
    },
  },
}));
// jsdom has no layout: give the charts a fixed size so the Sankey draws its labels.
vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  ResponsiveContainer: ({ children }: { children: ReactElement }) =>
    cloneElement(children as ReactElement<{ width: number; height: number }>, {
      width: 640,
      height: 320,
    }),
}));

import { Route } from "./cash-flow";

const Page = Route.options.component as () => React.JSX.Element;

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Page />
    </QueryClientProvider>,
  );
}

const row = (label: string) => screen.getByText(label).closest("li") as HTMLElement;

beforeEach(() => {
  failTable = null;
  tables = {
    v_income_vs_expenses_monthly: [
      { month: monthISO(-1), income_eur: 1000, expenses_eur: 1500 },
      { month: monthISO(0), income_eur: 3000, expenses_eur: 2250 },
    ],
    v_spend_by_category_monthly: [
      { month: monthISO(0), category: "Housing", spend_eur: 1500 },
      { month: monthISO(0), category: "Groceries", spend_eur: 750 },
    ],
    v_transactions_eur: [
      { creditor_name: "Employer", category: "Income", personal_signed_amount_eur: 3000 },
    ],
  };
});

describe("Cash flow page", () => {
  // protects=income, spending, saved and savings rate for the month agree with the totals view
  it("shows the month's income, spending and savings rate", async () => {
    renderPage();
    await waitFor(() => expect(row("Income")).toHaveTextContent("€3,000.00"));
    expect(row("Spending")).toHaveTextContent("€2,250.00");
    expect(row("Savings rate")).toHaveTextContent("25%");
    expect(screen.getByRole("region", { name: /^Saved in/ })).toHaveTextContent(/^Saved/);
  });

  // protects=the Sankey draws payers, categories and what was left over
  it("draws where the money came from and went", async () => {
    renderPage();
    const chart = await screen.findByRole("img", { name: /^Cash flow for/ });
    expect(chart).toHaveAccessibleName(/€3,000\.00 in, €2,250\.00 out, \+€750\.00 saved/);
    for (const name of ["Employer", "Housing", "Groceries"])
      expect(within(chart).getByText(name)).toBeInTheDocument();
    expect(within(chart).getAllByText("Saved").length).toBeGreaterThan(0);
  });

  // protects=a month that spent more than came in says so and draws from savings
  it("names an overspent period and its negative rate", async () => {
    renderPage();
    await waitFor(() => expect(row("Income")).toHaveTextContent("€3,000.00"));
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    await waitFor(() => expect(row("Savings rate")).toHaveTextContent("−50%"));
    expect(screen.getByText("Spent more than came in")).toBeInTheDocument();
    // Polish 1 #4: the overspend is drawn as money taken from savings.
    const chart = await screen.findByRole("img", { name: /^Cash flow for/ });
    expect(within(chart).getByText("From savings")).toBeInTheDocument();
  });

  // protects=switching to Year sums every month of that year
  it("adds up a whole year", async () => {
    renderPage();
    await waitFor(() => expect(row("Income")).toHaveTextContent("€3,000.00"));
    fireEvent.click(screen.getByRole("radio", { name: "Year" }));
    const year = String(now.getFullYear());
    // Both months are in this year unless this month is January.
    const both = now.getMonth() > 0;
    await waitFor(() => expect(row("Income")).toHaveTextContent(both ? "€4,000.00" : "€3,000.00"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(`Cash flow for ${year}`);
    expect(screen.getByRole("button", { name: "Next year" })).toBeDisabled();
  });

  // protects=the switcher stops at the first month with data and at the current period
  it("stops at the start of history and at today", async () => {
    renderPage();
    await waitFor(() => expect(row("Income")).toHaveTextContent("€3,000.00"));
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled(),
    );
  });

  // protects=no income gives no rate, and an empty period says so instead of drawing nothing
  it("explains an empty period", async () => {
    tables = { v_income_vs_expenses_monthly: [] };
    renderPage();
    expect(await screen.findByText(/^Nothing came in or went out in/)).toBeInTheDocument();
    expect(row("Savings rate")).toHaveTextContent("—");
    expect(screen.getByText("No income this period")).toBeInTheDocument();
  });

  // protects=a failed query shows an error instead of quiet zeros
  // Polish 1 #3: a failed totals query must not read as a real €0 month.
  it("shows dashes, not €0.00, and no trend when the totals fail to load", async () => {
    failTable = "v_income_vs_expenses_monthly";
    renderPage();
    await screen.findByRole("alert");
    expect(row("Income")).toHaveTextContent("—");
    expect(row("Spending")).toHaveTextContent("—");
    expect(screen.queryByText(/€0\.00/)).toBeNull();
    expect(screen.queryByRole("img", { name: /^Saved per/ })).toBeNull();
    expect(screen.queryByText(/^Nothing came in or went out/)).toBeNull();
  });

  // Polish 1 #5: a failed breakdown shows an error in the card, not one big "Other" band.
  it.each(["v_spend_by_category_monthly", "v_transactions_eur"])(
    "shows an error instead of the diagram when %s fails",
    async (table) => {
      failTable = table;
      renderPage();
      await screen.findByRole("alert");
      await waitFor(() => expect(row("Income")).toHaveTextContent("€3,000.00"));
      expect(screen.queryByRole("img", { name: /^Cash flow for/ })).toBeNull();
      expect(screen.getByText("The breakdown didn't load.")).toBeInTheDocument();
    },
  );

  it("says when figures fail to load", async () => {
    failTable = "v_spend_by_category_monthly";
    renderPage();
    expect((await screen.findByRole("alert")).textContent).toContain("boom");
  });
});
