import { describe, expect, it } from "vitest";
import { formatReturn, ofKind } from "./performance";
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
