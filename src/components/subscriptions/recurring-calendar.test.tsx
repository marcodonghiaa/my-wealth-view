import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  charges: [] as Array<Row>,
  income: [] as Array<Row>,
  rules: [] as Array<Row> | "pending",
  error: null as { message: string } | null,
  rulesError: null as { message: string } | null,
  windowError: null as { message: string } | null,
  chargeReads: 0,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let side = "";
      const q: Record<string, unknown> = {};
      let from = 0;
      let broken = false;
      let gte = "";
      let lt = "\uffff";
      for (const m of ["select", "order", "is", "or"]) q[m] = () => q;
      q["gte"] = (_col: string, v: string) => ((gte = v), q);
      q["lt"] = (_col: string, v: string) => ((lt = v), q);
      // postgrest-js never escapes `"` in an in() value, so PostgREST rejects the request.
      q["in"] = (_col: string, values: Array<string>) => {
        broken = values.some((v) => v.includes('"'));
        return q;
      };
      q["range"] = (f: number) => {
        from = f;
        return q;
      };
      q["eq"] = (col: string, v: string) => {
        if (col === "credit_debit_indicator") side = v;
        return q;
      };
      q["then"] = (resolve: (v: unknown) => void) => {
        if (table === "category_rules") {
          if (db.rulesError) return resolve({ data: null, error: db.rulesError });
          return db.rules === "pending" ? undefined : resolve({ data: db.rules, error: null });
        }
        if (side === "CRDT" && db.windowError)
          return resolve({ data: null, error: db.windowError });
        if (side === "DBIT") db.chargeReads++;
        if (db.error) return resolve({ data: null, error: db.error });
        if (broken) return resolve({ data: null, error: { message: "failed to parse filter" } });
        const rows = (side === "DBIT" ? db.charges : db.income).filter(
          (r) => String(r["booking_date"]) >= gte && String(r["booking_date"]) < lt,
        );
        resolve({ data: rows.slice(from), error: null });
      };
      return q;
    },
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { RecurringCalendar } from "./recurring-calendar";

type Stream = Tables<"recurring_streams">;
const stream = (over: Partial<Stream>): Stream =>
  ({
    id: "s1",
    merchant_key: "streamflix",
    account_uid: "acc",
    currency: "EUR",
    display_name: "Streamflix",
    category: "Entertainment",
    cadence: "monthly",
    typical_amount: 10,
    last_charged: "2026-10-05",
    next_expected: "2026-11-05",
    user_cadence: null,
    custom_interval_value: null,
    custom_interval_unit: null,
    ...over,
  }) as Stream;
const credit = (ref: string, date: string) => ({
  account_uid: "acc",
  entry_reference: ref,
  booking_date: date,
  merchant_key: "acme",
  creditor_name: "Acme Payroll",
  remittance_info: null,
  amount: 2000,
  currency: "EUR",
});

const TODAY = new Date(2026, 10, 11);
// The summary line, read whole (its figures are separate spans).
const summary = (text: string) => (_: string, el: Element | null) =>
  el?.tagName === "P" && el.textContent === text;
const summaryLine = () =>
  screen.queryByText(
    (_, el) => el?.tagName === "P" && /^(Bills \d|\d+ bill)/.test(el.textContent ?? ""),
  );
const renderCal = (streams: Array<Stream>) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RecurringCalendar streams={streams} today={TODAY} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  db.charges = [];
  db.income = [credit("i1", "2026-09-27"), credit("i2", "2026-10-27"), credit("i3", "2026-08-27")];
  db.rules = [];
  db.error = null;
  db.rulesError = null;
  db.windowError = null;
  db.chargeReads = 0;
});

describe("RecurringCalendar", () => {
  it("ticks paid bills, expects the rest, and expects regular income on its usual day", async () => {
    db.charges = [
      {
        account_uid: "acc",
        entry_reference: "c1",
        booking_date: "2026-11-05",
        merchant_key: "streamflix",
        amount: 10,
        currency: "EUR",
      },
    ];
    renderCal([
      stream({}),
      stream({
        id: "s2",
        merchant_key: "gym",
        display_name: "Gym",
        next_expected: "2026-11-20",
        typical_amount: 30,
      }),
    ]);
    expect(
      await screen.findByText(summary("Bills 1 of 2 paid · Income 0 of 1 received")),
    ).toBeTruthy();
    const cell5 = screen.getByRole("cell", { name: /\b5 November: Streamflix €10\.00 paid$/ });
    expect(cell5).toBeTruthy();
    expect(screen.getByRole("cell", { name: /\b20 November: Gym €30\.00 expected$/ })).toBeTruthy();
    expect(
      screen.getByRole("cell", { name: /\b27 November: Acme Payroll \+€2,000\.00 expected$/ }),
    ).toBeTruthy();
  });

  // Polish 2 #1: a payee name with a quote went into the URL unescaped and broke the read.
  it("ticks a charge whose payee name has quotes and commas", async () => {
    const key = 'bar "da mario", roma';
    db.charges = [
      {
        account_uid: "acc",
        entry_reference: "c1",
        booking_date: "2026-11-05",
        merchant_key: key,
        amount: 10,
        currency: "EUR",
      },
    ];
    renderCal([stream({ merchant_key: key, display_name: "Bar da Mario" })]);
    expect(
      await screen.findByRole("cell", { name: /\b5 November: Bar da Mario €10\.00 paid$/ }),
    ).toBeTruthy();
    expect(screen.queryByText(/Couldn't load the calendar/)).toBeNull();
  });

  // Polish 3 #10: a year ahead, the list says which year.
  // Polish 3 #10 / Polish 4 #4: the heading already names the year, so the list's dates never
  // carry one (it wrapped them onto two lines), in this year or the next.
  it("dates the list by the viewed month, without a year", async () => {
    renderCal([stream({})]);
    await screen.findByText(/Bills/);
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(await screen.findByText("January 2027")).toBeTruthy();
    const row = (await screen.findAllByText("Bill · expected"))[0]!.closest("li")!;
    expect(row.textContent).toMatch(/^5 Jan/);
    expect(row.textContent).not.toMatch(/2027/);
  });

  // Polish 4 #2: income looks as it does on the Income page: ink with the incoming arrow, not a
  // green "+" (DESIGN.md: a positive number that isn't a change stays ink).
  it("shows income amounts in ink with the incoming arrow, like the Income page", async () => {
    renderCal([]);
    const row = (await screen.findByText("Income · expected")).closest("li")!;
    const amount = within(row).getByText("€2,000.00");
    expect(amount.className).not.toMatch(/text-positive/);
    expect(amount.querySelector("svg")).toBeTruthy();
    // Screen readers still hear the direction.
    expect(
      screen.getByRole("cell", { name: /\b27 November: Acme Payroll \+€2,000\.00 expected$/ }),
    ).toBeTruthy();
  });

  // Polish 4 #3: green means a gain in this app; a paid bill is money out. And on phones income
  // is told apart by shape (a ring), not by green.
  it("ticks paid bills in ink, and marks income dots by shape", async () => {
    db.charges = [
      {
        account_uid: "acc",
        entry_reference: "c1",
        booking_date: "2026-11-05",
        merchant_key: "streamflix",
        amount: 10,
        currency: "EUR",
        transaction_type: null,
      },
    ];
    const { container } = renderCal([stream({})]);
    await screen.findByRole("cell", { name: /\b5 November: Streamflix €10\.00 paid$/ });
    expect(container.querySelector(".text-positive, .bg-positive")).toBeNull();
    const cell27 = screen.getByRole("cell", { name: /\b27 November: Acme Payroll/ });
    expect(cell27.querySelector(".md\\:hidden > span")!.className).toMatch(/border/);
  });

  // Polish 4 #5: in a desktop cell the amount took the name's room ("Acme…"): it gets its own line.
  it("puts a chip's amount on its own line under the name", async () => {
    renderCal([stream({})]);
    const cell = await screen.findByRole("cell", { name: /\b5 November: Streamflix/ });
    const chip = cell.querySelector("ul li")!;
    const name = within(chip as HTMLElement).getByText("Streamflix");
    const amount = within(chip as HTMLElement).getByText("€10.00");
    expect(name.parentElement).toBe(amount.parentElement); // stacked in one column
    expect(name.className).toMatch(/\bblock\b/);
  });

  // Polish 4 #6: no "0 of 0" lines, a future month counts what's expected, income is "received"
  // like its rows, and the counts are figures (mono).
  it("sums the month in words that fit it", async () => {
    renderCal([stream({})]);
    const line = await screen.findByText(summary("Bills 0 of 1 paid · Income 0 of 1 received"));
    expect(line.querySelectorAll(".font-figure").length).toBe(4);
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(await screen.findByText(summary("1 bill · 1 income expected"))).toBeTruthy();
  });

  // Polish 4 #7: faded marks (60%/50% muted) fell under 3:1 on white; marks use the full token.
  it("draws status marks at full contrast", async () => {
    const { container } = renderCal([stream({ next_expected: "2026-11-20" })]);
    await screen.findByRole("cell", { name: /\b27 November: Acme Payroll/ }); // income too
    expect(
      screen.getByRole("cell", { name: /\b20 November: Streamflix .* expected$/ }),
    ).toBeTruthy();
    expect(container.querySelector('[class*="muted-foreground/"]')).toBeNull();
  });

  // Polish 4 #9: a plain table (a grid role promised arrow keys that did nothing), and each day
  // says its weekday and whether it is today.
  it("reads as a table whose days name the weekday and today", async () => {
    renderCal([stream({})]);
    expect(await screen.findByRole("table", { name: "November 2026" })).toBeTruthy();
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.getByRole("cell", { name: /^Wednesday,? 11 November, today/ })).toBeTruthy();
    expect(screen.getByRole("cell", { name: /^Thursday,? 5 November: Streamflix/ })).toBeTruthy();
  });

  // Polish 4 #13: the phone dots need a key; desktop has the chips' icons and words instead.
  it("explains the phone dots in a legend", async () => {
    renderCal([stream({})]);
    const legend = await screen.findByRole("list", { name: "What the dots mean" });
    expect(legend.className).toMatch(/md:hidden/);
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Bill paid", "Bill expected", "Income received", "Income expected", "Not seen yet"]);
  });

  it("calls a past unpaid date not seen yet", async () => {
    renderCal([stream({ next_expected: "2026-11-03" })]);
    expect(
      await screen.findByRole("cell", { name: /3 November: Streamflix €10\.00 not seen yet/ }),
    ).toBeTruthy();
  });

  it("lists the month below the grid", async () => {
    renderCal([stream({})]);
    expect(await screen.findByText("Income · expected")).toBeTruthy();
    const list = screen.getByText("Income · expected").closest("ul")!;
    expect(within(list).getByText("Bill · not seen yet")).toBeTruthy();
  });

  it("goes forward without reading charges, and stops a year ahead", async () => {
    renderCal([stream({})]);
    await screen.findByText(/Bills/);
    const reads = db.chargeReads;
    const next = screen.getByRole("button", { name: "Next month" });
    fireEvent.click(next);
    expect(
      await screen.findByRole("cell", { name: /\b5 December: Streamflix €10\.00 expected$/ }),
    ).toBeTruthy();
    expect(db.chargeReads).toBe(reads);
    for (let i = 0; i < 11; i++) fireEvent.click(next);
    expect(next).toBeDisabled();
    // Polish 4 #14: and says why.
    expect(screen.getByText("The calendar shows up to 12 months ahead.")).toBeTruthy();
  });

  it("offers Retry when the month can't be read", async () => {
    db.error = { message: "offline" };
    renderCal([stream({})]);
    const alert = await screen.findByRole("alert");
    db.error = null;
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText(summary("Bills 0 of 1 paid · Income 0 of 1 received")),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says when a past month had nothing", async () => {
    db.income = [];
    renderCal([stream({})]);
    await screen.findByText(/Bills/);
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    // Polish 4 #12: bills come from today's subscriptions only, so say "found", not "happened";
    // and the footnote's Income page is a link.
    expect(
      await screen.findByText("No recurring charges or income found in October 2026."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Income page" }).getAttribute("href")).toBe("/income");
  });

  it("shows an error when the month can't be read", async () => {
    db.error = { message: "offline" };
    renderCal([stream({})]);
    expect(await screen.findByText("Couldn't load the calendar: offline")).toBeTruthy();
    // Polish 3 #4: no counts or "nothing recurring" made up from the missing data.
    expect(screen.queryByText(/ of \d+ paid/)).toBeNull();
    expect(screen.queryByText(/Nothing recurring|No recurring/)).toBeNull();
    // Polish 5 D: nor a partial month: without the charges a paid bill would read "not seen yet".
    expect(screen.queryAllByText("Streamflix")).toEqual([]);
    expect(screen.queryAllByRole("cell", { name: /Streamflix/ })).toEqual([]);
  });

  it("doesn't call a month empty when it couldn't be read", async () => {
    db.error = { message: "offline" };
    renderCal([]);
    expect(await screen.findByText("Couldn't load the calendar: offline")).toBeTruthy();
    expect(screen.queryByText(/Nothing recurring|No recurring/)).toBeNull();
  });

  // Polish #13: before the rules load, the income count isn't known yet: no "Income 0 of 0".
  it("waits for the rules before counting income", async () => {
    db.rules = "pending";
    const { container } = renderCal([stream({})]);
    expect(await screen.findByRole("cell", { name: /\b5 November/ })).toBeTruthy();
    expect(container.querySelector(".animate-pulse")).toBeTruthy(); // still loading
    expect(screen.queryByText(/Income 0 of/)).toBeNull();
  });

  it("drops income a rule calls one-off", async () => {
    db.rules = [
      {
        id: "r",
        match_field: "creditor_name",
        match_text: "acme",
        match_mode: "word",
        set_income_kind: "one_off",
        set_category: null,
      },
    ];
    renderCal([]);
    expect(await screen.findByText(/^Nothing recurring/)).toBeTruthy();
    expect(summaryLine()).toBeNull();
  });
  // Polish 3 #12: the remaining branches.
  it("ticks income that arrived as received", async () => {
    db.income = [...db.income, credit("i4", "2026-11-03")];
    renderCal([]);
    expect(
      await screen.findByRole("cell", {
        name: /\b3 November: Acme Payroll \+€2,000\.00 received$/,
      }),
    ).toBeTruthy();
  });

  it("shows three entries a day and counts the rest", async () => {
    const day = (id: string, name: string) =>
      stream({
        id,
        merchant_key: name.toLowerCase(),
        display_name: name,
        next_expected: "2026-11-20",
      });
    renderCal([day("a", "A1"), day("b", "B2"), day("c", "C3"), day("d", "D4")]);
    expect(await screen.findByText("+1 more")).toBeTruthy();
  });

  it("judges a past month's income on the six months up to it", async () => {
    // Paid May, June, October: regular by October (May-Oct), not by November (Jun-Nov).
    db.income = [credit("m", "2026-05-27"), credit("j", "2026-06-27"), credit("o", "2026-10-27")];
    renderCal([]);
    expect(await screen.findByText(/^Nothing recurring/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(
      await screen.findByRole("cell", { name: /\b27 October: Acme Payroll .* received$/ }),
    ).toBeTruthy();
  });

  it("expects regular income in a future month", async () => {
    renderCal([]);
    await screen.findByText(/Bills/);
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(
      await screen.findByRole("cell", { name: /\b27 December: Acme Payroll .* expected$/ }),
    ).toBeTruthy();
  });

  it("shows the error when only the rules or only the income can't be read", async () => {
    db.rulesError = { message: "rules down" };
    const { unmount } = renderCal([stream({})]);
    expect(await screen.findByText("Couldn't load the calendar: rules down")).toBeTruthy();
    unmount();
    db.rulesError = null;
    db.windowError = { message: "income down" };
    renderCal([stream({})]);
    expect(await screen.findByText("Couldn't load the calendar: income down")).toBeTruthy();
  });

  it("reads no charges when there are no subscriptions", async () => {
    db.income = [];
    renderCal([]);
    await screen.findByText(/^Nothing recurring/);
    expect(db.chargeReads).toBe(0);
  });
});
