import type { PerformanceRow } from "@/lib/performance";

// The demo's stand-in for the database function holding_performance. Returns come from trades
// (lib/trades), which read only each holding's quantity and latest price, so that is all it answers.
// EUR uses each snapshot's own rate.
type Row = Record<string, unknown>;
type Point = { date: string; eur: number };

function toRow(
  kind: string,
  key: string,
  name: string | null,
  quantity: number,
  points: Array<Point>,
): PerformanceRow {
  const end = points.reduce<Point | undefined>((a, p) => (a && a.date > p.date ? a : p), undefined);
  return {
    kind,
    key,
    name,
    quantity,
    start_date: null,
    start_price_eur: null,
    end_date: end?.date ?? null,
    end_price_eur: end?.eur ?? null,
    status: end ? "ok" : "no_price",
  };
}

export function demoHoldingPerformance(db: Record<string, Array<Row>>): Array<PerformanceRow> {
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
    return [toRow("crypto", symbol, held[0]!["name"] as string, amount, points)];
  });
  return [...stocks, ...coins];
}
