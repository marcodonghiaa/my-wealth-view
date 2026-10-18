import { describe, expect, it } from "vitest";
import { chartPoints, periodBaseline, withHistory } from "./net-worth";

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
