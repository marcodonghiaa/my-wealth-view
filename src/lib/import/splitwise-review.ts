import type { BankMatch, BankTx, RateToEur } from "./splitwise-match";

// Small pure helpers for the Splitwise review screen: they turn database rows into what the
// matcher and the planner expect.

export interface BankRowFromDb {
  account_uid: string | null;
  entry_reference: string;
  booking_date: string | null;
  amount: number;
  currency: string;
  credit_debit_indicator: string | null;
  personal_amount: number | null;
  flow_type: string | null;
  deleted_at: string | null;
}

export interface FxRow {
  currency: string;
  date: string;
  rate_to_eur: number;
}

const cents = (euros: number) => Math.round(euros * 100);

/** A bank row as the matcher wants it, or null when it cannot be placed (deleted, no date...). */
export function toBankTx(r: BankRowFromDb): BankTx | null {
  const direction = r.credit_debit_indicator;
  if (r.deleted_at || !r.booking_date || !r.account_uid) return null;
  if (direction !== "DBIT" && direction !== "CRDT") return null;
  return {
    entryReference: r.entry_reference,
    accountUid: r.account_uid,
    bookingDate: r.booking_date,
    amountCents: cents(r.amount),
    currency: r.currency,
    direction,
    personalAmountCents: r.personal_amount === null ? null : cents(r.personal_amount),
    flowType: r.flow_type,
  };
}

/** Rate for a currency on a date: the latest one on or before it. Euros are 1. */
export function makeRate(rows: Array<FxRow>): RateToEur {
  const byCurrency = new Map<string, Array<FxRow>>();
  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    byCurrency.set(r.currency, [...(byCurrency.get(r.currency) ?? []), r]);
  }
  return (currency, date) => {
    if (currency === "EUR") return 1;
    const list = byCurrency.get(currency) ?? [];
    const before = list.filter((r) => r.date <= date);
    return before[before.length - 1]?.rate_to_eur ?? null;
  };
}

/** Matches that start ticked: only the sure ones. Doubtful ones wait for the user. */
export function defaultSelection(
  matches: Array<Pick<BankMatch, "row" | "confidence">>,
): Set<number> {
  return new Set(matches.filter((m) => m.confidence === "likely").map((m) => m.row));
}
