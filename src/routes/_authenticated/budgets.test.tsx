import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Row = Record<string, unknown>;
const db: Record<string, Array<Row>> = {};
const upsertCalls: Array<{ rows: Array<Row>; opts: unknown }> = [];
const upserts = upsertCalls;
let failTable: string | null = null;
let failUpsert: string | null = null;
// When set, reads of category_budgets wait for it: holds a refetch open.
let holdBudgets: Promise<void> | null = null;
// Spend reads under way right now, and the most there were at once.
const spendReads = { now: 0, most: 0 };
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

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
        const answer = () => {
          let rows = (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
          for (const c of [...sorts].reverse()) rows = [...rows].sort((a, b) => cmp(a[c], b[c]));
          resolve({ data: rows.slice(from, Math.min(to + 1, from + CAP)), error: null });
        };
        if (table === "category_budgets" && holdBudgets) void holdBudgets.then(answer);
        else if (table === "v_spend_by_category_monthly") {
          spendReads.most = Math.max(spendReads.most, ++spendReads.now);
          setTimeout(() => (spendReads.now--, answer()), 0);
        } else answer();
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

// Matches the smallest element whose whole visible text is `t`: an amount (figures font) and
// its word ("left", "over") are separate nodes.
const whole = (t: string | RegExp) => (_: string, el: Element | null) => {
  const is = (e: Element) => {
    const text = (e.textContent ?? "").replace(/\s+/g, " ").trim();
    return typeof t === "string" ? text === t : t.test(text);
  };
  return !!el && is(el) && ![...el.children].some(is);
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-20T12:00:00"));
  for (const k of Object.keys(db)) delete db[k];
  upserts.length = 0;
  failTable = null;
  failUpsert = null;
  holdBudgets = null;
  spendReads.now = spendReads.most = 0;
  toast.error.mockClear();
  window.localStorage.clear();
  db["v_spend_by_category_monthly"] = [
    { month: "2026-09-01", category: "Groceries", spend_eur: 300 },
    { month: "2026-10-01", category: "Groceries", spend_eur: 320 },
    { month: "2026-10-01", category: "Dine Out", spend_eur: 81 },
    { month: "2026-11-01", category: "Groceries", spend_eur: 120 },
    { month: "2026-11-01", category: "Dine Out", spend_eur: 60 },
  ];
  db["v_income_vs_expenses_monthly"] = [
    { month: "2025-10-01", income_eur: 9999 }, // outside the 12 months before November: never counted
    { month: "2026-06-01", income_eur: 4000 },
    { month: "2026-11-01", income_eur: 2000 },
    { month: "2026-12-01", income_eur: 9999 }, // after the viewed month: never counted
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
    expect(await screen.findByText(whole("€190.00 left"))).toBeTruthy();
  });

  it("shows what is left, what is over and what was rolled over", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-10-01", amount: 300, rollover: true },
      { category: "Dine Out", month: "2026-11-01", amount: 50, rollover: false },
    ];
    renderPage();
    // Groceries: Oct 300 − 320 = −20 carried; Nov 280 − 120 = 160 left.
    expect(await screen.findByText(whole("€160.00 left"))).toBeTruthy();
    expect(screen.getByText(whole(/− €20.00 rolled over$/))).toBeTruthy();
    expect(screen.getByText(whole("€10.00 over"))).toBeTruthy();
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

  // protects=P1-1 paging: budgeted history alone past the 1000-row cap is read in full;
  // fails_when=fetchSpend stops after the first page
  it("reads every page when budgeted history alone passes 1000 rows", async () => {
    const months = Array.from({ length: 48 }, (_, i) => {
      const d = new Date(2022, 11 + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    });
    const cats = [
      "Groceries",
      ...Array.from({ length: 29 }, (_, c) => `Cat ${String(c).padStart(2, "0")}`),
    ];
    // 30 budgeted categories × 48 months = 1440 rows in the budgeted-history read.
    db["v_spend_by_category_monthly"] = months.flatMap((month) =>
      cats.map((category) => ({ month, category, spend_eur: category === "Groceries" ? 90 : 5 })),
    );
    db["category_budgets"] = cats.map((category) => ({
      category,
      month: months[0],
      amount: category === "Groceries" ? 100 : 5,
      rollover: true,
    }));
    renderPage();
    // Groceries: 47 earlier months each leave 10 → 470 carried; 100 + 470 − 90 = 480 left.
    expect(await screen.findByText(whole("€480.00 left"))).toBeTruthy();
  });

  // protects=P2-1 a save counts as running until the saved budgets are back on screen;
  // fails_when=the controls unlock while the refetch is still on its way
  it("keeps the controls locked until the saved budget is shown", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-11-01", amount: 300, rollover: false },
    ];
    renderPage();
    const box = (await screen.findByRole("checkbox", { name: "Roll over" })) as HTMLInputElement;
    let release = () => {};
    holdBudgets = new Promise((r) => (release = r));
    fireEvent.click(box);
    await waitFor(() => expect(upserts).toHaveLength(1));
    // Saved, but the fresh rows aren't here yet: give the mutation time to settle.
    await new Promise((r) => setTimeout(r, 50));
    expect(box.disabled).toBe(true);
    release();
    await waitFor(() => expect(box.disabled).toBe(false));
    expect(box.checked).toBe(true);
  });

  // protects=P2-2 older history and recent months load side by side;
  // fails_when=the second read waits for the first
  it("reads older history and recent months at the same time", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2025-01-01", amount: 300, rollover: false },
    ];
    renderPage();
    expect(await screen.findByText(whole("€180.00 left"))).toBeTruthy();
    expect(spendReads.most).toBe(2);
  });

  // protects=P2-3 the amount message belongs to one attempt; fails_when=it's still there on reopen
  it("clears the amount message when the editor is opened again", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-11-01", amount: 300, rollover: false },
    ];
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Change budget for Groceries/ }));
    fireEvent.change(screen.getByLabelText("Budget for Groceries"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: /Change budget for Groceries/ }));
    expect(screen.getByLabelText("Budget for Groceries")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // protects=spend the view couldn't name still shows; fails_when=a null category is dropped
  it("lists spending with no category as Uncategorized", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-11-01", amount: 300, rollover: false },
      { category: "Dine Out", month: "2026-11-01", amount: 50, rollover: false },
    ];
    db["v_spend_by_category_monthly"]!.push({ month: "2026-11-01", category: null, spend_eur: 7 });
    renderPage();
    const row = (await screen.findByText("Uncategorized")).closest("li")!;
    expect(row.textContent).toContain("€7.00");
  });

  // Polish pass 4 (UX/UI).
  // protects=P4 P1-1 Roll over is explained where the boxes are; fails_when=the caption is gone
  it("explains Roll over under the budgets", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-11-01", amount: 300, rollover: false },
    ];
    renderPage();
    await screen.findByText(whole("€180.00 left"));
    expect(
      screen.getByText("Roll over: what's left, or overspent, carries into next month."),
    ).toBeTruthy();
  });

  // protects=P4 P1-2 label and figure agree when budgets pass income;
  // fails_when="Not yet budgeted" sits next to a negative amount
  it("says Budgeted above income when budgets pass income", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-11-01", amount: 2500, rollover: false },
    ];
    renderPage();
    const label = await screen.findByText("Budgeted above income");
    // November income 2000, budgets 2500.
    expect(label.parentElement!.textContent).toContain("€500.00");
    expect(label.parentElement!.textContent).not.toContain("-");
    expect(screen.queryByText("Not yet budgeted")).toBeNull();
  });

  // protects=P4 P1-3 the amount shows it can be changed; fails_when=an underline is the only cue
  it("marks the budget amount as editable with a pencil", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-11-01", amount: 300, rollover: false },
    ];
    renderPage();
    const change = await screen.findByRole("button", { name: /Change budget for Groceries/ });
    expect(change.querySelector("svg[aria-hidden]")).not.toBeNull();
    expect(change.textContent).toBe("€300.00");
  });

  // protects=P4 P1-4 keyboard users keep their place; fails_when=focus falls to the page body
  // after Cancel, Save or Remove, or Escape leaves the editor open
  it("returns focus after the editor closes, and Escape cancels", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-11-01", amount: 300, rollover: false },
    ];
    renderPage();
    const amount = () => screen.getByRole("button", { name: /Change budget for Groceries/ });
    fireEvent.click(await screen.findByRole("button", { name: /Change budget for Groceries/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(amount());

    fireEvent.click(amount());
    fireEvent.keyDown(screen.getByLabelText("Budget for Groceries"), { key: "Escape" });
    expect(screen.queryByLabelText("Budget for Groceries")).toBeNull();
    expect(document.activeElement).toBe(amount());
    expect(upserts).toHaveLength(0);

    fireEvent.click(amount());
    fireEvent.change(screen.getByLabelText("Budget for Groceries"), { target: { value: "280" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(document.activeElement).toBe(amount());
    await waitFor(() => expect(upserts).toHaveLength(1));

    fireEvent.click(await screen.findByRole("button", { name: /now €280.00/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    // The row is about to go: focus moves on to the add form.
    expect(document.activeElement).toBe(screen.getByLabelText("Category"));
  });

  // protects=P4 P1-5 every control on a budget row is at least 44px tall (min-h-11);
  // fails_when=a small control comes back (measured for real in the polish-pass screenshots)
  it("keeps row controls at the 44px touch height", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-11-01", amount: 300, rollover: false },
    ];
    renderPage();
    const tall = (el: Element | null) => expect(el?.className).toMatch(/\bmin-h-11\b/);
    const amount = await screen.findByRole("button", { name: /Change budget for Groceries/ });
    tall(amount);
    tall(screen.getByRole("checkbox", { name: "Roll over" }).closest("label"));
    tall(screen.getByRole("button", { name: "Add budget" }));
    fireEvent.click(amount);
    tall(screen.getByLabelText("Budget for Groceries"));
    for (const name of ["Save", "Cancel", "Remove"]) tall(screen.getByRole("button", { name }));
  });

  // protects=P4 P2-1 DESIGN.md Mono Figure Rule: amounts in mono, words in the text face;
  // fails_when="left", "over" or "rolled over" sit inside a font-figure element
  it("sets only the amounts in the figures font", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-10-01", amount: 300, rollover: true },
      { category: "Dine Out", month: "2026-11-01", amount: 50, rollover: false },
    ];
    renderPage();
    await screen.findByText(whole(/rolled over$/));
    const mono = [...document.querySelectorAll("main .font-figure, .font-figure")].map(
      (e) => e.textContent ?? "",
    );
    expect(mono).toContain("€160.00");
    expect(mono).toContain("€10.00");
    expect(mono).toContain("€20.00");
    for (const text of mono) expect(text).not.toMatch(/[a-z]{3,}/i);
  });

  // protects=P4 P2-2 a past month's income isn't called "this month"
  it("names the month on the income row when it isn't the current one", async () => {
    renderPage();
    expect(await screen.findByText("Income this month")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(await screen.findByText("Income in October 2026")).toBeTruthy();
    expect(screen.queryByText("Income this month")).toBeNull();
  });

  // protects=P4 P2-3 loading keeps the page's shape; fails_when=the past-month note blinks
  // away while loading, or one block stands in for the figure and the rows
  it("keeps the past-month note and a page-shaped placeholder while loading", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-09-01", amount: 300, rollover: false },
    ];
    const { container } = renderPage();
    await screen.findByText(whole("€180.00 left"));
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(2);
    expect(screen.getByText(/Changes here apply from October 2026 onward/)).toBeTruthy();
    await screen.findByText(whole("€20.00 over"));
  });

  // protects=P4 P2-4 long names and messages keep the layout; fails_when=a long name wraps the
  // unbudgeted row, the amount message shares a line with the buttons, or the add-form
  // message is split from its form by a divider
  it("keeps long names and messages tidy", async () => {
    const long = "A category name that goes on for a very long while ".repeat(2).trim();
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-11-01", amount: 300, rollover: false },
    ];
    db["v_spend_by_category_monthly"]!.push({ month: "2026-11-01", category: long, spend_eur: 9 });
    renderPage();
    const name = await screen.findByText(long);
    expect(name.className).toMatch(/\btruncate\b/);
    expect(name.getAttribute("title")).toBe(long);

    fireEvent.click(screen.getByRole("button", { name: /Change budget for Groceries/ }));
    fireEvent.change(screen.getByLabelText("Budget for Groceries"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).className).toMatch(/\bbasis-full\b/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Dine Out" } });
    fireEvent.change(screen.getByLabelText("Monthly budget in euros"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const message = await screen.findByRole("alert");
    expect(message.parentElement).toBe(screen.getByLabelText("Category").closest("form"));
  });

  // protects=P4 P2-5 screen readers get the same facts; fails_when=the add-form message isn't
  // tied to its field, or an overspent bar only says "100"
  it("ties messages to fields and puts the amounts on the progress bar", async () => {
    db["category_budgets"] = [
      { category: "Dine Out", month: "2026-11-01", amount: 50, rollover: false },
    ];
    renderPage();
    const bar = await screen.findByRole("progressbar");
    expect(bar.getAttribute("aria-valuetext")).toBe("€60.00 of €50.00, over");
    expect(screen.getByRole("checkbox", { name: /Spread yearly income/ }).className).toMatch(
      /\bshrink-0\b/,
    );
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Groceries" } });
    const field = screen.getByLabelText("Monthly budget in euros");
    fireEvent.change(field, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const message = await screen.findByRole("alert");
    expect(message.id).not.toBe("");
    expect(field.getAttribute("aria-describedby")).toBe(message.id);
  });

  // P1-4: visible behaviour that had no test.
  it("says Left to spend or Over budget above the total", async () => {
    db["category_budgets"] = [
      { category: "Dine Out", month: "2026-11-01", amount: 50, rollover: false },
    ];
    renderPage();
    // Dine Out: 50 budgeted, 60 spent.
    expect(await screen.findByText("Over budget")).toBeTruthy();
    expect(screen.queryByText("Left to spend")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Change budget for Dine Out/ }));
    fireEvent.change(screen.getByLabelText("Budget for Dine Out"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Left to spend")).toBeTruthy();
    expect(screen.queryByText("Over budget")).toBeNull();
  });

  it("shows income minus all budgets as Not yet budgeted", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-11-01", amount: 300, rollover: false },
      { category: "Dine Out", month: "2026-11-01", amount: 50, rollover: false },
    ];
    renderPage();
    const label = await screen.findByText("Not yet budgeted");
    // November income 2000 − (300 + 50).
    expect(label.parentElement!.textContent).toContain("€1,650.00");
  });

  it("remembers the spread-income choice in this browser", async () => {
    const first = renderPage();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Spread yearly income evenly/ }));
    expect(window.localStorage.getItem("alopex.budgets.spreadIncome")).toBe("1");
    first.unmount();
    renderPage();
    const box = await screen.findByRole("checkbox", { name: /Spread yearly income evenly/ });
    expect((box as HTMLInputElement).checked).toBe(true);
    expect(await screen.findByText("€1,000.00")).toBeTruthy();
  });

  it("refuses 0 in the add form", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText("Category"), { target: { value: "Groceries" } });
    fireEvent.change(screen.getByLabelText("Monthly budget in euros"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect((await screen.findByRole("alert")).textContent).toContain("above 0");
    expect(upserts).toHaveLength(0);
  });

  // protects=P1-3 adding a budget keeps the page on screen;
  // fails_when=the new category's spend read swaps the page for the loading block
  it("keeps the page on screen while a new budget's history loads", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-11-01", amount: 300, rollover: false },
    ];
    const { container } = renderPage();
    const add = await screen.findByRole("button", { name: "Add budget" });
    let blinked = false;
    const watch = new MutationObserver(() => {
      if (container.querySelector(".animate-pulse")) blinked = true;
    });
    watch.observe(container, { childList: true, subtree: true });
    fireEvent.click(add);
    // Dine Out: budget 50, spent 60.
    expect(await screen.findByText(whole("€10.00 over"))).toBeTruthy();
    watch.disconnect();
    expect(blinked).toBe(false);
  });

  it("still shows the loading block when the month changes", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-09-01", amount: 300, rollover: false },
    ];
    const { container } = renderPage();
    expect(await screen.findByText(whole("€180.00 left"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    // October's figures, never September-to-November's under October's name.
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    expect(await screen.findByText(whole("€20.00 over"))).toBeTruthy();
  });

  // protects=P1-2 budgets past the 1000-row cap are all read;
  // fails_when=fetchBudgets stops after one request
  it("reads every budget row past 1000", async () => {
    // 1100 removed budgets (amount 0) come first; the live Groceries budget is row 1101.
    db["category_budgets"] = [
      ...Array.from({ length: 1100 }, (_, i) => ({
        category: `Old ${String(i).padStart(4, "0")}`,
        month: "2026-11-01",
        amount: 0,
        rollover: false,
      })),
      { category: "Zz Groceries", month: "2026-11-01", amount: 300, rollover: false },
    ];
    db["v_spend_by_category_monthly"] = [
      { month: "2026-11-01", category: "Zz Groceries", spend_eur: 120 },
    ];
    renderPage();
    expect(await screen.findByText(whole("€180.00 left"))).toBeTruthy();
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
    await screen.findByText(whole(/^€[0-9.,]+ left$/));
    expect(screen.queryByText(/apply from/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /previous/i }));
    expect(
      await screen.findByText(
        "Changes here apply from October 2026 onward, until a later month has its own budget.",
      ),
    ).toBeTruthy();
    // The note is there while October loads too, so wait for the row itself.
    fireEvent.click(await screen.findByRole("button", { name: /Change budget for Groceries/ }));
    fireEvent.change(screen.getByLabelText("Budget for Groceries"), { target: { value: "280" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(upserts).toHaveLength(1));
    expect(upserts[0]!.rows[0]).toMatchObject({ month: "2026-10-01", amount: 280 });
  });

  it("refuses an amount of 10 million or more in the add form", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText("Category"), { target: { value: "Groceries" } });
    fireEvent.change(screen.getByLabelText("Monthly budget in euros"), {
      target: { value: "10000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect((await screen.findByRole("alert")).textContent).toContain("below 10 million");
    expect(upserts).toHaveLength(0);
  });

  // protects=an income load failure is reported, not shown as a blank (P2-7)
  it("says when income couldn't load", async () => {
    failTable = "v_income_vs_expenses_monthly";
    renderPage();
    expect(await screen.findByText(/Couldn't load income: relation does not exist/)).toBeTruthy();
  });

  it("says when spending couldn't load", async () => {
    failTable = "v_spend_by_category_monthly";
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load spending: relation does not exist");
    // P2-4: the migration advice is for a missing budgets table only.
    expect(alert.textContent).not.toContain("UPGRADING.md");
  });

  it("says when a budget couldn't be saved", async () => {
    failUpsert = "permission denied";
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Start from my averages" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't save the budget", {
        description: "permission denied",
      }),
    );
  });

  it("removes a budget with Remove, and Cancel saves nothing", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-10-01", amount: 300, rollover: true },
    ];
    renderPage();
    const change = await screen.findByRole("button", { name: /Change budget for Groceries/ });
    fireEvent.click(change);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(upserts).toHaveLength(0);
    expect(screen.queryByLabelText("Budget for Groceries")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Change budget for Groceries/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(upserts).toHaveLength(1));
    expect(upserts[0]!.rows[0]).toMatchObject({
      category: "Groceries",
      month: "2026-11-01",
      amount: 0,
      rollover: false,
    });
  });

  it("prefills the add form with the average and adds the budget", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText("Category"), { target: { value: "Groceries" } });
    // (300 + 320) / 2 = 310.
    expect((screen.getByLabelText("Monthly budget in euros") as HTMLInputElement).value).toBe(
      "310",
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(upserts).toHaveLength(1));
    expect(upserts[0]!.rows[0]).toMatchObject({
      category: "Groceries",
      amount: 310,
      rollover: false,
      month: "2026-11-01",
    });
  });

  it("cannot go past the current month", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Start from my averages" });
    const next = screen.getByRole("button", { name: "Next month" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    await waitFor(() => expect(next.disabled).toBe(false));
  });

  // protects=unbudgeted spend: Uncategorized can't get a budget; a category with no earlier
  // months gets this month's spend rounded up to €10
  it("adds a budget for new spending, never for Uncategorized", async () => {
    db["category_budgets"] = [
      { category: "Groceries", month: "2026-11-01", amount: 300, rollover: false },
      { category: "Dine Out", month: "2026-11-01", amount: 50, rollover: false },
    ];
    db["v_spend_by_category_monthly"]!.push(
      { month: "2026-11-01", category: "Pets", spend_eur: 43 },
      { month: "2026-11-01", category: "Uncategorized", spend_eur: 20 },
      { month: "2026-11-01", category: "Transfer", spend_eur: 500 },
    );
    renderPage();
    expect(await screen.findByText("Uncategorized")).toBeTruthy();
    // Transfers aren't spending: not listed, and not offered in the add form.
    expect(screen.queryByText("Transfer")).toBeNull();
    const add = screen.getAllByRole("button", { name: "Add budget" });
    expect(add).toHaveLength(1);
    fireEvent.click(add[0]!);
    await waitFor(() => expect(upserts).toHaveLength(1));
    expect(upserts[0]!.rows[0]).toMatchObject({ category: "Pets", amount: 50 });
  });
});
