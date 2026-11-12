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
const calls: Array<Array<unknown>> = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "eq", "gt", "gte", "lt"])
        q[m] = (...args: Array<unknown>) => {
          calls.push([table, m, ...args]);
          return q;
        };
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
let search: { month?: string } = {};
vi.spyOn(Route, "useSearch").mockImplementation((() => search) as never);

function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}

const row = (label: string) => screen.getByText(label).closest("li") as HTMLElement;

beforeEach(() => {
  failTable = null;
  search = {};
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
    // Polish 3 #7: read out as money taken from savings, not "−€500.00 saved".
    expect(chart).toHaveAccessibleName(/€500\.00 taken from savings\.$/);
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

  // Polish 1 #6: Year → Month comes back to this month, not January.
  it("comes back to this month from Year view", async () => {
    renderPage();
    await waitFor(() => expect(row("Income")).toHaveTextContent("€3,000.00"));
    fireEvent.click(screen.getByRole("radio", { name: "Year" }));
    fireEvent.click(screen.getByRole("radio", { name: "Month" }));
    await waitFor(() => expect(row("Income")).toHaveTextContent("€3,000.00"));
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  });

  // Polish 1 #7: Reports links here with its month, so the page opens on that month.
  it("opens on the month in the link", async () => {
    search = { month: monthISO(-1).slice(0, 7) };
    renderPage();
    await waitFor(() => expect(row("Income")).toHaveTextContent("€1,000.00"));
  });

  it("keeps only a well-formed month from the link", () => {
    const validate = Route.options.validateSearch as (s: Record<string, unknown>) => unknown;
    expect(validate({ month: "2026-09" })).toEqual({ month: "2026-09" });
    expect(validate({ month: "2026-13" })).toEqual({});
    expect(validate({ month: 5, other: "x" })).toEqual({});
  });

  // Polish 1 #12: past the server's row cap, the payers kept are the biggest ones.
  it("asks for the biggest incoming payments first", async () => {
    calls.length = 0;
    renderPage();
    await waitFor(() => expect(row("Income")).toHaveTextContent("€3,000.00"));
    expect(calls).toContainEqual([
      "v_transactions_eur",
      "order",
      "personal_signed_amount_eur",
      { ascending: false },
    ]);
  });

  // Polish 1 #13: Quarter adds up the quarter's months.
  it("adds up a quarter", async () => {
    renderPage();
    await waitFor(() => expect(row("Income")).toHaveTextContent("€3,000.00"));
    fireEvent.click(screen.getByRole("radio", { name: "Quarter" }));
    // Last month is in this quarter unless this month starts a quarter.
    const both = now.getMonth() % 3 > 0;
    await waitFor(() => expect(row("Income")).toHaveTextContent(both ? "€4,000.00" : "€3,000.00"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Cash flow for Q[1-4] \d{4}/,
    );
  });

  // Polish 1 #13: tapping a bar opens that period.
  it("opens the period of a tapped bar", async () => {
    renderPage();
    await waitFor(() => expect(row("Income")).toHaveTextContent("€3,000.00"));
    const trend = screen.getByRole("img", { name: /^Saved per month/ });
    const bars = trend.querySelectorAll(".recharts-bar-rectangle");
    expect(bars.length).toBe(2);
    fireEvent.click(bars[0]!);
    await waitFor(() => expect(row("Income")).toHaveTextContent("€1,000.00"));
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
    // Polish 3 #10: nothing recorded is not a net of zero.
    const headline = screen.getByRole("region", { name: /^Saved in/ });
    expect(headline).toHaveTextContent("—");
    expect(headline).not.toHaveTextContent("€0.00");
  });

  // protects=a failed query shows an error instead of quiet zeros
  // Polish 1 #3: a failed totals query must not read as a real €0 month.
  it("shows dashes, not €0.00, and no trend when the totals fail to load", async () => {
    failTable = "v_income_vs_expenses_monthly";
    renderPage();
    await screen.findByRole("alert");
    expect(row("Income")).toHaveTextContent("—");
    expect(row("Spending")).toHaveTextContent("—");
    // Re-audit: no "No income this period" claim when we simply don't know.
    expect(screen.queryByText("No income this period")).toBeNull();
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

  // Polish 3 #3: a rate that shows as 0% is coloured neither as a gain nor a loss.
  it("keeps a 0% rate neutral", async () => {
    tables["v_income_vs_expenses_monthly"] = [
      { month: monthISO(0), income_eur: 1000, expenses_eur: 996 },
    ];
    renderPage();
    await waitFor(() => expect(row("Savings rate")).toHaveTextContent("0%"));
    expect(within(row("Savings rate")).getByText("0%")).toHaveClass("text-muted-foreground");
  });

  // Polish 3 #4: a failed background refresh keeps the figures that already loaded.
  it("keeps loaded figures when a refresh fails", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderPage(client);
    await screen.findByRole("img", { name: /^Cash flow for/ });
    failTable = "v_income_vs_expenses_monthly";
    await client.refetchQueries();
    await screen.findByRole("alert");
    expect(row("Income")).toHaveTextContent("€3,000.00");
    expect(screen.getByRole("img", { name: /^Cash flow for/ })).toBeInTheDocument();
    failTable = "v_transactions_eur";
    await client.refetchQueries();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("boom"));
    expect(screen.getByRole("img", { name: /^Cash flow for/ })).toBeInTheDocument();
  });

  // Polish 3 #6: a month older than the trend's window still has its bar, highlighted.
  it("highlights an old month in the trend", async () => {
    tables["v_income_vs_expenses_monthly"]!.push({
      month: monthISO(-14),
      income_eur: 500,
      expenses_eur: 100,
    });
    search = { month: monthISO(-14).slice(0, 7) };
    renderPage();
    await waitFor(() => expect(row("Income")).toHaveTextContent("€500.00"));
    const trend = screen.getByRole("img", { name: /^Saved per month/ });
    const solid = () => trend.querySelectorAll('.recharts-bar-rectangle path[fill-opacity="1"]');
    await waitFor(() =>
      expect(trend.querySelectorAll(".recharts-bar-rectangle path").length).toBeGreaterThan(0),
    );
    expect(solid().length).toBe(1);
  });

  // Polish 3 #5 (re-audit): the page's own queries answer to the "cash-flow" key that edits refresh.
  it("refetches everything when the cash-flow key is invalidated", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderPage(client);
    await screen.findByRole("img", { name: /^Cash flow for/ });
    calls.length = 0;
    await client.invalidateQueries({ queryKey: ["cash-flow"] });
    const tablesHit = new Set(calls.filter((c) => c[1] === "select").map((c) => c[0]));
    expect(tablesHit).toEqual(
      new Set([
        "v_income_vs_expenses_monthly",
        "v_spend_by_category_monthly",
        "v_transactions_eur",
      ]),
    );
  });

  // Polish 3 #6 (re-audit): an empty old month on screen keeps its place in the trend.
  it("keeps an empty old month in the trend", async () => {
    tables["v_income_vs_expenses_monthly"] = [
      { month: monthISO(-13), income_eur: 500, expenses_eur: 100 },
    ];
    search = { month: monthISO(-14).slice(0, 7) };
    renderPage();
    const trend = await screen.findByRole("img", { name: /^Saved per month/ });
    expect(trend).toHaveAccessibleName(/^Saved per month, last 12:/);
  });

  // Polish 4 #2: the trend's values are in its name, not only in a hover tooltip.
  it("names every bar's saving in the trend", async () => {
    renderPage();
    const trend = await screen.findByRole("img", { name: /^Saved per month/ });
    expect(trend).toHaveAccessibleName(/€500\.00.*€750\.00/);
    expect(trend).toHaveAccessibleName(/25% of income/);
  });

});
