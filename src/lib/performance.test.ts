import { describe, expect, it } from "vitest";
import { formatReturn, ofKind, rangeQuery } from "./performance";
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

describe("formatReturn", () => {
  it("shows two decimals, a sign and a real minus", () => {
    expect(formatReturn(0.04213)).toBe("+4.21%");
    expect(formatReturn(-0.013)).toBe("−1.30%");
    expect(formatReturn(0)).toBe("+0.00%");
    expect(formatReturn(-0.0000001)).toBe("+0.00%");
    expect(formatReturn(12.3456)).toBe("+1,234.56%");
  });
});

describe("ofKind", () => {
  it("keeps a page's own kind", () => {
    const rows = [row({ kind: "stock", key: "A" }), row({ kind: "crypto", key: "B" })];
    expect(ofKind(rows, "crypto").map((r) => r.key)).toEqual(["B"]);
  });
});
