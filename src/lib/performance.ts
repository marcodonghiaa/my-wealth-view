import { RANGE_LABEL, monthAgo } from "@/lib/net-worth";
import type { ChartRange } from "@/lib/net-worth";

// The database picks each holding's prices for a range (holding_performance); lib/trades turns them
// and your trades into a return.

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

/** The database answers for stocks and coins together; each page summarizes its own kind. */
export function ofKind(
  rows: Array<PerformanceRow>,
  kind: "stock" | "crypto",
): Array<PerformanceRow> {
  return rows.filter((r) => r.kind === kind);
}

// Moves under half a percent are noise: shown without alarm colour (same band as the value change).
export const RETURN_NOISE_BAND = 0.005;

/** "+4.21%" / "−1.30%": two decimals and a real minus sign, like the rest of the app. */
export function formatReturn(change: number): string {
  const pct = Math.round(change * 10000) / 100; // round first so -0.00001 is "+0.00%", not "−0.00%"
  const text = Math.abs(pct).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${pct >= 0 ? "+" : "−"}${text}%`;
}
