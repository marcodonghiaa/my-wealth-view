import type { PerformanceRow } from "@/lib/performance";

// The demo's stand-in for the database function holding_performance, with the same rules over the
// demo's own snapshots (it has no price_history): latest price on or before the start, a first
// price after the start is "since", a start more than a week stale is "stale", and 1D (last_move)
// compares with the latest earlier price that differs. EUR uses each snapshot's own rate.
type Row = Record<string, unknown>;
type Point = { date: string; eur: number };

const STALE_DAYS = 7;
const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / DAY_MS;

function toRow(
  kind: string,
  key: string,
  name: string | null,
  quantity: number,
  points: Array<Point>,
  from: string,
  lastMove: boolean,
): PerformanceRow {
  const series = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const end = series.at(-1);
  const base = { kind, key, name, quantity };
  if (!end) {
    return {
      ...base,
      start_date: null,
      start_price_eur: null,
      end_date: null,
      end_price_eur: null,
      status: "no_price",
    };
  }
  const limit = lastMove ? addDays(end.date, -1) : from < end.date ? from : end.date;
  const before = series.filter((p) => p.date <= limit);
  const start = lastMove
    ? ([...before]
        .reverse()
        .find((p) => p.eur !== end.eur && daysBetween(end.date, p.date) <= STALE_DAYS) ??
      before.at(-1))
    : before.at(-1);
  const first = start ?? series[0]!;
  const status = !start
    ? "since"
    : !lastMove && daysBetween(limit, start.date) > STALE_DAYS
      ? "stale"
      : "ok";
  return {
    ...base,
    start_date: first.date,
    start_price_eur: first.eur,
    end_date: end.date,
    end_price_eur: end.eur,
    status,
  };
}

const addDays = (iso: string, n: number) =>
  new Date(Date.parse(iso) + n * DAY_MS).toISOString().slice(0, 10);

export function demoHoldingPerformance(
  db: Record<string, Array<Row>>,
  from: string,
  lastMove: boolean,
): Array<PerformanceRow> {
  const stocks = (db["portfolio_holdings"] ?? [])
    .filter((h) => (h["shares"] as number) > 0)
    .map((h) => {
      const points = (db["portfolio_snapshots"] ?? [])
        .filter((s) => s["isin"] === h["isin"] && (s["value_native"] as number) > 0)
        .map((s) => ({
          date: s["snapshot_date"] as string,
          eur:
            (s["price"] as number) * ((s["value_eur"] as number) / (s["value_native"] as number)),
        }));
      return toRow(
        "stock",
        h["isin"] as string,
        h["name"] as string,
        h["shares"] as number,
        points,
        from,
        lastMove,
      );
    });
  const symbols = [
    ...new Set((db["crypto_holdings"] ?? []).map((c) => c["asset_symbol"] as string)),
  ];
  const coins = symbols.flatMap((symbol) => {
    const held = (db["crypto_holdings"] ?? []).filter((c) => c["asset_symbol"] === symbol);
    const amount = held.reduce((s, c) => s + (c["amount"] as number), 0);
    if (amount <= 0) return [];
    const points = (db["crypto_snapshots"] ?? [])
      .filter((s) => s["asset_symbol"] === symbol && (s["value_usd"] as number) > 0)
      .map((s) => ({
        date: s["snapshot_date"] as string,
        eur: (s["price_usd"] as number) * ((s["value_eur"] as number) / (s["value_usd"] as number)),
      }));
    return [toRow("crypto", symbol, held[0]!["name"] as string, amount, points, from, lastMove)];
  });
  return [...stocks, ...coins];
}
