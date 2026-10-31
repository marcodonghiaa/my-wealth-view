import { describe, expect, it } from "vitest";
import { measure, netShares, parseAmount, summarizeTrades } from "./trades";
import type { Measured, Trade } from "./trades";
import type { PerformanceRow } from "./performance";

const row = (over: Partial<PerformanceRow> = {}): PerformanceRow => ({
  kind: "stock",
  key: "K",
  name: "Holding",
  quantity: 10,
  start_date: "2026-09-30",
  start_price_eur: 100,
  end_date: "2026-10-30",
  end_price_eur: 120,
  status: "ok",
  ...over,
});

const buy = (trade_date: string, shares: number, price_eur: number, fee_eur = 0): Trade => ({
  kind: "stock",
  key: "K",
  side: "buy",
  trade_date,
  shares,
  price_eur,
  fee_eur,
});
const sell = (trade_date: string, shares: number, price_eur: number, fee_eur = 0): Trade => ({
  ...buy(trade_date, shares, price_eur, fee_eur),
  side: "sell",
});

const ok = (m: Measured) => {
  if (m.state !== "ok") throw new Error(`expected ok, got ${m.state}`);
  return m;
};

describe("measure", () => {
  it("total return is value minus what you paid, fees included (a broker statement by hand)", () => {
    // 10 bought at 80 with a 1 fee: paid 801. Worth 1200 now: +399, +49.81%.
    const m = ok(measure(row(), [buy("2025-01-10", 10, 80, 1)], true));
    expect(m.gain).toBeCloseTo(399);
    expect(m.change).toBeCloseTo(399 / 801);
  });

  it("ALL includes profit already taken on a sale", () => {
    // Bought 12 at 80 (960), sold 2 at 150 (300), 10 left at 120 (1200): +540.
    const m = ok(measure(row(), [buy("2025-01-10", 12, 80), sell("2025-06-01", 2, 150)], true));
    expect(m.gain).toBeCloseTo(540);
    expect(m.change).toBeCloseTo(540 / 960);
  });

  it("a buy before the range counts at the range's start price, not what you paid", () => {
    const m = ok(measure(row(), [buy("2025-01-10", 10, 1)], false));
    expect(m.gain).toBeCloseTo(200);
    expect(m.change).toBeCloseTo(0.2);
  });

  it("a buy inside the range counts at what you paid, so it isn't profit by itself", () => {
    // 5 held at 100 (500), 5 more bought at 120 (600), 10 at 120 now (1200): +100 on 1100.
    const m = ok(measure(row(), [buy("2025-01-10", 5, 1), buy("2026-10-15", 5, 120)], false));
    expect(m.gain).toBeCloseTo(100);
    expect(m.change).toBeCloseTo(100 / 1100);
  });

  it("a sale inside the range counts what it brought in, less the fee", () => {
    // 12 held at 100 (1200), sold 2 at 110 fee 1 (219), 10 at 120 now (1200): +219.
    const m = ok(measure(row(), [buy("2025-01-10", 12, 1), sell("2026-10-15", 2, 110, 1)], false));
    expect(m.gain).toBeCloseTo(219);
    expect(m.change).toBeCloseTo(219 / 1200);
  });

  it("a trade on the start day is already in the start value", () => {
    const m = ok(measure(row(), [buy("2026-09-30", 10, 90)], false));
    expect(m.base).toBeCloseTo(1000);
  });

  it("no trades means no number", () => {
    expect(measure(row(), [], true)).toEqual({ state: "no_trades" });
  });

  it("trades that don't add up to what you hold mean no number", () => {
    expect(measure(row(), [buy("2025-01-10", 8, 80)], true)).toEqual({
      state: "mismatch",
      traded: 8,
      held: 10,
    });
  });

  it("rounding dust is not a mismatch", () => {
    expect(measure(row(), [buy("2025-01-10", 10.0000001, 80)], true).state).toBe("ok");
  });

  it("no current price means no number while you hold it", () => {
    expect(measure(row({ end_price_eur: null }), [buy("2025-01-10", 10, 80)], true).state).toBe(
      "no_price",
    );
  });

  it.each(["stale", "no_price"])("a %s range start means no number", (status) => {
    expect(measure(row({ status }), [buy("2025-01-10", 10, 80)], false).state).toBe("no_price");
  });

  it("the same stale start doesn't stop ALL, which needs no start price", () => {
    expect(measure(row({ status: "stale" }), [buy("2025-01-10", 10, 80)], true).state).toBe("ok");
  });

  it("a range of one price has no number", () => {
    expect(
      measure(row({ start_date: "2026-10-30" }), [buy("2025-01-10", 10, 80)], false).state,
    ).toBe("no_price");
  });

  it("a holding sold to zero keeps its profit, and needs no current price", () => {
    const m = ok(
      measure(
        row({ quantity: 0, end_price_eur: null }),
        [buy("2025-01-10", 2, 50), sell("2025-06-01", 2, 75)],
        true,
      ),
    );
    expect(m.gain).toBeCloseTo(50);
  });

  it("sold before the range: nothing to say in it", () => {
    expect(
      measure(row({ quantity: 0 }), [buy("2025-01-10", 2, 50), sell("2025-06-01", 2, 75)], false)
        .state,
    ).toBe("not_held");
  });

  it("says since when the trades are older than the first price", () => {
    const m = ok(
      measure(
        row({ status: "since", start_date: "2025-11-01" }),
        [buy("2024-01-10", 10, 50)],
        false,
      ),
    );
    expect(m.since).toBe("2025-11-01");
  });

  it("no since when every trade is after the first price: the number is exact", () => {
    const m = ok(
      measure(
        row({ status: "since", start_date: "2025-11-01" }),
        [buy("2026-01-10", 10, 50)],
        false,
      ),
    );
    expect(m.since).toBeNull();
  });

  it("a buy on the very first price we have counts at cost, with no since", () => {
    const m = ok(
      measure(
        row({ status: "since", start_date: "2025-11-01" }),
        [buy("2025-11-01", 10, 100)],
        false,
      ),
    );
    expect(m.since).toBeNull();
    expect(m.gain).toBeCloseTo(200);
  });

  it("something free has a gain but no percentage", () => {
    const m = ok(measure(row(), [buy("2026-10-10", 10, 0)], true));
    expect(m.gain).toBeCloseTo(1200);
    expect(m.change).toBeNull();
  });
});

describe("netShares", () => {
  it("buys minus sells", () => {
    expect(netShares([buy("2025-01-10", 5, 1), sell("2025-02-10", 2, 1)])).toBe(3);
  });
});

describe("summarizeTrades", () => {
  const okRow = (key: string, gain: number, base: number, quantity = 1) => ({
    row: row({ key, quantity }),
    measured: { state: "ok", gain, base, change: gain / base, since: null } as Measured,
  });

  it("weights by money, not per holding", () => {
    const s = summarizeTrades([okRow("A", 100, 1000), okRow("B", -1, 10)]);
    expect(s.gain).toBe(99);
    expect(s.change).toBeCloseTo(99 / 1010);
  });

  it("holdings missing trades or a price count against the total, never the number", () => {
    const s = summarizeTrades([
      okRow("A", 10, 100),
      { row: row({ key: "B" }), measured: { state: "no_trades" } },
      { row: row({ key: "C" }), measured: { state: "mismatch", traded: 1, held: 2 } },
      { row: row({ key: "D" }), measured: { state: "no_price" } },
    ]);
    expect(s.counted).toBe(1);
    expect(s.total).toBe(4);
    expect(s.change).toBeCloseTo(0.1);
  });

  it("not_held and sold rows without trades aren't missing anything", () => {
    const s = summarizeTrades([
      okRow("A", 10, 100),
      { row: row({ key: "B", quantity: 0 }), measured: { state: "not_held" } },
      { row: row({ key: "C", quantity: 0 }), measured: { state: "no_trades" } },
    ]);
    expect(s.total).toBe(1);
  });

  it("nothing measurable: no change", () => {
    expect(summarizeTrades([]).change).toBeNull();
  });

  it("best and worst don't overlap and skip sold holdings", () => {
    const s = summarizeTrades([
      okRow("A", 30, 100),
      okRow("B", 10, 100),
      okRow("C", -5, 100),
      okRow("SOLD", 90, 100, 0),
    ]);
    expect(s.best.map((r) => r.key)).toEqual(["A"]);
    expect(s.worst.map((r) => r.key)).toEqual(["C"]);
    expect(s.gain).toBe(125); // the sold one still counts in the total
  });

  it("a holding that's up is never worst; flat within the noise band still is", () => {
    const up = summarizeTrades([okRow("A", 30, 100), okRow("B", 10, 100)]);
    expect(up.best.map((r) => r.key)).toEqual(["A"]);
    expect(up.worst).toEqual([]);
    const flat = summarizeTrades([okRow("A", 30, 100), okRow("B", 0.2, 100)]);
    expect(flat.worst.map((r) => r.key)).toEqual(["B"]);
  });

  it("names the shared later start date when every holding starts there", () => {
    const withSince = (key: string) => ({
      row: row({ key }),
      measured: { state: "ok", gain: 1, base: 10, change: 0.1, since: "2025-11-01" } as Measured,
    });
    const s = summarizeTrades([withSince("A"), withSince("B")]);
    expect(s.since).toBe("2025-11-01");
    expect(s.partial).toBe(2);
  });
});

describe("parseAmount", () => {
  it.each([
    ["12.5", 12.5],
    ["12,5", 12.5],
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["0", 0],
  ])("reads %s", (text, want) => {
    expect(parseAmount(text)).toBe(want);
  });
  it.each(["", "abc", "-1", "1e5"])("refuses %s", (text) => {
    expect(parseAmount(text)).toBeNull();
  });
});
