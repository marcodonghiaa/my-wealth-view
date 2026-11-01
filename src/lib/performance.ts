import { RANGE_LABEL } from "@/lib/net-worth";
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
