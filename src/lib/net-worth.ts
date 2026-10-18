// Optional YYYY-MM-DD from which "change since the start" is measured. Set it when your first
// snapshots only held part of your net worth (e.g. before investments were added), which would
// otherwise read as a huge percentage. Unset: measure from the very first snapshot.
export const NET_WORTH_START: string | undefined = import.meta.env["VITE_NET_WORTH_START"];

export function periodBaseline<T extends { snapshot_date: string }>(
  snapshots: Array<T>,
  start: string | undefined = NET_WORTH_START,
): T | undefined {
  return start ? snapshots.find((s) => s.snapshot_date >= start) : snapshots.at(0);
}

export type NetWorthRow = {
  snapshot_date: string;
  total_eur: number;
  bank_total_eur: number;
  portfolio_total_eur: number;
  crypto_total_eur: number;
};

// Month-end rows imported from before live snapshots existed (table net_worth_history).
export type HistoryRow = {
  snapshot_date: string;
  stocks_eur: number;
  bonds_eur: number;
  crypto_eur: number;
  cash_eur: number;
  liabilities_eur: number;
  total_eur: number;
};

// Chart rows = imported history, then live snapshots from the baseline on. Live snapshots before
// the baseline are partial (accounts not linked yet) and would drag the line down, so they are
// dropped, but only when there is history to show instead; history never overlaps live data.
export function withHistory(
  history: Array<HistoryRow>,
  snapshots: Array<NetWorthRow>,
  start: string | undefined = NET_WORTH_START,
): Array<NetWorthRow> {
  if (history.length === 0) return snapshots;
  const base = periodBaseline(snapshots, start);
  const live = base ? snapshots.filter((s) => s.snapshot_date >= base.snapshot_date) : snapshots;
  const firstLive = live.at(0)?.snapshot_date;
  const past = history
    .filter((h) => !firstLive || h.snapshot_date < firstLive)
    .map((h) => ({
      snapshot_date: h.snapshot_date,
      total_eur: h.total_eur,
      bank_total_eur: h.cash_eur,
      portfolio_total_eur: h.stocks_eur + h.bonds_eur,
      crypto_total_eur: h.crypto_eur,
    }));
  return [...past, ...live];
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
