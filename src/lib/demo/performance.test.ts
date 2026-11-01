import { describe, expect, it } from "vitest";
import { demoHoldingPerformance } from "./performance";

const snap = (isin: string, d: string, price: number) => ({
  isin,
  snapshot_date: d,
  price,
  value_native: price * 10,
  value_eur: price * 10 * 0.5,
});
const db = {
  portfolio_holdings: [
    { isin: "AAA", name: "Hole", shares: 10 },
    { isin: "BBB", name: "Young", shares: 1 },
    { isin: "CCC", name: "Sold", shares: 0 },
    { isin: "DDD", name: "Weekend", shares: 2 },
  ],
  portfolio_snapshots: [
    snap("AAA", "2026-09-17", 50),
    snap("AAA", "2026-10-30", 60),
    snap("BBB", "2026-10-28", 10),
    snap("BBB", "2026-10-30", 11),
    snap("CCC", "2026-10-30", 5),
    snap("DDD", "2026-10-22", 9),
    snap("DDD", "2026-10-23", 10),
    snap("DDD", "2026-10-24", 10),
    snap("DDD", "2026-10-25", 10),
  ],
  crypto_holdings: [
    { asset_symbol: "BTC", name: "Bitcoin", amount: 1 },
    { asset_symbol: "BTC", name: "Bitcoin", amount: 0.5 },
  ],
  crypto_snapshots: [
    {
      asset_symbol: "BTC",
      snapshot_date: "2026-10-29",
      price_usd: 90,
      value_usd: 90,
      value_eur: 81,
    },
    {
      asset_symbol: "BTC",
      snapshot_date: "2026-10-30",
      price_usd: 100,
      value_usd: 100,
      value_eur: 90,
    },
  ],
};
const get = (rows: ReturnType<typeof demoHoldingPerformance>, key: string) =>
  rows.find((r) => r.key === key)!;

describe("demoHoldingPerformance", () => {
  const rows = demoHoldingPerformance(db);

  it("returns held stocks and one row per coin, not sold holdings", () => {
    expect(rows.map((r) => r.key).sort()).toEqual(["AAA", "BBB", "BTC", "DDD"]);
    expect(get(rows, "BTC").quantity).toBe(1.5);
  });

  it("uses the latest price, at that snapshot's own rate", () => {
    expect(get(rows, "BBB")).toMatchObject({ end_date: "2026-10-30", end_price_eur: 5.5 });
    expect(get(rows, "BTC").end_price_eur).toBeCloseTo(90);
  });

  it("a holding with no prices is no_price", () => {
    const r = demoHoldingPerformance({ ...db, portfolio_snapshots: [] });
    expect(get(r, "AAA")).toMatchObject({ status: "no_price", end_price_eur: null });
  });
});
