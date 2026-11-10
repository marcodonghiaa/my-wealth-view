import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Row = Record<string, unknown>;
const db: Record<string, Array<Row>> = {};
const upsertCalls: Array<{ rows: Array<Row>; opts: unknown }> = [];
const upserts = upsertCalls;
let failTable: string | null = null;
let failUpsert: string | null = null;

// A small in-memory PostgREST: filters, order and range really apply, so a wrong date range or
// a missing filter in the page shows up as wrong figures, and the 1000-row cap is real.
const CAP = 1000;
const cmp = (a: unknown, b: unknown) => String(a).localeCompare(String(b));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const filters: Array<(r: Row) => boolean> = [];
      const sorts: Array<string> = [];
      let from = 0;
      let to = CAP - 1;
      const q: Record<string, unknown> = {};
      q["select"] = () => q;
      q["eq"] = (c: string, v: unknown) => (filters.push((r) => r[c] === v), q);
      q["gte"] = (c: string, v: unknown) => (filters.push((r) => cmp(r[c], v) >= 0), q);
      q["lte"] = (c: string, v: unknown) => (filters.push((r) => cmp(r[c], v) <= 0), q);
      q["lt"] = (c: string, v: unknown) => (filters.push((r) => cmp(r[c], v) < 0), q);
      q["in"] = (c: string, v: Array<unknown>) => (filters.push((r) => v.includes(r[c])), q);
      q["order"] = (c: string) => (sorts.push(c), q);
      q["range"] = (a: number, b: number) => ((from = a), (to = b), q);
      q["upsert"] = (rows: Array<Row>, opts: unknown) => {
        upsertCalls.push({ rows, opts });
        if (failUpsert) return Promise.resolve({ error: { message: failUpsert } });
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
      q["then"] = (resolve: (v: unknown) => void) => {
        if (table === failTable)
          return resolve({ data: null, error: { message: "relation does not exist" } });
        let rows = (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
        for (const c of [...sorts].reverse()) rows = [...rows].sort((a, b) => cmp(a[c], b[c]));
        resolve({ data: rows.slice(from, Math.min(to + 1, from + CAP)), error: null });
      };
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
  failUpsert = null;
  db["v_spend_by_category_monthly"] = [
    { month: "2026-09-01", category: "Groceries", spend_eur: 300 },
    { month: "2026-10-01", category: "Groceries", spend_eur: 320 },
    { month: "2026-10-01", category: "Dine Out", spend_eur: 81 },
    { month: "2026-11-01", category: "Groceries", spend_eur: 120 },
    { month: "2026-11-01", category: "Dine Out", spend_eur: 60 },
  ];
  db["v_income_vs_expenses_monthly"] = [
    { month: "2025-10-01", income_eur: 9999 }, // more than 12 months back: never read
    { month: "2026-06-01", income_eur: 4000 },
    { month: "2026-11-01", income_eur: 2000 },
    { month: "2026-12-01", income_eur: 9999 }, // after the viewed month: never read
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

  // protects=rollover over a long history is not cut at PostgREST's 1000-row cap;
  // fails_when=the spend history is read in one request
  it("reads every page of a long spend history", async () => {
    const months = Array.from({ length: 48 }, (_, i) => {
      const d = new Date(2022, 11 + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    });
    // 30 categories × 48 months = 1440 rows; only Groceries is budgeted, from the first month.
    db["v_spend_by_category_monthly"] = months.flatMap((month) =>
      Array.from({ length: 30 }, (_, c) => ({
        month,
        category: c === 0 ? "Groceries" : `Cat ${String(c).padStart(2, "0")}`,
        spend_eur: c === 0 ? 90 : 5,
      })),
    );
    db["category_budgets"] = [
      { category: "Groceries", month: months[0], amount: 100, rollover: true },
    ];
    renderPage();
    // 47 earlier months each leave 10 → 470 carried; this month 100 + 470 − 90 = 480 left.
    expect(await screen.findByText("€480.00 left")).toBeTruthy();
  });

  // protects=clearing the field and pressing Save keeps the budget (P1-4);
  // fails_when=a blank amount is saved as 0, which removes the budget
  it("does not remove a budget when the amount is cleared", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-11-01", amount: 300, rollover: false },
    ];
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Change budget for Groceries/ }));
    fireEvent.change(screen.getByLabelText("Budget for Groceries"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Type an amount");
    expect(upserts).toHaveLength(0);
  });

  // protects=a change made in a past month says it applies onward (P2-4, option A)
  it("says past-month changes apply onward, and only in past months", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-09-01", amount: 300, rollover: false },
    ];
    renderPage();
    await screen.findByText(/left$/);
    expect(screen.queryByText(/apply from/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /previous/i }));
    expect(
      await screen.findByText(
        "Changes here apply from October 2026 onward, until a later month has its own budget.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Change budget for Groceries/ }));
    fireEvent.change(screen.getByLabelText("Budget for Groceries"), { target: { value: "280" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(upserts).toHaveLength(1));
    expect(upserts[0]!.rows[0]).toMatchObject({ month: "2026-10-01", amount: 280 });
  });
});
