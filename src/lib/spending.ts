import { toneOf, type Tone } from "@/lib/tone";

/** One row of v_spend_by_category_monthly, as Spending and Reports read it. */
export interface MonthlySpendRow {
  category: string | null;
  spend_eur: number | null;
}

export interface CategorySpend {
  category: string;
  spend_eur: number;
}

/** The label the views' null category gets on screen. */
export const UNCATEGORIZED_LABEL = "Uncategorized";

/** A month's spend per category, largest first. Empty and net-refund (≤ 0) rows are left out. */
export function categorySpend(rows: Array<MonthlySpendRow>): Array<CategorySpend> {
  return rows
    .filter((r) => r.spend_eur != null && r.spend_eur > 0)
    .map((r) => ({ category: r.category ?? UNCATEGORIZED_LABEL, spend_eur: r.spend_eur as number }))
    .sort((a, b) => b.spend_eur - a.spend_eur);
}

/** The category that grew most against the previous month, or null when none grew. */
export function biggestMover(
  current: Array<MonthlySpendRow>,
  previous: Array<MonthlySpendRow>,
): { category: string; delta: number } | null {
  const before = new Map<string, number>();
  for (const r of previous) before.set(r.category ?? UNCATEGORIZED_LABEL, r.spend_eur ?? 0);
  let mover: { category: string; delta: number } | null = null;
  for (const r of current) {
    const category = r.category ?? UNCATEGORIZED_LABEL;
    const delta = (r.spend_eur ?? 0) - (before.get(category) ?? 0);
    if (delta > 0 && (!mover || delta > mover.delta)) mover = { category, delta };
  }
  return mover;
}

/**
 * This month's total against the previous month's. Null when the previous month has no spend,
 * since "€900 more than nothing" says nothing. Spending less is the good direction, and moves
 * under €1 stay neutral.
 */
export function spendChange(
  current: number,
  previous: number,
): { delta: number; tone: Tone } | null {
  if (previous <= 0) return null;
  const delta = current - previous;
  return { delta, tone: toneOf(-delta, 1) };
}

/** A category's share of the month as a whole percent; slivers read "<1%", not "0%". */
export function sharePercent(value: number, total: number): string {
  if (total <= 0) return "";
  const pct = (value / total) * 100;
  return pct > 0 && pct < 1 ? "<1%" : `${Math.round(pct)}%`;
}
