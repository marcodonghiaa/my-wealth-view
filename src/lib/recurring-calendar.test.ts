import { describe, expect, it } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import {
  billEntries,
  byDay,
  cadenceStep,
  incomeEntries,
  monthBounds,
  monthGrid,
  type ChargeTx,
} from "./recurring-calendar";
import type { RegularSource } from "./regular-income";

type Stream = Tables<"recurring_streams">;

const stream = (over: Partial<Stream> = {}): Stream => ({
  id: "s1",
  user_id: "u",
  stream_key: "netflix|acc",
  merchant_key: "netflix",
  account_uid: "acc",
  currency: "EUR",
  display_name: "Netflix",
  category: "Entertainment",
  cadence: "monthly",
  typical_amount: 12.99,
  typical_amount_eur: 12.99,
  charge_count: 5,
  first_charged: "2026-06-05",
  last_charged: "2026-10-05",
  next_expected: "2026-11-05",
  detected_status: "active",
  is_direct_debit: false,
  detected_at: null,
  user_status: null,
  user_cadence: null,
  custom_interval_value: null,
  custom_interval_unit: null,
  source: "bank",
  updated_at: null,
  ...over,
});
const charge = (date: string, over: Partial<ChargeTx> = {}): ChargeTx => ({
  account_uid: "acc",
  entry_reference: `c-${date}`,
  booking_date: date,
  merchant_key: "netflix",
  amount: 12.99,
  currency: "EUR",
  transaction_type: null,
  ...over,
});
const NOV = new Date(2026, 10, 1);
const TODAY = new Date(2026, 10, 11);

describe("cadenceStep", () => {
  it("reads each cadence, yours first", () => {
    expect(cadenceStep(stream({ cadence: "weekly" }))).toEqual({ days: 7 });
    expect(cadenceStep(stream({ cadence: "quarterly" }))).toEqual({ months: 3 });
    expect(cadenceStep(stream({ cadence: "monthly", user_cadence: "yearly" }))).toEqual({
      months: 12,
    });
  });
  it("reads custom intervals in every unit", () => {
    const custom = (v: number | null, u: string | null) =>
      cadenceStep(
        stream({ user_cadence: "custom", custom_interval_value: v, custom_interval_unit: u }),
      );
    expect(custom(10, "days")).toEqual({ days: 10 });
    expect(custom(2, "weeks")).toEqual({ days: 14 });
    expect(custom(2, "months")).toEqual({ months: 2 });
    expect(custom(1, "years")).toEqual({ months: 12 });
    expect(custom(2, "fortnights")).toBeNull();
    expect(custom(null, "days")).toBeNull();
  });
  it("is null without a cadence", () => {
    expect(cadenceStep(stream({ cadence: null }))).toBeNull();
  });
});

describe("monthBounds", () => {
  it("spans the month", () => {
    expect(monthBounds(new Date(2026, 11, 15))).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });
});

describe("billEntries", () => {
  it("ticks a paid charge and doesn't expect it again", () => {
    const out = billEntries([stream()], [charge("2026-11-06")], NOV, TODAY);
    expect(out).toEqual([
      expect.objectContaining({
        date: "2026-11-06",
        status: "done",
        name: "Netflix",
        kind: "bill",
      }),
    ]);
  });
  it("expects an unpaid date: late once past, upcoming after today", () => {
    const late = billEntries([stream()], [], NOV, TODAY);
    expect(late).toEqual([expect.objectContaining({ date: "2026-11-05", status: "late" })]);
    const upcoming = billEntries([stream({ next_expected: "2026-11-20" })], [], NOV, TODAY);
    expect(upcoming[0]).toMatchObject({ date: "2026-11-20", status: "upcoming", amount: 12.99 });
  });
  it("projects future months, keeping the day (31st → end of a short month)", () => {
    const s = stream({ next_expected: "2027-01-31" });
    expect(billEntries([s], [], new Date(2027, 1, 1), TODAY).map((e) => e.date)).toEqual([
      "2027-02-28",
    ]);
    expect(billEntries([s], [], new Date(2027, 2, 1), TODAY).map((e) => e.date)).toEqual([
      "2027-03-31",
    ]);
  });
  it("lists every weekly date in the month", () => {
    const s = stream({ cadence: "weekly", next_expected: "2026-11-02" });
    expect(billEntries([s], [], NOV, TODAY).map((e) => `${e.date} ${e.status}`)).toEqual([
      "2026-11-02 late",
      "2026-11-09 late",
      "2026-11-16 upcoming",
      "2026-11-23 upcoming",
      "2026-11-30 upcoming",
    ]);
  });
  it("skips a yearly charge in the months it isn't due", () => {
    const s = stream({ cadence: "yearly", next_expected: "2027-03-10" });
    expect(billEntries([s], [], new Date(2026, 11, 1), TODAY)).toEqual([]);
    expect(billEntries([s], [], new Date(2027, 2, 1), TODAY)).toHaveLength(1);
  });
  it("starts from the last charge when there is no next date", () => {
    const s = stream({ next_expected: null, last_charged: "2026-10-20" });
    expect(billEntries([s], [], NOV, TODAY)[0]?.date).toBe("2026-11-20");
    expect(
      billEntries([stream({ next_expected: null, last_charged: null })], [], NOV, TODAY),
    ).toEqual([]);
    expect(billEntries([stream({ cadence: null })], [], NOV, TODAY)).toEqual([]);
  });
  it("shows only what was paid in past months", () => {
    const oct = new Date(2026, 9, 1);
    const s = stream({ next_expected: "2026-10-05" });
    expect(billEntries([s], [], oct, TODAY)).toEqual([]);
    expect(billEntries([s], [charge("2026-10-05")], oct, TODAY)).toHaveLength(1);
  });
  it("ignores charges outside the month, from other names or accounts", () => {
    const out = billEntries(
      [stream({ next_expected: "2026-11-25" })],
      [
        charge("2026-10-30"),
        charge("2026-11-03", { merchant_key: "spotify" }),
        charge("2026-11-04", { account_uid: "other" }),
        charge("2026-11-05", { booking_date: null }),
      ],
      NOV,
      TODAY,
    );
    expect(out.map((e) => e.status)).toEqual(["upcoming"]);
  });
  it("doesn't tick a one-off purchase at the same merchant (Polish #1)", () => {
    const s = stream({ merchant_key: "amazon", display_name: "Prime", typical_amount: 4.99 });
    const out = billEntries(
      [s],
      [
        charge("2026-11-04", {
          merchant_key: "amazon",
          amount: 63.2,
          transaction_type: "One-time",
        }),
      ],
      NOV,
      TODAY,
    );
    expect(out.map((e) => `${e.date} ${e.status}`)).toEqual(["2026-11-05 late"]);
  });
  it("ticks a charge tagged Subscription, or one within 10% of the usual amount", () => {
    const s = stream({ merchant_key: "amazon", display_name: "Prime", typical_amount: 4.99 });
    const tagged = charge("2026-11-05", {
      merchant_key: "amazon",
      amount: 6.99,
      transaction_type: "Subscription",
    });
    const near = charge("2026-11-05", {
      merchant_key: "amazon",
      amount: 5.4,
      transaction_type: null,
    });
    expect(billEntries([s], [tagged], NOV, TODAY)[0]?.status).toBe("done");
    expect(billEntries([s], [near], NOV, TODAY)[0]?.status).toBe("done");
  });
  // Polish #8: across a clock change a week is 7 days ± 1 hour; a charge 7 days off its date
  // still pays it. New York's clocks go back on 1 Nov 2026.
  it("counts a charge 7 days off across a clock change as paid", () => {
    const tz = process.env["TZ"];
    process.env["TZ"] = "America/New_York";
    try {
      const s = stream({ next_expected: "2026-11-08" });
      const nov = new Date(2026, 10, 1); // made in New York time
      const out = billEntries([s], [charge("2026-11-01")], nov, nov);
      expect(out.map((e) => `${e.date} ${e.status}`)).toEqual(["2026-11-01 done"]);
    } finally {
      if (tz === undefined) delete process.env["TZ"];
      else process.env["TZ"] = tz;
    }
  });
  it("gives a shared name's charge to the stream with the nearest usual amount", () => {
    const a = stream({
      id: "a",
      merchant_key: "paypal",
      display_name: "PayPal 5",
      typical_amount: 5,
    });
    const b = stream({
      id: "b",
      merchant_key: "paypal",
      display_name: "PayPal 40",
      typical_amount: 40,
    });
    const out = billEntries(
      [a, b],
      [charge("2026-11-05", { merchant_key: "paypal", amount: 39 })],
      NOV,
      TODAY,
    );
    expect(out.find((e) => e.status === "done")?.name).toBe("PayPal 40");
    expect(out.filter((e) => e.status !== "done").map((e) => e.name)).toEqual(["PayPal 5"]);
  });
  it("names the stream by its key when it has no name, and uses its currency", () => {
    const s = stream({ display_name: null, currency: "USD", next_expected: "2026-11-20" });
    expect(billEntries([s], [], NOV, TODAY)[0]).toMatchObject({ name: "netflix", currency: "USD" });
    const paid = billEntries([s], [charge("2026-11-20", { currency: "USD" })], NOV, TODAY)[0];
    expect(paid).toMatchObject({ name: "netflix", currency: "USD", status: "done" });
  });
});

describe("incomeEntries", () => {
  const src = (over: Partial<RegularSource> = {}): RegularSource => ({
    key: "acme",
    name: "Acme",
    day: 27,
    amount: 2000,
    currency: "EUR",
    rows: [],
    ...over,
  });
  const row = (date: string, amount = 2100) => ({
    account_uid: "acc",
    entry_reference: date,
    booking_date: date,
    merchant_key: "acme",
    creditor_name: "Acme",
    remittance_info: null,
    amount,
    currency: "EUR",
  });

  it("ticks what arrived this month", () => {
    const out = incomeEntries([src({ rows: [row("2026-11-03")] })], NOV, TODAY);
    expect(out).toEqual([
      expect.objectContaining({ date: "2026-11-03", status: "done", amount: 2100, kind: "income" }),
    ]);
  });
  it("expects a source that hasn't paid yet on its usual day", () => {
    expect(incomeEntries([src()], NOV, TODAY)[0]).toMatchObject({
      date: "2026-11-27",
      status: "upcoming",
      amount: 2000,
    });
    expect(incomeEntries([src({ day: 2 })], NOV, TODAY)[0]?.status).toBe("late");
    expect(incomeEntries([src({ day: 31 })], NOV, TODAY)[0]?.date).toBe("2026-11-30");
  });
  it("adds nothing expected in past months", () => {
    expect(
      incomeEntries([src({ rows: [row("2026-11-03")] })], new Date(2026, 9, 1), TODAY),
    ).toEqual([]);
  });
  it("shows what arrived in the currency it arrived in", () => {
    const r = { ...row("2026-11-03"), currency: "CHF" };
    expect(incomeEntries([src({ currency: "EUR", rows: [r] })], NOV, TODAY)[0]?.currency).toBe(
      "CHF",
    );
  });
});

describe("monthGrid", () => {
  it("starts weeks on Monday and pads with nulls", () => {
    const weeks = monthGrid(NOV); // 1 Nov 2026 is a Sunday
    expect(weeks[0]!.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(weeks[0]![6]!.getDate()).toBe(1);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(weeks.at(-1)!.at(-1)).toBeNull();
  });
  it("needs no padding when the month starts on Monday", () => {
    expect(monthGrid(new Date(2027, 1, 1))[0]![0]!.getDate()).toBe(1); // Feb 2027
  });
});

describe("byDay", () => {
  it("groups by date, income before bills, then by name", () => {
    const e = (date: string, kind: "bill" | "income", name: string) => ({
      id: `${date}${name}`,
      date,
      kind,
      name,
      amount: 1,
      currency: "EUR",
      category: null,
      status: "done" as const,
    });
    const map = byDay([
      e("2026-11-05", "bill", "B"),
      e("2026-11-05", "income", "Z"),
      e("2026-11-05", "bill", "A"),
      e("2026-11-01", "bill", "C"),
    ]);
    expect([...map.keys()]).toEqual(["2026-11-01", "2026-11-05"]);
    expect(map.get("2026-11-05")!.map((x) => x.name)).toEqual(["Z", "A", "B"]);
  });
});
