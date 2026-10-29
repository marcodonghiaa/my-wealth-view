import { describe, expect, it } from "vitest";
import {
  allocationHistory,
  allocationSeries,
  breakAtGaps,
  chartPoints,
  inRange,
  monthAgo,
  monthNetWorth,
  onOrBefore,
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

  // protects=imported totals with no split show up as their own band; fails_when=other_eur is
  // dropped or missing rows break the sum; no_claim=how the band is drawn
  it("counts an unallocated amount as its own share of gross assets", () => {
    const [p] = allocationSeries([{ ...h("2025-01-31", 50, 0, 0, 0), other_eur: 50 }]);
    expect(p).toMatchObject({ stocks: 50, other: 50 });
  });

  it("treats a row without other_eur as nothing unallocated", () => {
    const [p] = allocationSeries([h("2025-01-31", 50, 0, 0, 50)]);
    expect(p?.other).toBe(0);
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

describe("period targets", () => {
  it("monthAgo clamps to the end of a shorter month", () => {
    expect(monthAgo("2026-03-31")).toBe("2026-02-28");
    expect(monthAgo("2026-10-18")).toBe("2026-09-18");
    expect(monthAgo("2026-01-15")).toBe("2025-12-15");
  });

  it("monthAgo goes back several months", () => {
    expect(monthAgo("2026-10-18", 6)).toBe("2026-04-18");
    expect(monthAgo("2026-08-31", 6)).toBe("2026-02-28");
    expect(monthAgo("2026-10-18", 12)).toBe("2025-10-18");
  });

  it("inRange keeps points within the range before the last one", () => {
    const pts = [
      snap("2025-01-01", 1),
      snap("2026-05-01", 2),
      snap("2026-09-20", 3),
      snap("2026-10-18", 4),
    ];
    expect(inRange(pts, "1M").map((p) => p.total_eur)).toEqual([3, 4]);
    expect(inRange(pts, "3M").map((p) => p.total_eur)).toEqual([3, 4]);
    expect(inRange(pts, "YTD").map((p) => p.total_eur)).toEqual([2, 3, 4]);
    expect(inRange(pts, "2Y").map((p) => p.total_eur)).toEqual([1, 2, 3, 4]);
    expect(inRange([snap("2023-01-01", 0), ...pts], "2Y").map((p) => p.total_eur)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(inRange([], "2Y")).toEqual([]);
  });
});

describe("withHistory with rebuilt months", () => {
  const live = (d: string) => ({
    snapshot_date: d,
    total_eur: 1000,
    bank_total_eur: 100,
    portfolio_total_eur: 800,
    crypto_total_eur: 100,
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
  const rec = (d: string) => ({ snapshot_date: d, stocks_eur: 70, bonds_eur: 10, cash_eur: 20 });

  // protects=the main net worth chart has no hole between history and live data; fails_when=
  // rebuilt months are not merged, overwrite an imported month, or reach into the live period
  it("puts rebuilt months between the imported history and the live snapshots", () => {
    const rows = withHistory([hist("2025-11-30")], [live("2026-09-04")], "2026-09-04", [
      rec("2025-11-30"),
      rec("2025-12-31"),
      rec("2026-09-30"),
    ]);
    expect(rows.map((r) => r.snapshot_date)).toEqual(["2025-11-30", "2025-12-31", "2026-09-04"]);
    expect(rows[0]?.total_eur).toBe(190);
    expect(rows[1]).toMatchObject({
      total_eur: 100,
      bank_total_eur: 20,
      portfolio_total_eur: 80,
      crypto_total_eur: 0,
    });
  });

  // protects=rebuilt months carry crypto into the total and the crypto line; fails_when=crypto_eur is ignored
  it("counts a rebuilt month's crypto in its total", () => {
    const [row] = withHistory([], [live("2026-09-04")], "2026-09-04", [
      { ...rec("2026-08-31"), crypto_eur: 5 },
    ]);
    expect(row).toMatchObject({ total_eur: 105, crypto_total_eur: 5 });
  });

  it("uses rebuilt months even when nothing was imported", () => {
    const rows = withHistory([], [live("2026-09-04")], "2026-09-04", [rec("2026-08-31")]);
    expect(rows.map((r) => r.snapshot_date)).toEqual(["2026-08-31", "2026-09-04"]);
  });
});

describe("withHistory with a partial first live day", () => {
  const row = (d: string, bank: number, portfolio: number, crypto: number) => ({
    snapshot_date: d,
    total_eur: bank + portfolio + crypto,
    bank_total_eur: bank,
    portfolio_total_eur: portfolio,
    crypto_total_eur: crypto,
  });
  const rec = {
    snapshot_date: "2026-08-31",
    stocks_eur: 50_000,
    bonds_eur: 10_000,
    cash_eur: 15_000,
    crypto_eur: 5_000,
  };
  const totals = (rows: Array<{ total_eur: number }>) => rows.map((r) => r.total_eur);

  // protects=no crash to ~2k when live data starts with bank balances only; fails_when=a live day
  // missing a component the rebuilt history had is plotted
  it("keeps the rebuilt point until every component has live data", () => {
    const live = [
      row("2026-09-02", 2_400, 0, 0),
      row("2026-09-03", 2_400, 0, 0),
      row("2026-09-04", 15_000, 60_000, 5_000),
      row("2026-09-05", 15_100, 60_500, 5_000),
    ];
    const out = withHistory([], live, undefined, [rec]);
    expect(out.map((r) => r.snapshot_date)).toEqual(["2026-08-31", "2026-09-04", "2026-09-05"]);
    expect(Math.min(...totals(out))).toBe(80_000);
  });

  it("is unchanged without rebuilt history", () => {
    const live = [row("2026-09-02", 2_400, 0, 0), row("2026-09-04", 15_000, 60_000, 5_000)];
    expect(withHistory([], live)).toEqual(live);
  });

  it("does not touch component gaps after the live data is complete", () => {
    const live = [
      row("2026-09-04", 15_000, 60_000, 5_000),
      row("2026-09-05", 15_000, 0, 5_000),
      row("2026-09-06", 15_000, 60_000, 5_000),
    ];
    const out = withHistory([], live, undefined, [rec]);
    expect(out.slice(1)).toEqual(live);
  });

  it("trusts live data after a week even if a component stays at 0", () => {
    const live = [row("2026-09-02", 15_000, 60_000, 0), row("2026-09-10", 15_000, 60_000, 0)];
    const out = withHistory([], live, undefined, [rec]);
    expect(out.map((r) => r.snapshot_date)).toEqual(["2026-08-31", "2026-09-10"]);
  });
});

describe("onOrBefore", () => {
  const r = (d: string, t: number) => ({ snapshot_date: d, total_eur: t });
  it("returns the latest row on or before the date", () => {
    const rows = [r("2026-01-31", 1), r("2026-02-28", 2), r("2026-03-31", 3)];
    expect(onOrBefore(rows, "2026-02-28")?.total_eur).toBe(2);
    expect(onOrBefore(rows, "2026-03-15")?.total_eur).toBe(2);
  });
  it("is undefined when nothing is that old", () => {
    expect(onOrBefore([r("2026-01-31", 1)], "2026-01-30")).toBeUndefined();
  });
});

describe("allocationHistory", () => {
  const hist = (d: string) => ({
    snapshot_date: d,
    stocks_eur: 60,
    bonds_eur: 20,
    crypto_eur: 10,
    cash_eur: 10,
    liabilities_eur: 0,
    total_eur: 100,
  });
  const live = (d: string) => ({
    snapshot_date: d,
    total_eur: 1000,
    bank_total_eur: 100,
    portfolio_total_eur: 800,
    crypto_total_eur: 100,
  });

  // protects=the allocation chart reaches today; fails_when=live snapshots are not appended
  it("keeps the imported months and appends live snapshots as stocks, crypto and cash", () => {
    const rows = allocationHistory([hist("2025-11-30")], [live("2026-09-04"), live("2026-09-05")]);
    expect(rows.map((r) => r.snapshot_date)).toEqual(["2025-11-30", "2026-09-04", "2026-09-05"]);
    expect(rows[1]).toMatchObject({
      stocks_eur: 800,
      bonds_eur: 0,
      crypto_eur: 100,
      cash_eur: 100,
    });
  });

  // protects=bond funds count as bonds, matching the portfolio page; fails_when=live portfolio is all stocks
  it("splits the bond holdings out of a live portfolio", () => {
    const rows = allocationHistory([], [{ ...live("2026-09-04"), portfolio_bonds_eur: 300 }]);
    expect(rows[0]).toMatchObject({ stocks_eur: 500, bonds_eur: 300 });
  });

  // protects=partial early snapshots do not distort the mix; fails_when=the start date is ignored
  it("leaves out live snapshots before the configured start", () => {
    const rows = allocationHistory([], [live("2026-09-02"), live("2026-09-04")], "2026-09-04");
    expect(rows.map((r) => r.snapshot_date)).toEqual(["2026-09-04"]);
  });

  it("drops imported months that overlap the live snapshots", () => {
    const rows = allocationHistory([hist("2026-09-30")], [live("2026-09-04")]);
    expect(rows.map((r) => r.snapshot_date)).toEqual(["2026-09-04"]);
  });

  const rec = (d: string) => ({ snapshot_date: d, stocks_eur: 70, bonds_eur: 10, cash_eur: 20 });

  // protects=the months between history and live data are filled from statements; fails_when=
  // rebuilt rows are ignored, or override a month the user already imported
  it("fills the months between the imported history and the live snapshots", () => {
    const rows = allocationHistory([hist("2025-11-30")], [live("2026-09-04")], undefined, [
      rec("2025-11-30"),
      rec("2025-12-31"),
      rec("2026-08-31"),
      rec("2026-09-30"),
    ]);
    expect(rows.map((r) => r.snapshot_date)).toEqual([
      "2025-11-30",
      "2025-12-31",
      "2026-08-31",
      "2026-09-04",
    ]);
    expect(rows[0]).toEqual(hist("2025-11-30"));
    expect(rows[1]).toMatchObject({ stocks_eur: 70, bonds_eur: 10, cash_eur: 20, crypto_eur: 0 });
  });

  it("uses rebuilt months when there are no snapshots at all", () => {
    const rows = allocationHistory([], [], undefined, [rec("2026-08-31")]);
    expect(rows.map((r) => r.snapshot_date)).toEqual(["2026-08-31"]);
  });

  it("is the imported history alone when there are no snapshots", () => {
    expect(allocationHistory([hist("2025-11-30")], [])).toEqual([hist("2025-11-30")]);
  });
});

describe("breakAtGaps", () => {
  const pt = (d: string) => ({
    snapshot_date: d,
    ts: Date.parse(`${d}T00:00:00`),
    stocks: 50,
    bonds: 0,
    crypto: 0,
    cash: 50,
    other: 0,
  });

  // protects=no mix is drawn where there is no data; fails_when=the gap is joined by a smear
  it("puts an empty point inside a hole so the areas stop and restart", () => {
    const out = breakAtGaps([pt("2025-11-30"), pt("2026-09-04")]);
    expect(out).toHaveLength(3);
    expect(out[1]).toMatchObject({
      stocks: null,
      bonds: null,
      crypto: null,
      cash: null,
      other: null,
    });
    expect(out[1]?.ts).toBeGreaterThan(out[0]?.ts ?? 0);
    expect(out[1]?.ts).toBeLessThan(out[2]?.ts ?? 0);
  });

  it("leaves normal monthly steps alone", () => {
    const rows = [pt("2025-10-31"), pt("2025-11-30"), pt("2025-12-31")];
    expect(breakAtGaps(rows)).toEqual(rows);
  });
});

describe("monthNetWorth", () => {
  const row = (d: string, total: number) => ({
    snapshot_date: d,
    total_eur: total,
    bank_total_eur: total / 2,
    portfolio_total_eur: total / 2,
    crypto_total_eur: 0,
  });

  it("measures from the day before the month to its end", () => {
    const m = monthNetWorth(
      [row("2026-02-28", 100), row("2026-03-31", 130)],
      "2026-02-28",
      "2026-03-31",
    );
    expect(m?.delta?.total).toBe(30);
  });

  it("has no change when nothing precedes the month", () => {
    const m = monthNetWorth([row("2026-03-10", 130)], "2026-02-28", "2026-03-31");
    expect(m?.end.total_eur).toBe(130);
    expect(m?.delta).toBeNull();
  });

  it("is null for a month with no data in it, not a zero change from older data", () => {
    const rows = [row("2026-01-15", 90), row("2026-02-10", 100)];
    expect(monthNetWorth(rows, "2026-02-28", "2026-03-31")).toBeNull();
  });

  it("is null with no rows", () => {
    expect(monthNetWorth([], "2026-02-28", "2026-03-31")).toBeNull();
  });
});
