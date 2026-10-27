import { formatISODate } from "./date";
import { isDemoMode } from "./demo/mode";

// (The public demo ignores it: its fake history is complete.)
// Optional YYYY-MM-DD from which "change since the start" is measured. Set it when your first
// snapshots only held part of your net worth (e.g. before investments were added), which would
// otherwise read as a huge percentage. Unset: measure from the very first snapshot.
const netWorthStart = (): string | undefined =>
  isDemoMode() ? undefined : import.meta.env["VITE_NET_WORTH_START"];

export function periodBaseline<T extends { snapshot_date: string }>(
  snapshots: Array<T>,
  start: string | undefined = netWorthStart(),
): T | undefined {
  return start ? snapshots.find((s) => s.snapshot_date >= start) : snapshots.at(0);
}

export type NetWorthRow = {
  snapshot_date: string;
  total_eur: number;
  bank_total_eur: number;
  portfolio_total_eur: number;
  crypto_total_eur: number;
  // The bond-type holdings inside portfolio_total_eur. Only live snapshots carry it.
  portfolio_bonds_eur?: number;
};

// Month-end rows imported from before live snapshots existed (table net_worth_history).
export type HistoryRow = {
  snapshot_date: string;
  stocks_eur: number;
  bonds_eur: number;
  crypto_eur: number;
  cash_eur: number;
  liabilities_eur: number;
  // A total with no per-class split (CSV import). Absent on rows from before the column existed.
  other_eur?: number;
  total_eur: number;
};

// A month rebuilt from bank and broker statements (stocks, bond-like funds and cash only).
export type ReconstructedRow = {
  snapshot_date: string;
  stocks_eur: number;
  bonds_eur: number;
  cash_eur: number;
  // Absent on rows from before the column existed.
  crypto_eur?: number;
};

// Chart rows = imported history, rebuilt months for what falls between, then live snapshots from
// the baseline on. Live snapshots before the baseline are partial (accounts not linked yet) and
// would drag the line down, so they are dropped, but only when there is history to show instead.
// Nothing overlaps live data, and a rebuilt month never replaces an imported one.
export function withHistory(
  history: Array<HistoryRow>,
  snapshots: Array<NetWorthRow>,
  start: string | undefined = netWorthStart(),
  reconstructed: Array<ReconstructedRow> = [],
): Array<NetWorthRow> {
  if (history.length === 0 && reconstructed.length === 0) return snapshots;
  const base = periodBaseline(snapshots, start);
  const live = base ? snapshots.filter((s) => s.snapshot_date >= base.snapshot_date) : snapshots;
  const firstLive = live.at(0)?.snapshot_date;
  const before = (d: string) => !firstLive || d < firstLive;
  const imported = history.filter((h) => before(h.snapshot_date));
  const importedDates = new Set(imported.map((h) => h.snapshot_date));
  const past: Array<NetWorthRow> = [
    ...imported.map((h) => ({
      snapshot_date: h.snapshot_date,
      total_eur: h.total_eur,
      bank_total_eur: h.cash_eur,
      portfolio_total_eur: h.stocks_eur + h.bonds_eur,
      crypto_total_eur: h.crypto_eur,
    })),
    ...reconstructed
      .filter((r) => before(r.snapshot_date) && !importedDates.has(r.snapshot_date))
      .map((r) => ({
        snapshot_date: r.snapshot_date,
        total_eur: r.stocks_eur + r.bonds_eur + r.cash_eur + (r.crypto_eur ?? 0),
        bank_total_eur: r.cash_eur,
        portfolio_total_eur: r.stocks_eur + r.bonds_eur,
        crypto_total_eur: r.crypto_eur ?? 0,
      })),
  ].sort((x, y) => x.snapshot_date.localeCompare(y.snapshot_date));
  return [...past, ...live];
}

// The latest row on or before a date (rows sorted by date), e.g. the value at a month's end.
export function onOrBefore<T extends { snapshot_date: string }>(
  rows: Array<T>,
  date: string,
): T | undefined {
  return rows.filter((r) => r.snapshot_date <= date).at(-1);
}

// Net worth at a month's end and what it changed since the day before the month began. Null when
// no row falls inside the month: older data would read as a flat month instead of a missing one.
export function monthNetWorth(rows: Array<NetWorthRow>, dayBeforeIso: string, endIso: string) {
  const end = onOrBefore(rows, endIso);
  if (!end || end.snapshot_date <= dayBeforeIso) return null;
  const start = onOrBefore(rows, dayBeforeIso);
  if (!start) return { end, start: null, delta: null };
  return {
    end,
    start,
    delta: {
      total: end.total_eur - start.total_eur,
      bank: end.bank_total_eur - start.bank_total_eur,
      portfolio: end.portfolio_total_eur - start.portfolio_total_eur,
      crypto: end.crypto_total_eur - start.crypto_total_eur,
    },
  };
}

const DAY_MS = 86_400_000;
// Months are 28-31 days apart; anything wider than this is missing data, not a normal step.
const GAP_DAYS = 45;

export type ChartPoint<T extends NetWorthRow> = T & { ts: number; estimated_eur: number | null };

// ts drives a real time axis (monthly history and daily snapshots would otherwise get equal
// widths). estimated_eur is set only on the two points around a gap, so a dashed line joins
// them without inventing data in between.
export function chartPoints<T extends NetWorthRow>(rows: Array<T>): Array<ChartPoint<T>> {
  const points = rows.map((r) => ({
    ...r,
    ts: Date.parse(`${r.snapshot_date}T00:00:00`),
    estimated_eur: null as number | null,
  }));
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    if (a && b && (b.ts - a.ts) / DAY_MS > GAP_DAYS) {
      a.estimated_eur = a.total_eur;
      b.estimated_eur = b.total_eur;
    }
  }
  return points;
}

// Rows for the allocation chart: imported months, rebuilt months for what falls between, then
// live snapshots from the baseline on. Live snapshots split the portfolio into its bond-type
// holdings (bonds) and everything else (stocks and ETFs, as stocks), and bank balances count as
// cash. A rebuilt month never replaces an imported or live one.
export function allocationHistory(
  history: Array<HistoryRow>,
  snapshots: Array<NetWorthRow>,
  start: string | undefined = netWorthStart(),
  reconstructed: Array<ReconstructedRow> = [],
): Array<HistoryRow> {
  const base = periodBaseline(snapshots, start);
  const live = base ? snapshots.filter((s) => s.snapshot_date >= base.snapshot_date) : [];
  const firstLive = live.at(0)?.snapshot_date;
  const past = history.filter((h) => !firstLive || h.snapshot_date < firstLive);
  const imported = new Set(past.map((h) => h.snapshot_date));
  const rebuilt = reconstructed
    .filter((r) => !imported.has(r.snapshot_date) && (!firstLive || r.snapshot_date < firstLive))
    .map((r) => ({
      snapshot_date: r.snapshot_date,
      stocks_eur: r.stocks_eur,
      bonds_eur: r.bonds_eur,
      crypto_eur: r.crypto_eur ?? 0,
      cash_eur: r.cash_eur,
      liabilities_eur: 0,
      total_eur: r.stocks_eur + r.bonds_eur + r.cash_eur + (r.crypto_eur ?? 0),
    }));
  return [
    ...[...past, ...rebuilt].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)),
    ...live.map((s) => ({
      snapshot_date: s.snapshot_date,
      stocks_eur: s.portfolio_total_eur - (s.portfolio_bonds_eur ?? 0),
      bonds_eur: s.portfolio_bonds_eur ?? 0,
      crypto_eur: s.crypto_total_eur,
      cash_eur: s.bank_total_eur,
      liabilities_eur: 0,
      total_eur: s.total_eur,
    })),
  ];
}

export type AllocationPoint = {
  snapshot_date: string;
  ts: number;
  stocks: number;
  bonds: number;
  crypto: number;
  cash: number;
  other: number;
};

// Percent of gross assets per class. Liabilities (tax reserve) are left out so the mix describes
// what you hold, not what you owe.
export function allocationSeries(history: Array<HistoryRow>): Array<AllocationPoint> {
  return history.flatMap((h) => {
    const other = h.other_eur ?? 0;
    const gross = h.stocks_eur + h.bonds_eur + h.crypto_eur + h.cash_eur + other;
    if (gross <= 0) return [];
    const pct = (v: number) => (v / gross) * 100;
    return [
      {
        snapshot_date: h.snapshot_date,
        ts: Date.parse(`${h.snapshot_date}T00:00:00`),
        stocks: pct(h.stocks_eur),
        bonds: pct(h.bonds_eur),
        crypto: pct(h.crypto_eur),
        cash: pct(h.cash_eur),
        other: pct(other),
      },
    ];
  });
}

export type AllocationPlotPoint = {
  snapshot_date: string;
  ts: number;
  stocks: number | null;
  bonds: number | null;
  crypto: number | null;
  cash: number | null;
  other: number | null;
};

// Adds an empty point in the middle of any hole wider than GAP_DAYS, so the chart stops where
// there is no data instead of drawing a mix that was never recorded.
export function breakAtGaps(points: Array<AllocationPoint>): Array<AllocationPlotPoint> {
  return points.flatMap((p, i) => {
    const prev = points[i - 1];
    if (!prev || (p.ts - prev.ts) / DAY_MS <= GAP_DAYS) return [p];
    const ts = Math.round((p.ts + prev.ts) / 2);
    return [
      {
        snapshot_date: formatISODate(new Date(ts)),
        ts,
        stocks: null,
        bonds: null,
        crypto: null,
        cash: null,
        other: null,
      },
      p,
    ];
  });
}

// Same day one month earlier, clamped to that month's last day (31 Mar -> 28 Feb).
export function monthAgo(iso: string, months = 1): string {
  const [y = 0, m = 1, d = 1] = iso.split("-").map(Number);
  const prevLast = new Date(Date.UTC(y, m - months, 0));
  const day = Math.min(d, prevLast.getUTCDate());
  return `${prevLast.getUTCFullYear()}-${String(prevLast.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type ChartRange = "1M" | "3M" | "YTD" | "2Y";
export const CHART_RANGES: Array<ChartRange> = ["1M", "3M", "YTD", "2Y"];
export const RANGE_LABEL: Record<ChartRange, string> = {
  "1M": "Past month",
  "3M": "Past 3 months",
  YTD: "Year to date",
  "2Y": "Past 2 years",
};
const RANGE_MONTHS: Record<Exclude<ChartRange, "YTD">, number> = {
  "1M": 1,
  "3M": 3,
  "2Y": 24,
};

/** Points from `range` before the last one; "YTD" starts at the last day of the previous year. */
export function inRange<T extends { snapshot_date: string }>(
  points: Array<T>,
  range: ChartRange,
): Array<T> {
  const lastIso = points.at(-1)?.snapshot_date;
  if (lastIso == null) return points;
  const start =
    range === "YTD"
      ? `${Number(lastIso.slice(0, 4)) - 1}-12-31`
      : monthAgo(lastIso, RANGE_MONTHS[range]);
  return points.filter((p) => p.snapshot_date >= start);
}
