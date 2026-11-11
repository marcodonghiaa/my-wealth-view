import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cloneElement, type ReactElement } from "react";
import { formatISODate } from "@/lib/date";

const now = new Date();
const monthISO = (o: number) => formatISODate(new Date(now.getFullYear(), now.getMonth() + o, 1));

type Pending = { table: string; args: Array<Array<unknown>>; resolve: (v: unknown) => void };
const pending: Array<Pending> = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const args: Array<Array<unknown>> = [];
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "eq", "gt", "gte", "lt"])
        q[m] = (...a: Array<unknown>) => {
          args.push([m, ...a]);
          return q;
        };
      q["then"] = (res: (v: unknown) => void) => pending.push({ table, args, resolve: res });
      return q;
    },
  },
}));
vi.mock("recharts", async (orig) => ({
  ...(await orig<typeof import("recharts")>()),
  ResponsiveContainer: ({ children }: { children: ReactElement }) =>
    cloneElement(children as ReactElement<{ width: number; height: number }>, {
      width: 640,
      height: 320,
    }),
}));

import { Route } from "./cash-flow";
const Page = Route.options.component as () => React.JSX.Element;
vi.spyOn(Route, "useSearch").mockImplementation((() => ({})) as never);

const row = (l: string) => screen.getByText(l).closest("li") as HTMLElement;
const monthly = [
  { month: monthISO(-1), income_eur: 1000, expenses_eur: 1000 },
  { month: monthISO(0), income_eur: 3000, expenses_eur: 2000 },
];
const fromOf = (p: Pending) => p.args.find((a) => a[0] === "gte")?.[2];
async function flush(table: string, from: string, data: unknown) {
  await waitFor(() =>
    expect(pending.some((x) => x.table === table && fromOf(x) === from)).toBe(true),
  );
  const p = pending.find((x) => x.table === table && fromOf(x) === from);
  if (!p) throw new Error(`no pending ${table} ${from}`);
  pending.splice(pending.indexOf(p), 1);
  await act(async () => p.resolve({ data, error: null }));
}

beforeEach(() => void (pending.length = 0));

// Polish 3 #16: what the page shows while its queries are still on the way.
describe("Cash flow while loading", () => {
  it("shows placeholders, no amounts, and no way back until the totals load", async () => {
    const { container } = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Page />
      </QueryClientProvider>,
    );
    expect(
      container.querySelectorAll('[class*="animate-pulse"],[data-slot="skeleton"]').length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/€/)).toBeNull();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
  });

  it("shows only the latest month when an older answer arrives late", async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Page />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(pending.some((p) => p.table === "v_income_vs_expenses_monthly")).toBe(true),
    );
    const mp = pending.find((p) => p.table === "v_income_vs_expenses_monthly")!;
    pending.splice(pending.indexOf(mp), 1);
    await act(async () => mp.resolve({ data: monthly, error: null }));
    await waitFor(() => expect(row("Income")).toHaveTextContent("€3,000.00"));
    // breakdown for this month still pending; go back a month
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(row("Income")).toHaveTextContent("€1,000.00");
    // late answer for the old month arrives first
    await flush("v_spend_by_category_monthly", monthISO(0), [
      { month: monthISO(0), category: "Housing", spend_eur: 2000 },
    ]);
    await flush("v_transactions_eur", monthISO(0), [
      {
        payer_name: "OldPayer",
        creditor_name: null,
        category: null,
        personal_signed_amount_eur: 3000,
      },
    ]);
    expect(screen.queryByRole("img", { name: /^Cash flow for/ })).toBeNull(); // still skeleton for new month
    await flush("v_spend_by_category_monthly", monthISO(-1), [
      { month: monthISO(-1), category: "Groceries", spend_eur: 1000 },
    ]);
    await flush("v_transactions_eur", monthISO(-1), [
      {
        payer_name: "NewPayer",
        creditor_name: null,
        category: null,
        personal_signed_amount_eur: 1000,
      },
    ]);
    const chart = await screen.findByRole("img", { name: /^Cash flow for/ });
    expect(within(chart).getByText("NewPayer")).toBeInTheDocument();
    expect(within(chart).queryByText("OldPayer")).toBeNull();
    expect(within(chart).queryByText("Housing")).toBeNull();
    // back to this month: cached, instant, no skeleton
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(
      within(await screen.findByRole("img", { name: /^Cash flow for/ })).getByText("OldPayer"),
    ).toBeInTheDocument();
  });
});
