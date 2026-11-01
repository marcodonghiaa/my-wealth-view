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
  it("is value minus what you paid, fees included (a broker statement by hand)", () => {
    // 10 bought at 80 with a 1 fee: paid 801. Worth 1200 now: +399, +49.81%.
    const m = ok(measure(row(), [buy("2025-01-10", 10, 80, 1)]));
    expect(m.gain).toBeCloseTo(399);
    expect(m.change).toBeCloseTo(399 / 801);
  });

  it("counts profit already taken, against the most ever invested", () => {
    // Bought 12 at 80 (960 in), sold 2 at 150 (300), 10 left at 120 (1200): +540 on 960.
    const m = ok(measure(row(), [buy("2025-01-10", 12, 80), sell("2025-06-01", 2, 150)]));
    expect(m.gain).toBeCloseTo(540);
    expect(m.base).toBeCloseTo(960);
    expect(m.change).toBeCloseTo(540 / 960);
  });

  it("money moved out of a fund and back doesn't inflate the base", () => {
    const m = ok(
      measure(row(), [
        buy("2025-01-10", 10, 100),
        sell("2025-06-01", 10, 100),
        buy("2025-07-01", 10, 100),
      ]),
    );
    expect(m.base).toBeCloseTo(1000);
    expect(m.change).toBeCloseTo(0.2);
  });

  it("mostly sold: a sane percentage, not a huge one on the pennies left", () => {
    // 1000 in, 900 back, 1 share left worth 120 (row price): +20 on 1000, not on the 100 left.
    const m = ok(
      measure(row({ quantity: 1 }), [buy("2025-01-10", 10, 100), sell("2025-06-01", 9, 100)]),
    );
    expect(m.gain).toBeCloseTo(20);
    expect(m.change).toBeCloseTo(0.02);
  });

  it("the peak is the most in at once, not the total of all buys", () => {
    const m = ok(
      measure(row({ quantity: 10 }), [
        buy("2025-01-10", 5, 100),
        buy("2025-02-10", 5, 200),
        sell("2025-03-10", 5, 150),
        buy("2025-04-10", 5, 100),
      ]),
    );
    expect(m.base).toBeCloseTo(1500);
  });

  it("a split adds shares at no cost", () => {
    const m = ok(measure(row(), [buy("2025-01-10", 5, 100), buy("2025-06-01", 5, 0)]));
    expect(m.base).toBeCloseTo(500);
    expect(m.gain).toBeCloseTo(700);
  });

  it("a leftover under EUR 10 asks for nothing: no purchases, no mismatch", () => {
    const small = row({ quantity: 0.5, end_price_eur: 1.6 });
    expect(measure(small, [])).toEqual({ state: "dust" });
    expect(measure(small, [buy("2025-01-10", 8, 1)])).toEqual({ state: "dust" });
  });

  it("just over EUR 10 is a real holding", () => {
    expect(measure(row({ quantity: 1, end_price_eur: 10 }), []).state).toBe("no_trades");
  });

  it("a sale on the day of the buy has its money in first, whatever order they came in", () => {
    const m = ok(
      measure(row({ quantity: 5 }), [sell("2025-01-10", 5, 100), buy("2025-01-10", 10, 100)]),
    );
    expect(m.base).toBeCloseTo(1000);
  });

  it("no trades means no number", () => {
    expect(measure(row(), [])).toEqual({ state: "no_trades" });
  });

  it("trades that don't add up to what you hold mean no number", () => {
    expect(measure(row(), [buy("2025-01-10", 8, 80)])).toEqual({
      state: "mismatch",
      traded: 8,
      held: 10,
    });
  });

  it("rounding dust is not a mismatch", () => {
    expect(measure(row(), [buy("2025-01-10", 10.0000001, 80)]).state).toBe("ok");
  });

  it("no current price means no number while you hold it", () => {
    expect(measure(row({ end_price_eur: null }), [buy("2025-01-10", 10, 80)]).state).toBe(
      "no_price",
    );
  });

  it("a holding sold to zero keeps its profit and needs no price", () => {
    const m = ok(
      measure(row({ quantity: 0, end_price_eur: null }), [
        buy("2025-01-10", 2, 50),
        sell("2025-06-01", 2, 75),
      ]),
    );
    expect(m.gain).toBeCloseTo(50);
    expect(m.change).toBeCloseTo(0.5);
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
    measured: { state: "ok", gain, base, change: gain / base } as Measured,
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

  it("a sold row without trades isn't missing anything", () => {
    const s = summarizeTrades([
      okRow("A", 10, 100),
      { row: row({ key: "C", quantity: 0 }), measured: { state: "no_trades" } },
    ]);
    expect(s.total).toBe(1);
  });

  it("a sold holding's gain counts, on top of the cost of what you still hold", () => {
    const s = summarizeTrades([
      okRow("A", 100, 1000),
      {
        row: row({ key: "S", quantity: 0 }),
        measured: { state: "ok", gain: -50, base: 0, change: null },
      },
    ]);
    expect(s.gain).toBe(50);
    expect(s.change).toBeCloseTo(0.05);
  });

  it("leftovers are neither missing nor best or worst, but their gain counts", () => {
    const dust = { row: row({ key: "D" }), measured: { state: "dust" } as Measured };
    const tiny = {
      row: row({ key: "T", quantity: 1, end_price_eur: 1 }),
      measured: { state: "ok", gain: 900, base: 100, change: 9 } as Measured,
    };
    const s = summarizeTrades([okRow("A", 10, 100), okRow("B", -10, 100), dust, tiny]);
    expect(s.total).toBe(3);
    expect(s.best.map((r) => r.key)).toEqual(["A"]);
    expect(s.gain).toBe(900);
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
