import { describe, expect, it } from "vitest";
import {
  allocationSeries,
  changeOver,
  chartPoints,
  monthAgo,
  yearStart,
  periodBaseline,
  withHistory,
} from "./net-worth";

const snap = (snapshot_date: string, total_eur: number) => ({ snapshot_date, total_eur });

describe("periodBaseline", () => {
  const rows = [snap("2026-09-02", 2495), snap("2026-09-03", 2388), snap("2026-09-04", 74406)];

  it("is the first snapshot when no start date is configured", () => {
    expect(periodBaseline(rows)?.snapshot_date).toBe("2026-09-02");
    expect(periodBaseline(rows, "")?.snapshot_date).toBe("2026-09-02");
  });

  it("skips snapshots from before the configured start date", () => {
    expect(periodBaseline(rows, "2026-09-04")?.snapshot_date).toBe("2026-09-04");
  });

  it("uses the first snapshot after the start date when that day itself is missing", () => {
    expect(periodBaseline(rows, "2026-09-03T12")?.snapshot_date).toBe("2026-09-04");
  });

  it("is undefined when nothing is on or after the start date", () => {
    expect(periodBaseline(rows, "2027-01-01")).toBeUndefined();
  });
});

describe("withHistory", () => {
  const real = (d: string, t: number) => ({
    snapshot_date: d,
    total_eur: t,
    bank_total_eur: t,
    portfolio_total_eur: 0,
    crypto_total_eur: 0,
  });
  const hist = (d: string) => ({
    snapshot_date: d,
    stocks_eur: 100,
    bonds_eur: 50,
    crypto_eur: 30,
    cash_eur: 20,
    liabilities_eur: 10,
    total_eur: 190,
  });

  it("is a no-op without history", () => {
    const rows = [real("2026-09-04", 74406)];
    expect(withHistory([], rows, "2026-09-04")).toEqual(rows);
  });

  it("maps history into the chart buckets: cash is bank, stocks+bonds are portfolio", () => {
    const [h] = withHistory([hist("2025-11-30")], [real("2026-09-04", 74406)], "2026-09-04");
    expect(h).toMatchObject({
      snapshot_date: "2025-11-30",
      total_eur: 190,
      bank_total_eur: 20,
      portfolio_total_eur: 150,
      crypto_total_eur: 30,
    });
  });

  it("drops partial snapshots before the baseline once history exists", () => {
    const rows = [real("2026-09-02", 2495), real("2026-09-04", 74406)];
    const out = withHistory([hist("2025-11-30")], rows, "2026-09-04");
    expect(out.map((r) => r.snapshot_date)).toEqual(["2025-11-30", "2026-09-04"]);
  });

  it("drops history that overlaps real snapshots", () => {
    const out = withHistory([hist("2026-09-30")], [real("2026-09-04", 74406)], "2026-09-04");
    expect(out.map((r) => r.snapshot_date)).toEqual(["2026-09-04"]);
  });
});

describe("chartPoints", () => {
  const row = (d: string, t: number) => ({
    snapshot_date: d,
    total_eur: t,
    bank_total_eur: t,
    portfolio_total_eur: 0,
    crypto_total_eur: 0,
  });

  it("marks only the two ends of a gap longer than 45 days for the dashed estimate", () => {
    const pts = chartPoints([
      row("2025-11-30", 58000),
      row("2026-09-04", 74000),
      row("2026-09-05", 75000),
    ]);
    expect(pts.map((p) => p.estimated_eur)).toEqual([58000, 74000, null]);
  });

  it("leaves normal spacing alone", () => {
    const pts = chartPoints([row("2025-10-31", 1), row("2025-11-30", 2)]);
    expect(pts.every((p) => p.estimated_eur === null)).toBe(true);
  });

  it("adds a numeric time for the axis", () => {
    expect(chartPoints([row("2025-11-30", 1)])[0]?.ts).toBe(Date.parse("2025-11-30T00:00:00"));
  });
});

describe("allocationSeries", () => {
  const h = (d: string, s: number, b: number, c: number, cash: number, liab = 0) => ({
    snapshot_date: d,
    stocks_eur: s,
    bonds_eur: b,
    crypto_eur: c,
    cash_eur: cash,
    liabilities_eur: liab,
    total_eur: s + b + c + cash - liab,
  });

  it("gives each class its share of gross assets, summing to 100", () => {
    const [p] = allocationSeries([h("2025-01-31", 50, 25, 15, 10, 7)]);
    expect(p).toMatchObject({
      snapshot_date: "2025-01-31",
      stocks: 50,
      bonds: 25,
      crypto: 15,
      cash: 10,
    });
  });

  it("ignores liabilities so shares do not depend on the tax reserve", () => {
    const [a] = allocationSeries([h("2025-01-31", 50, 50, 0, 0, 0)]);
    const [b] = allocationSeries([h("2025-01-31", 50, 50, 0, 0, 40)]);
    expect(a).toEqual(b);
  });

  it("skips months with no assets instead of dividing by zero", () => {
    expect(allocationSeries([h("2024-02-29", 0, 0, 0, 0)])).toEqual([]);
  });

  it("adds a numeric time for the axis", () => {
    expect(allocationSeries([h("2025-01-31", 1, 0, 0, 0)])[0]?.ts).toBe(
      Date.parse("2025-01-31T00:00:00"),
    );
  });
});

describe("changeOver / period targets", () => {
  const r = (d: string, t: number) => ({ snapshot_date: d, total_eur: t });

  it("compares the latest row with the last row on or before the target", () => {
    const rows = [r("2026-09-04", 100), r("2026-09-18", 110), r("2026-10-18", 120)];
    expect(changeOver(rows, "2026-09-18")).toBeCloseTo(120 / 110 - 1);
  });

  it("is null when the nearest earlier row is too old to mean anything", () => {
    expect(changeOver([r("2025-01-01", 100), r("2026-10-18", 120)], "2026-09-18")).toBeNull();
  });

  it("is null when nothing exists on or before the target", () => {
    expect(changeOver([r("2026-10-01", 100), r("2026-10-18", 120)], "2026-09-18")).toBeNull();
  });

  it("is null for a zero base", () => {
    expect(changeOver([r("2026-09-18", 0), r("2026-10-18", 5)], "2026-09-18")).toBeNull();
  });

  it("monthAgo clamps to the end of a shorter month", () => {
    expect(monthAgo("2026-03-31")).toBe("2026-02-28");
    expect(monthAgo("2026-10-18")).toBe("2026-09-18");
    expect(monthAgo("2026-01-15")).toBe("2025-12-15");
  });

  it("yearStart is the last day of the previous year", () => {
    expect(yearStart("2026-10-18")).toBe("2025-12-31");
  });
});
