import { RETURN_NOISE_BAND } from "@/lib/performance";
import type { PerformanceRow } from "@/lib/performance";

// Total return the way a broker works it out, from your trades:
//   gain   = value now + everything sold - everything bought (so profit already taken counts)
//   return = gain / the most money you ever had in it at once (peak invested)
// Dividing by everything ever paid would let money moved in and out of a fund inflate the base;
// dividing by the cost of what's left would make a mostly sold holding show +980% on pennies.
// Fees count against you. Dividends are not counted.

export interface Trade {
  kind: string;
  key: string;
  side: string;
  trade_date: string;
  shares: number;
  price_eur: number;
  fee_eur: number;
}

// Trades and holdings are typed and synced apart; rounding dust is not a disagreement.
const QUANTITY_TOLERANCE = 0.000001;
// Worth less than this: a leftover. It asks for nothing and can't be best or worst.
const DUST_EUR = 10;

export type Measured =
  | { state: "no_trades" }
  | { state: "mismatch"; traded: number; held: number }
  | { state: "no_price" }
  | { state: "dust" }
  | { state: "ok"; gain: number; base: number; change: number | null };

const signed = (t: Trade) => (t.side === "buy" ? t.shares : -t.shares);
export const netShares = (trades: Array<Trade>) => trades.reduce((s, t) => s + signed(t), 0);

// Oldest first; on one day buys go first, so a same-day sale has shares to sell.
const inOrder = (trades: Array<Trade>) =>
  [...trades].sort(
    (a, b) => a.trade_date.localeCompare(b.trade_date) || a.side.localeCompare(b.side),
  );

/** Cash in, cash out, and the most that was ever in at once. */
function replay(trades: Array<Trade>) {
  let bought = 0;
  let sold = 0;
  let peak = 0;
  for (const t of inOrder(trades)) {
    if (t.side === "buy") bought += t.shares * t.price_eur + t.fee_eur;
    else sold += t.shares * t.price_eur - t.fee_eur;
    peak = Math.max(peak, bought - sold);
  }
  return { bought, sold, peak };
}

/** One holding's total return. Sold to zero: its profit counts, and it needs no current price. */
export function measure(row: PerformanceRow, trades: Array<Trade>): Measured {
  const held = row.quantity ?? 0;
  const value = held > 0 && row.end_price_eur != null ? held * row.end_price_eur : null;
  const isDust = value != null && value < DUST_EUR;
  if (trades.length === 0) return isDust ? { state: "dust" } : { state: "no_trades" };
  const traded = netShares(trades);
  if (Math.abs(traded - held) > QUANTITY_TOLERANCE) {
    return isDust ? { state: "dust" } : { state: "mismatch", traded, held };
  }
  if (held > 0 && value == null) return { state: "no_price" };

  const { bought, sold, peak } = replay(trades);
  const gain = (value ?? 0) + sold - bought;
  return { state: "ok", gain, base: peak, change: peak > 0 ? gain / peak : null };
}

/** Too small to rank: what's left is a leftover, however it started. */
const isRankable = (row: PerformanceRow) =>
  (row.quantity ?? 0) * (row.end_price_eur ?? 0) >= DUST_EUR;

export interface Ranked {
  key: string;
  name: string | null;
  change: number;
}

export interface TradeSummary {
  /** Return as a fraction, null when nothing can be measured. */
  change: number | null;
  gain: number;
  counted: number;
  /** Holdings that should have a number: counted, or missing trades or a price. */
  total: number;
  best: Array<Ranked>;
  worst: Array<Ranked>;
}

export interface MeasuredRow {
  row: PerformanceRow;
  measured: Measured;
}

/** Sold holdings and leftovers count towards the total, but only real positions are best or worst. */
function ranked(rows: Array<MeasuredRow>, n: number): Pick<TradeSummary, "best" | "worst"> {
  const list: Array<Ranked> = [];
  for (const { row, measured } of rows) {
    if (measured.state === "ok" && measured.change != null && isRankable(row)) {
      list.push({ key: row.key, name: row.name, change: measured.change });
    }
  }
  list.sort((a, b) => b.change - a.change || a.key.localeCompare(b.key));
  if (list.length < 2) return { best: [], worst: [] };
  const take = Math.min(n, Math.floor(list.length / 2));
  // A gain is never "worst": it has to be down, or flat within the noise band.
  const worst = list
    .slice(-take)
    .reverse()
    .filter((r) => r.change <= RETURN_NOISE_BAND);
  return { best: list.slice(0, take), worst };
}

export function summarizeTrades(rows: Array<MeasuredRow>, topN = 2): TradeSummary {
  const counted = rows.flatMap(({ measured }) => (measured.state === "ok" ? [measured] : []));
  const missing = rows.filter(
    ({ row, measured }) =>
      measured.state === "mismatch" ||
      ((measured.state === "no_trades" || measured.state === "no_price") &&
        (row.quantity ?? 0) > 0),
  );
  const gain = counted.reduce((s, m) => s + m.gain, 0);
  const base = counted.reduce((s, m) => s + m.base, 0);
  return {
    change: base > 0 ? gain / base : null,
    gain,
    counted: counted.length,
    total: counted.length + missing.length,
    ...ranked(rows, topN),
  };
}

/** Today in the browser's own timezone, as YYYY-MM-DD. */
export const localToday = () => new Date().toLocaleDateString("en-CA");

/** "12,5", "12.5", "1.234,56" and "1,234.56" all read as you'd expect. Null if not a number >= 0. */
export function parseAmount(input: string): number | null {
  let text = input.trim().replace(/\s/g, "");
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    text = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else {
    text = text.replace(",", ".");
  }
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
