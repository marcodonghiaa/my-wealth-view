import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  charges: [] as Array<Row>,
  income: [] as Array<Row>,
  rules: [] as Array<Row>,
  error: null as { message: string } | null,
  chargeReads: 0,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let side = "";
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "gte", "lt", "in", "is", "or", "range"]) q[m] = () => q;
      q["eq"] = (col: string, v: string) => {
        if (col === "credit_debit_indicator") side = v;
        return q;
      };
      q["then"] = (resolve: (v: unknown) => void) => {
        if (table === "category_rules") return resolve({ data: db.rules, error: null });
        if (side === "DBIT") db.chargeReads++;
        if (db.error) return resolve({ data: null, error: db.error });
        resolve({ data: side === "DBIT" ? db.charges : db.income, error: null });
      };
      return q;
    },
  },
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
    expect(await screen.findByText("Bills 1 of 2 paid · Income 0 of 1 in")).toBeTruthy();
    const cell5 = screen.getByRole("gridcell", { name: /^5 November: Streamflix €10\.00 paid$/ });
    expect(cell5).toBeTruthy();
    expect(
      screen.getByRole("gridcell", { name: /^20 November: Gym €30\.00 expected$/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("gridcell", { name: /^27 November: Acme Payroll \+€2,000\.00 expected$/ }),
    ).toBeTruthy();
  });

  it("calls a past unpaid date not seen yet", async () => {
    renderCal([stream({ next_expected: "2026-11-03" })]);
    expect(
      await screen.findByRole("gridcell", { name: /3 November: Streamflix €10\.00 not seen yet/ }),
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
      await screen.findByRole("gridcell", { name: /^5 December: Streamflix €10\.00 expected$/ }),
    ).toBeTruthy();
    expect(db.chargeReads).toBe(reads);
    for (let i = 0; i < 11; i++) fireEvent.click(next);
    expect(next).toBeDisabled();
  });

  it("says when a past month had nothing", async () => {
    db.income = [];
    renderCal([stream({})]);
    await screen.findByText(/Bills/);
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(await screen.findByText("Nothing recurring happened in October 2026.")).toBeTruthy();
  });

  it("shows an error when the month can't be read", async () => {
    db.error = { message: "offline" };
    renderCal([stream({})]);
    expect(await screen.findByText("Couldn't load the calendar: offline")).toBeTruthy();
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
    expect(await screen.findByText("Bills 0 of 0 paid · Income 0 of 0 in")).toBeTruthy();
  });
});
