import { describe, expect, it } from "vitest";
import { byKey, rangeQuery, rowReturn, summarize } from "./performance";
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

describe("rowReturn", () => {
  it("is the price change as a fraction", () => {
    expect(rowReturn(row())).toBeCloseTo(0.2);
    expect(rowReturn(row({ end_price_eur: 90 }))).toBeCloseTo(-0.1);
  });

  it("has no number when the data cannot support one", () => {
    expect(rowReturn(row({ status: "stale" }))).toBeNull();
    expect(rowReturn(row({ status: "no_price" }))).toBeNull();
    expect(rowReturn(row({ start_price_eur: null }))).toBeNull();
    expect(rowReturn(row({ start_price_eur: 0 }))).toBeNull();
    expect(rowReturn(row({ end_price_eur: null }))).toBeNull();
    expect(rowReturn(row({ start_date: "2026-10-30" }))).toBeNull(); // zero length: added today
    expect(rowReturn(row({ quantity: 0 }))).toBeNull();
  });
});

describe("summarize", () => {
  it("buying more shares is not performance: the weight is the quantity held now", () => {
    // 20 shares now, price 100 to 120: +20%, not the +140% a plain value difference shows
    expect(summarize([row({ quantity: 20 })]).change).toBeCloseTo(0.2);
  });

  it("weights each holding by its starting value", () => {
    // 10 x 100 up 20%, 1 x 100 down 10%: (200 - 10) / 1100
    const s = summarize([row({ key: "A" }), row({ key: "B", quantity: 1, end_price_eur: 90 })]);
    expect(s.change).toBeCloseTo(190 / 1100);
    expect(s.counted).toBe(2);
  });

  it("leaves unusable rows out of both sums and counts them", () => {
    const s = summarize([
      row(),
      row({ key: "B", status: "stale" }),
      row({ key: "C", status: "no_price", start_price_eur: null, end_price_eur: null }),
    ]);
    expect(s.change).toBeCloseTo(0.2);
    expect(s.counted).toBe(1);
    expect(s.excluded).toBe(2);
  });

  it("is null, never NaN, with nothing to measure", () => {
    expect(summarize([]).change).toBeNull();
    expect(summarize([row({ status: "no_price", start_price_eur: null })]).change).toBeNull();
  });

  it("counts holdings younger than the range and names the start when they all share it", () => {
    const young = (key: string) => row({ key, status: "since", start_date: "2026-10-28" });
    expect(summarize([young("A"), young("B")])).toMatchObject({ partial: 2, since: "2026-10-28" });
    expect(summarize([young("A"), row({ key: "B" })])).toMatchObject({ partial: 1, since: null });
    const mixed = [
      young("A"),
      young("B"),
      row({ key: "C", status: "since", start_date: "2026-10-20" }),
    ];
    expect(summarize(mixed).since).toBeNull();
  });

  it("ranks best and worst without overlap", () => {
    const rows = [
      row({ key: "A", end_price_eur: 130 }),
      row({ key: "B", end_price_eur: 110 }),
      row({ key: "C", end_price_eur: 95 }),
      row({ key: "D", end_price_eur: 80 }),
      row({ key: "E", end_price_eur: 100 }),
    ];
    const s = summarize(rows);
    expect(s.best.map((r) => r.key)).toEqual(["A", "B"]);
    expect(s.worst.map((r) => r.key)).toEqual(["D", "C"]);
  });

  it("with 0, 1, 2 or 3 holdings the lists stay honest", () => {
    expect(summarize([]).best).toEqual([]);
    expect(summarize([row()]).best).toEqual([]);
    const two = summarize([row({ key: "A" }), row({ key: "B", end_price_eur: 90 })]);
    expect([two.best.map((r) => r.key), two.worst.map((r) => r.key)]).toEqual([["A"], ["B"]]);
    const three = summarize([
      row({ key: "A" }),
      row({ key: "B", end_price_eur: 110 }),
      row({ key: "C", end_price_eur: 90 }),
    ]);
    expect([three.best.length, three.worst.length]).toEqual([1, 1]);
  });
});

describe("rangeQuery", () => {
  const last = "2026-10-30";
  it("starts every range from the latest data day", () => {
    expect(rangeQuery("1M", last)).toEqual({ from: "2026-09-30", lastMove: false });
    expect(rangeQuery("3M", last)).toEqual({ from: "2026-07-30", lastMove: false });
    expect(rangeQuery("YTD", last)).toEqual({ from: "2025-12-31", lastMove: false });
    expect(rangeQuery("2Y", last)).toEqual({ from: "2024-10-30", lastMove: false });
  });
  it("clamps to the end of a shorter month", () => {
    expect(rangeQuery("1M", "2026-03-31").from).toBe("2026-02-28");
  });
  it("1D compares with the previous different price, ALL starts at each first price", () => {
    expect(rangeQuery("1D", last)).toEqual({ from: last, lastMove: true });
    expect(rangeQuery("ALL", last)).toEqual({ from: "1970-01-01", lastMove: false });
  });
});

describe("byKey", () => {
  it("keeps a stock and a coin with the same key apart", () => {
    const m = byKey([row({ kind: "stock", key: "X" }), row({ kind: "crypto", key: "X" })]);
    expect(m.size).toBe(2);
  });
});
