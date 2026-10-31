import { RANGE_LABEL, monthAgo } from "@/lib/net-worth";
import type { ChartRange } from "@/lib/net-worth";

// Price return of what you hold today: sum(q x (p_now - p_start)) / sum(q x p_start), prices in EUR.
// Buying or selling shares never counts as performance. The database picks the prices
// (holding_performance); this file turns them into percentages.

export type HoldingRange = "1D" | ChartRange;
export const HOLDING_RANGES: Array<HoldingRange> = ["1D", "1M", "3M", "YTD", "2Y", "ALL"];
export const HOLDING_RANGE_LABEL: Record<HoldingRange, string> = {
  "1D": "Past day",
  ...RANGE_LABEL,
};

// ok: start price is within a week before the range start. since: first price is after the range
// start, so measured from start_date. stale: a hole in the prices, no honest number.
// no_price: nothing priced, or no exchange rate for its currency.
export type PerformanceStatus = "ok" | "since" | "stale" | "no_price";

export interface PerformanceRow {
  kind: string;
  key: string;
  name: string | null;
  quantity: number | null;
  start_date: string | null;
  start_price_eur: number | null;
  end_date: string | null;
  end_price_eur: number | null;
  status: string;
}

export interface RangeQuery {
  from: string; // p_from
  lastMove: boolean; // p_last_move
}

/** What to ask the database for: dates come from the latest data day, not the browser clock. */
export function rangeQuery(range: HoldingRange, lastIso: string): RangeQuery {
  switch (range) {
    case "1D":
      return { from: lastIso, lastMove: true };
    case "YTD":
      return { from: `${Number(lastIso.slice(0, 4)) - 1}-12-31`, lastMove: false };
    case "ALL":
      return { from: "1970-01-01", lastMove: false }; // every holding starts at its first price
    case "1M":
      return { from: monthAgo(lastIso, 1), lastMove: false };
    case "3M":
      return { from: monthAgo(lastIso, 3), lastMove: false };
    case "2Y":
      return { from: monthAgo(lastIso, 24), lastMove: false };
  }
}

interface Usable extends PerformanceRow {
  quantity: number;
  start_price_eur: number;
  end_price_eur: number;
  start_date: string;
  end_date: string;
}

// Rows that can carry a number: priced, not a hole, a real span, a positive start price.
function usable(row: PerformanceRow): row is Usable {
  return (
    (row.status === "ok" || row.status === "since") &&
    row.quantity != null &&
    row.quantity > 0 &&
    row.start_price_eur != null &&
    row.start_price_eur > 0 &&
    row.end_price_eur != null &&
    row.start_date != null &&
    row.end_date != null &&
    row.start_date !== row.end_date
  );
}

/** One holding's price return as a fraction (0.05 = +5%), or null when it has no honest number. */
export function rowReturn(row: PerformanceRow): number | null {
  return usable(row) ? row.end_price_eur / row.start_price_eur - 1 : null;
}

export interface Ranked {
  key: string;
  name: string | null;
  change: number;
}

export interface PerformanceSummary {
  /** Weighted price return as a fraction, null when nothing can be measured. */
  change: number | null;
  /** Holdings in the number. */
  counted: number;
  /** Of those, measured from their first price because they are younger than the range. */
  partial: number;
  /** Held but left out: no price, a hole in the prices, or a single price. */
  excluded: number;
  /** Set when every counted holding shares one start date that is after the range start. */
  since: string | null;
  best: Array<Ranked>;
  worst: Array<Ranked>;
}

/** Best and worst never overlap: with fewer than 2n holdings, the better half is best. */
function ranked(rows: Array<Usable>, n: number): Pick<PerformanceSummary, "best" | "worst"> {
  const list = rows
    .map((r) => ({ key: r.key, name: r.name, change: r.end_price_eur / r.start_price_eur - 1 }))
    .sort((a, b) => b.change - a.change || a.key.localeCompare(b.key));
  if (list.length < 2) return { best: [], worst: [] };
  const take = Math.min(n, Math.floor(list.length / 2));
  return { best: list.slice(0, take), worst: list.slice(-take).reverse() };
}

export function summarize(rows: Array<PerformanceRow>, topN = 2): PerformanceSummary {
  const counted = rows.filter(usable);
  const cost = counted.reduce((s, r) => s + r.quantity * r.start_price_eur, 0);
  const gain = counted.reduce((s, r) => s + r.quantity * (r.end_price_eur - r.start_price_eur), 0);
  const partial = counted.filter((r) => r.status === "since");
  const startDates = new Set(partial.map((r) => r.start_date));
  return {
    change: cost > 0 ? gain / cost : null,
    counted: counted.length,
    partial: partial.length,
    excluded: rows.length - counted.length,
    since: partial.length === counted.length && startDates.size === 1 ? [...startDates][0]! : null,
    ...ranked(counted, topN),
  };
}

/** Rows by the key the page uses: isin for a stock or fund, upper-case symbol for a coin. */
export function byKey(rows: Array<PerformanceRow>): Map<string, PerformanceRow> {
  return new Map(rows.map((r) => [`${r.kind}:${r.key}`, r]));
}
