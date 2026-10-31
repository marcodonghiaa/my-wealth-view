import type { PerformanceRow } from "@/lib/performance";

// Performance the way a broker works it out, from your trades. Over a range:
//   gain   = value now + sold in the range - value at the start - bought in the range
//   return = gain / (value at the start + bought in the range)
// Fees count against you. ALL has no start value, so it is the total return: everything you got or
// still hold, minus everything you paid. Dividends are not counted. Not time-weighted.

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
  // You held none of it at any point in this range: it has nothing to say here.
  | { state: "not_held" }
  | { state: "ok"; gain: number; base: number; change: number | null; since: string | null };

const signed = (t: Trade) => (t.side === "buy" ? t.shares : -t.shares);
export const netShares = (trades: Array<Trade>) => trades.reduce((s, t) => s + signed(t), 0);

const cash = (trades: Array<Trade>, side: string) =>
  trades
    .filter((t) => t.side === side)
    .reduce((s, t) => s + t.shares * t.price_eur + (side === "buy" ? t.fee_eur : -t.fee_eur), 0);

/** One holding over a range. `all` is the ALL range: no start value, every trade is inside it. */
export function measure(row: PerformanceRow, trades: Array<Trade>, all: boolean): Measured {
  if (trades.length === 0) return { state: "no_trades" };
  const held = row.quantity ?? 0;
  const traded = netShares(trades);
  if (Math.abs(traded - held) > QUANTITY_TOLERANCE) return { state: "mismatch", traded, held };

  // A holding sold to zero is worth nothing now, whatever its last price.
  const endPrice = row.end_price_eur;
  if (held > 0 && endPrice == null) return { state: "no_price" };
  const valueNow = held > 0 ? held * endPrice! : 0;

  let start: string | null = null;
  let inside = trades;
  let startValue = 0;
  let since: string | null = null;
  if (!all) {
    const measurable = row.status === "ok" || row.status === "since";
    if (!measurable || row.start_date == null || row.start_price_eur == null) {
      return { state: "no_price" };
    }
    if (row.start_date === row.end_date) return { state: "no_price" };
    start = row.start_date;
    // A range starts at that day's close, so that day's trades are already in the start value. But
    // on the first price we have there is no earlier value: a buy that day still counts at cost.
    const onStart = (t: Trade) => row.status === "ok" && t.trade_date === start;
    const before = trades.filter((t) => t.trade_date < start! || onStart(t));
    startValue = netShares(before) * row.start_price_eur;
    inside = trades.filter((t) => !before.includes(t));
    // Bought before the first price we have, so the range can only start at that price.
    if (row.status === "since" && before.length > 0) since = row.start_date;
  }

  const bought = cash(inside, "buy");
  const sold = cash(inside, "sell");
  const base = startValue + bought;
  if (inside.length === 0 && startValue === 0) return { state: "not_held" };
  const gain = valueNow + sold - startValue - bought;
  return { state: "ok", gain, base, change: base > 0 ? gain / base : null, since };
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
  /** Of those counted, measured from their first price because the trades are older. */
  partial: number;
  /** Set when every counted holding starts at the same later date. */
  since: string | null;
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
  return { best: list.slice(0, take), worst: list.slice(-take).reverse() };
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
  const partial = counted.filter((m) => m.since != null);
  const starts = new Set(partial.map((m) => m.since));
  return {
    change: base > 0 ? gain / base : null,
    gain,
    counted: counted.length,
    total: counted.length + missing.length,
    partial: partial.length,
    since: partial.length === counted.length && starts.size === 1 ? [...starts][0]! : null,
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
