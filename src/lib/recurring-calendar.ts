import type { Tables } from "@/integrations/supabase/types";
import { formatISODate } from "@/lib/date";
import type { RegularSource } from "@/lib/regular-income";

// The recurring calendar: one month of expected charges (from recurring_streams) and regular
// income, each ticked once it has happened. Pure date math on ISO "YYYY-MM-DD" strings.

type Stream = Tables<"recurring_streams">;

export type EntryStatus = "done" | "late" | "upcoming";

export interface CalendarEntry {
  id: string;
  date: string;
  kind: "bill" | "income";
  name: string;
  /** Always positive; `kind` says the direction. */
  amount: number;
  currency: string;
  category: string | null;
  status: EntryStatus;
}

/** A debit counted as spend, as read from `transactions`. `transaction_type` is 'Subscription'
 * when the AI tagged it; the stream detector builds tagged streams from these. */
export type ChargeTx = Pick<
  Tables<"transactions">,
  | "account_uid"
  | "entry_reference"
  | "booking_date"
  | "merchant_key"
  | "amount"
  | "currency"
  | "transaction_type"
>;

// A charge belongs to a stream when it is tagged Subscription or costs within 10% of the usual
// amount (the detector's own band), so a one-off purchase at the same shop never counts as paid.
const AMOUNT_BAND = 0.1;
const belongs = (c: ChargeTx, s: Stream) => {
  if (c.transaction_type === "Subscription") return true;
  const usual = Math.abs(s.typical_amount ?? 0);
  return Math.abs(Math.abs(c.amount) - usual) <= usual * AMOUNT_BAND;
};

const DAY_MS = 86_400_000;
const parse = (iso: string) => new Date(`${iso}T00:00:00`);
const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth();

// A day that doesn't exist in the target month lands on its last day (31 Jan + 1 month = 28 Feb).
function addMonths(iso: string, months: number, day = Number(iso.slice(8, 10))): string {
  const d = parse(iso);
  const last = new Date(d.getFullYear(), d.getMonth() + months + 1, 0).getDate();
  return formatISODate(new Date(d.getFullYear(), d.getMonth() + months, Math.min(day, last)));
}
const addDays = (iso: string, days: number) =>
  formatISODate(new Date(parse(iso).getTime() + days * DAY_MS + 12 * 3_600_000));

type Step = { days: number } | { months: number };

/** One period of the stream's cadence (yours wins over the detected one); null when unknown. */
export function cadenceStep(s: Stream): Step | null {
  const cadence = s.user_cadence ?? s.cadence;
  if (cadence === "weekly") return { days: 7 };
  if (cadence === "monthly") return { months: 1 };
  if (cadence === "quarterly") return { months: 3 };
  if (cadence === "yearly") return { months: 12 };
  if (cadence !== "custom" || !s.custom_interval_value || s.custom_interval_value < 1) return null;
  const n = s.custom_interval_value;
  switch (s.custom_interval_unit) {
    case "days":
      return { days: n };
    case "weeks":
      return { days: 7 * n };
    case "months":
      return { months: n };
    case "years":
      return { months: 12 * n };
    default:
      return null;
  }
}

const stepDays = (step: Step) => ("days" in step ? step.days : step.months * 30.437);

// The anchor's day of month is kept across steps, so 31 Jan → 28 Feb → 31 Mar, not 28 Mar.
function nth(anchor: string, step: Step, n: number): string {
  return "days" in step ? addDays(anchor, step.days * n) : addMonths(anchor, step.months * n);
}

/** The 1st of `month` and of the month after, as ISO dates. */
export function monthBounds(month: Date): { start: string; end: string } {
  return {
    start: formatISODate(new Date(month.getFullYear(), month.getMonth(), 1)),
    end: formatISODate(new Date(month.getFullYear(), month.getMonth() + 1, 1)),
  };
}

/**
 * Charges in `month` for `streams`: each charge from a stream's name and account that belongs to
 * it (tagged Subscription, or near its usual amount) is ticked (when
 * several streams share them, as PayPal or Apple do, the one with the nearest usual amount takes
 * it); from this month on, the dates still expected are added, late once past `today`.
 */
export function billEntries(
  streams: ReadonlyArray<Stream>,
  charges: ReadonlyArray<ChargeTx>,
  month: Date,
  today: Date,
): Array<CalendarEntry> {
  const { start, end } = monthBounds(month);
  const todayIso = formatISODate(today);
  const out: Array<CalendarEntry> = [];
  const paid = new Map<string, Array<string>>(); // stream id -> paid dates this month

  for (const c of charges) {
    if (!c.booking_date || c.booking_date < start || c.booking_date >= end) continue;
    const amount = Math.abs(c.amount);
    const owner = streams
      .filter(
        (s) =>
          s.merchant_key === c.merchant_key && s.account_uid === c.account_uid && belongs(c, s),
      )
      .sort(
        (a, b) =>
          Math.abs(Math.abs(a.typical_amount ?? 0) - amount) -
          Math.abs(Math.abs(b.typical_amount ?? 0) - amount),
      )[0];
    if (!owner) continue;
    paid.set(owner.id, [...(paid.get(owner.id) ?? []), c.booking_date]);
    out.push({
      id: `paid:${c.account_uid}:${c.entry_reference}`,
      date: c.booking_date,
      kind: "bill",
      name: owner.display_name ?? owner.merchant_key,
      amount,
      currency: c.currency,
      category: owner.category,
      status: "done",
    });
  }

  // Past months are history: only what was paid.
  if (monthKey(month) < monthKey(today)) return out;

  for (const s of streams) {
    const step = cadenceStep(s);
    const anchor =
      s.next_expected ?? (step && s.last_charged ? nth(s.last_charged, step, 1) : null);
    if (!step || !anchor) continue;
    // A charge within this many days of an expected date is that date's payment.
    const tolerance = Math.min(7, Math.floor(stepDays(step) / 2));
    const dates = paid.get(s.id) ?? [];
    for (let n = 0, date = anchor; date < end && n < 400; date = nth(anchor, step, ++n)) {
      if (date < start) continue;
      const covered = dates.some(
        // Whole days: across a clock change a week is 7 days ± 1 hour.
        (d) =>
          Math.round(Math.abs(parse(d).getTime() - parse(date).getTime()) / DAY_MS) <= tolerance,
      );
      if (covered) continue;
      out.push({
        id: `due:${s.id}:${date}`,
        date,
        kind: "bill",
        name: s.display_name ?? s.merchant_key,
        amount: Math.abs(s.typical_amount ?? 0),
        currency: s.currency,
        category: s.category,
        status: date < todayIso ? "late" : "upcoming",
      });
    }
  }
  return out;
}

/**
 * Regular income in `month`: what arrived, ticked; from this month on, a source that hasn't paid
 * yet is expected on its usual day (late once past `today`).
 */
export function incomeEntries(
  sources: ReadonlyArray<RegularSource>,
  month: Date,
  today: Date,
): Array<CalendarEntry> {
  const { start, end } = monthBounds(month);
  const todayIso = formatISODate(today);
  const out: Array<CalendarEntry> = [];
  for (const src of sources) {
    const received = src.rows.filter((t) => t.booking_date! >= start && t.booking_date! < end);
    for (const t of received)
      out.push({
        id: `in:${t.account_uid}:${t.entry_reference}`,
        date: t.booking_date!,
        kind: "income",
        name: src.name,
        amount: Math.abs(t.amount),
        currency: t.currency,
        category: null,
        status: "done",
      });
    if (received.length > 0 || monthKey(month) < monthKey(today)) continue;
    const date = addMonths(start, 0, src.day);
    out.push({
      id: `expect:${src.key}:${date}`,
      date,
      kind: "income",
      name: src.name,
      amount: src.amount,
      currency: src.currency,
      category: null,
      status: date < todayIso ? "late" : "upcoming",
    });
  }
  return out;
}

/** The month as weeks of 7 days, Monday first; days outside the month are null. */
export function monthGrid(month: Date): Array<Array<Date | null>> {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells: Array<Date | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from(
      { length: days },
      (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1),
    ),
  ];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** Entries grouped by ISO date, bills and income each in date-then-name order. */
export function byDay(entries: ReadonlyArray<CalendarEntry>): Map<string, Array<CalendarEntry>> {
  const map = new Map<string, Array<CalendarEntry>>();
  for (const e of [...entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.kind === b.kind ? 0 : a.kind === "income" ? -1 : 1) ||
      a.name.localeCompare(b.name),
  ))
    map.set(e.date, [...(map.get(e.date) ?? []), e]);
  return map;
}
