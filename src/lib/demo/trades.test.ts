import { describe, expect, it } from "vitest";
import { generateDemoData } from "./generate";

describe("demo trades", () => {
  it("add up to each holding that has them, and one coin is left to show Add purchases", () => {
    const db = generateDemoData(new Date(2026, 9, 19, 12)) as unknown as Record<
      string,
      Array<Record<string, unknown>>
    >;
    const shares = new Map(db["holding_trades"]!.map((t) => [t["key"], t["shares"]]));
    for (const h of db["portfolio_holdings"]!) expect(shares.get(h["isin"])).toBe(h["shares"]);
    const coins = db["crypto_holdings"]!.filter((c) => !shares.has(c["asset_symbol"]));
    expect(coins).toHaveLength(1);
  });
});
