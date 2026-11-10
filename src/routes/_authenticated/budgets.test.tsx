import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Row = Record<string, unknown>;
const db: Record<string, Array<Row>> = {};
const upserts: Array<{ rows: Array<Row>; opts: unknown }> = [];
let failTable: string | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "lte", "lt", "order", "is"]) q[m] = () => q;
      q["upsert"] = (rows: Array<Row>, opts: unknown) => {
        upserts.push({ rows, opts });
        for (const r of rows) {
          const list = (db[table] ??= []);
          const i = list.findIndex(
            (x) => x["category"] === r["category"] && x["month"] === r["month"],
          );
          if (i >= 0) list[i] = r;
          else list.push(r);
        }
        return Promise.resolve({ error: null });
      };
      q["then"] = (resolve: (v: unknown) => void) =>
        resolve(
          table === failTable
            ? { data: null, error: { message: "relation does not exist" } }
            : { data: db[table] ?? [], error: null },
        );
      return q;
    },
  },
}));

import { Route } from "./budgets";

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

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-20T12:00:00"));
  for (const k of Object.keys(db)) delete db[k];
  upserts.length = 0;
  failTable = null;
  db["v_spend_by_category_monthly"] = [
    { month: "2026-09-01", category: "Groceries", spend_eur: 300 },
    { month: "2026-10-01", category: "Groceries", spend_eur: 320 },
    { month: "2026-10-01", category: "Dine Out", spend_eur: 81 },
    { month: "2026-11-01", category: "Groceries", spend_eur: 120 },
    { month: "2026-11-01", category: "Dine Out", spend_eur: 60 },
  ];
  db["v_transactions_eur"] = [
    { booking_date: "2026-06-27", signed_amount_eur: 4000 },
    { booking_date: "2026-11-27", signed_amount_eur: 2000 },
  ];
});
afterEach(() => vi.useRealTimers());

describe("Budgets page", () => {
  // protects=a new user sets every budget in one click from their averages;
  // fails_when=the empty state lacks the shortcut or saves wrong amounts or months
  it("starts from the averages in one click", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Start from my averages" }));
    await waitFor(() => expect(upserts).toHaveLength(1));
    const saved = upserts[0]!.rows.map((r) => [r["category"], r["amount"], r["month"]]);
    expect(saved).toEqual(
      [
        ["Groceries", 310],
        ["Dine Out", 50],
      ].map(([c, a]) => [c, a, "2026-11-01"]),
    );
    expect(upserts[0]!.opts).toEqual({ onConflict: "user_id,category,month" });
    expect(await screen.findByText("€190.00 left")).toBeTruthy();
  });

  it("shows what is left, what is over and what was rolled over", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-10-01", amount: 300, rollover: true },
      { category: "Dine Out", month: "2026-11-01", amount: 50, rollover: false },
    ];
    renderPage();
    // Groceries: Oct 300 − 320 = −20 carried; Nov 280 − 120 = 160 left.
    expect(await screen.findByText("€160.00 left")).toBeTruthy();
    expect(screen.getByText(/− €20.00 rolled over/)).toBeTruthy();
    expect(screen.getByText("€10.00 over")).toBeTruthy();
  });

  it("changes a budget from the selected month", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-10-01", amount: 300, rollover: false },
    ];
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Change budget for Groceries/ }));
    fireEvent.change(screen.getByLabelText("Budget for Groceries"), { target: { value: "250,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(upserts).toHaveLength(1));
    expect(upserts[0]!.rows[0]).toMatchObject({
      category: "Groceries",
      amount: 250.5,
      rollover: false,
      month: "2026-11-01",
    });
  });

  it("turns rollover on", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-11-01", amount: 300, rollover: false },
    ];
    renderPage();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Roll over" }));
    await waitFor(() => expect(upserts).toHaveLength(1));
    expect(upserts[0]!.rows[0]).toMatchObject({
      category: "Groceries",
      amount: 300,
      rollover: true,
    });
  });

  it("offers a budget for spending without one", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-11-01", amount: 300, rollover: false },
    ];
    renderPage();
    expect(await screen.findByText("Spent without a budget")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add budget" }));
    await waitFor(() => expect(upserts).toHaveLength(1));
    expect(upserts[0]!.rows[0]).toMatchObject({ category: "Dine Out", amount: 50 });
  });

  // protects=13th/14th salary toggle; fails_when=spreading doesn't change the income shown
  it("spreads yearly income when asked", async () => {
    renderPage();
    expect(await screen.findByText("€2,000.00")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Spread yearly income evenly/ }));
    // June 4000 + November 2000 over the 6 months since June.
    expect(await screen.findByText("€1,000.00")).toBeTruthy();
    expect(screen.getByText("Income, spread over the year")).toBeTruthy();
  });

  it("says what to do when the budgets table is missing", async () => {
    failTable = "category_budgets";
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("relation does not exist");
    expect(alert.textContent).toContain("UPGRADING.md");
  });
});
