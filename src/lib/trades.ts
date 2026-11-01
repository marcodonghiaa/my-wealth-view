import { RETURN_NOISE_BAND } from "@/lib/performance";
import type { PerformanceRow } from "@/lib/performance";

// Total return the way a broker works it out, from your trades:
//   gain   = value now + everything sold - everything bought (so profit already taken counts)
//   return = gain / cost of what you still hold, at average cost
// Dividing by everything ever paid would let money moved in and out of a fund inflate the base.
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

export type Measured =
  | { state: "no_trades" }
  | { state: "mismatch"; traded: number; held: number }
  | { state: "no_price" }
  | { state: "ok"; gain: number; base: number; change: number | null };

const signed = (t: Trade) => (t.side === "buy" ? t.shares : -t.shares);
export const netShares = (trades: Array<Trade>) => trades.reduce((s, t) => s + signed(t), 0);

// Oldest first; on one day buys go first, so a same-day sale has shares to sell.
const inOrder = (trades: Array<Trade>) =>
  [...trades].sort(
    (a, b) => a.trade_date.localeCompare(b.trade_date) || a.side.localeCompare(b.side),
  );

/** Cash in, cash out, and the average cost of the shares left after every trade. */
function replay(trades: Array<Trade>) {
  let shares = 0;
  let cost = 0;
  let bought = 0;
  let sold = 0;
  for (const t of inOrder(trades)) {
    if (t.side === "buy") {
      const paid = t.shares * t.price_eur + t.fee_eur;
      bought += paid;
      cost += paid;
      shares += t.shares;
    } else {
      sold += t.shares * t.price_eur - t.fee_eur;
      if (shares > 0) cost -= (cost / shares) * Math.min(t.shares, shares);
      shares = Math.max(0, shares - t.shares);
    }
  }
  return { bought, sold, cost: shares > QUANTITY_TOLERANCE ? cost : 0 };
}

/** One holding's total return. Sold to zero: its profit counts, and it needs no current price. */
export function measure(row: PerformanceRow, trades: Array<Trade>): Measured {
  if (trades.length === 0) return { state: "no_trades" };
  const held = row.quantity ?? 0;
  const traded = netShares(trades);
  if (Math.abs(traded - held) > QUANTITY_TOLERANCE) return { state: "mismatch", traded, held };
  if (held > 0 && row.end_price_eur == null) return { state: "no_price" };

  const { bought, sold, cost } = replay(trades);
  const gain = (held > 0 ? held * row.end_price_eur! : 0) + sold - bought;
  return { state: "ok", gain, base: cost, change: cost > 0 ? gain / cost : null };
}

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

/** Sold holdings count towards the total, but only what you still hold is best or worst. */
function ranked(rows: Array<MeasuredRow>, n: number): Pick<TradeSummary, "best" | "worst"> {
  const list: Array<Ranked> = [];
  for (const { row, measured } of rows) {
    if (measured.state === "ok" && measured.change != null && (row.quantity ?? 0) > 0) {
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
