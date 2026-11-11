import { categoryColor } from "@/lib/categories";
import { formatISODate } from "@/lib/date";
import { incomeTitle } from "@/lib/transactions";
import { UNCATEGORIZED_LABEL, type MonthlySpendRow } from "@/lib/spending";

/** How much time one cash-flow view covers. */
export type Period = "month" | "quarter" | "year";

const MONTHS_IN: Record<Period, number> = { month: 1, quarter: 3, year: 12 };

/** The first day of the month, quarter or year that holds `date`. */
export function periodStart(date: Date, period: Period): Date {
  const step = MONTHS_IN[period];
  const month = Math.floor(date.getMonth() / step) * step;
  return new Date(date.getFullYear(), month, 1);
}

/** The start of the period `n` steps away (negative goes back). */
export function shiftPeriod(start: Date, period: Period, n: number): Date {
  return new Date(start.getFullYear(), start.getMonth() + n * MONTHS_IN[period], 1);
}

/** "November 2026", "Q4 2026" or "2026". */
export function periodLabel(start: Date, period: Period, locale?: string): string {
  if (period === "year") return String(start.getFullYear());
  if (period === "quarter")
    return `Q${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()}`;
  return start.toLocaleDateString(locale, { month: "long", year: "numeric" });
}

/** A short label for one bar of the trend: "Nov", "Q4 '26" or "2026". */
export function shortPeriodLabel(start: Date, period: Period, locale?: string): string {
  if (period === "year") return String(start.getFullYear());
  if (period === "quarter")
    return `Q${Math.floor(start.getMonth() / 3) + 1} '${String(start.getFullYear()).slice(2)}`;
  return start.toLocaleDateString(locale, { month: "short" });
}

/** [first day, first day after) of the period, as ISO dates for range filters. */
export function periodRange(start: Date, period: Period): { from: string; to: string } {
  return { from: formatISODate(start), to: formatISODate(shiftPeriod(start, period, 1)) };
}

/** A month's row of v_income_vs_expenses_monthly, with its month. */
export interface MonthlyFlowRow {
  month: string | null;
  income_eur: number | null;
  expenses_eur: number | null;
}

export interface FlowSummary {
  income: number;
  spending: number;
  /** Income minus spending: what was saved (negative: what came out of savings). */
  net: number;
  /** Share of income kept, 0.25 = 25%; null without income, where a rate means nothing. */
  savingsRate: number | null;
  /** Months in the range that have any recorded income or spending. */
  months: number;
}

/** Share of income kept; null when nothing came in. Can go below zero. */
export function savingsRate(income: number, spending: number): number | null {
  return income > 0 ? (income - spending) / income : null;
}

/** "25%", "−12%"; a dash when there is no rate. */
export function formatRate(rate: number | null): string {
  if (rate == null) return "—";
  const pct = Math.round(rate * 100);
  return pct < 0 ? `−${Math.abs(pct)}%` : `${pct}%`;
}

const inRange = (month: string | null, from: string, to: string): month is string =>
  month != null && month >= from && month < to;

/** Income, spending, net and savings rate of the months in [from, to). */
export function summarize(rows: Array<MonthlyFlowRow>, from: string, to: string): FlowSummary {
  let income = 0;
  let spending = 0;
  let months = 0;
  for (const r of rows) {
    if (!inRange(r.month, from, to)) continue;
    const i = r.income_eur ?? 0;
    const s = r.expenses_eur ?? 0;
    if (i === 0 && s === 0) continue;
    income += i;
    spending += s;
    months += 1;
  }
  return {
    income,
    spending,
    net: income - spending,
    savingsRate: savingsRate(income, spending),
    months,
  };
}

export interface TrendBar extends FlowSummary {
  start: Date;
  key: string;
}

/** The `count` periods ending at `last` (oldest first), each summed from the monthly rows. */
export function trend(
  rows: Array<MonthlyFlowRow>,
  period: Period,
  last: Date,
  count: number,
): Array<TrendBar> {
  const bars: Array<TrendBar> = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = shiftPeriod(last, period, -i);
    const { from, to } = periodRange(start, period);
    bars.push({ start, key: from, ...summarize(rows, from, to) });
  }
  return bars;
}

/** Drops the empty periods before the first one with data, so a new install isn't a row of gaps. */
export function trimLeadingEmpty(bars: Array<TrendBar>): Array<TrendBar> {
  const first = bars.findIndex((b) => b.months > 0);
  return first <= 0 ? bars : bars.slice(first);
}

/** The earliest month that has income or spending, so the switcher knows where history begins. */
export function firstMonth(rows: Array<MonthlyFlowRow>): string | null {
  let first: string | null = null;
  for (const r of rows) {
    if (!r.month || ((r.income_eur ?? 0) === 0 && (r.expenses_eur ?? 0) === 0)) continue;
    if (first == null || r.month < first) first = r.month;
  }
  return first;
}

/** One incoming payment, as v_transactions_eur gives it for flow_type = income. */
export interface IncomeTxRow {
  payer_name?: string | null;
  creditor_name: string | null;
  category: string | null;
  personal_signed_amount_eur: number | null;
}

export interface Part {
  name: string;
  value: number;
}

/** Income per payer (the Income page's title for a row), largest first. */
export function incomeBySource(rows: Array<IncomeTxRow>): Array<Part> {
  const by = new Map<string, number>();
  for (const r of rows) {
    const v = r.personal_signed_amount_eur ?? 0;
    if (v <= 0) continue;
    const name = incomeTitle(r);
    by.set(name, (by.get(name) ?? 0) + v);
  }
  return [...by].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/** Below a cent the sides are equal; anything left is rounding, not a flow to draw. */
const CENT = 0.005;

/**
 * Spend per category over the range, largest first. A month counts only when its category rows
 * add up to its total from v_income_vs_expenses_monthly: where the category view falls back to
 * imported history (a month with no bank spend), the totals don't count it, and the two sides
 * of the diagram would no longer match. Such a month's spending shows as "Other spending".
 */
export function spendByCategory(
  rows: Array<MonthlySpendRow & { month: string | null }>,
  monthTotals: Map<string, number>,
): Array<Part> {
  const monthSum = new Map<string, number>();
  for (const r of rows)
    if (r.month) monthSum.set(r.month, (monthSum.get(r.month) ?? 0) + (r.spend_eur ?? 0));
  const by = new Map<string, number>();
  for (const r of rows) {
    if (!r.month) continue;
    const total = monthTotals.get(r.month) ?? 0;
    if (total <= 0 || Math.abs((monthSum.get(r.month) ?? 0) - total) > CENT) continue;
    const v = r.spend_eur ?? 0;
    if (v <= 0) continue;
    const name = r.category ?? UNCATEGORIZED_LABEL;
    by.set(name, (by.get(name) ?? 0) + v);
  }
  return [...by].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/**
 * Keeps the `keep` largest parts and folds the rest into one `rest` part, then tops up `rest`
 * so the parts add up to `total` (a page cap or a missing month never makes a side short).
 */
export function topParts(
  parts: Array<Part>,
  total: number,
  keep: number,
  rest: string,
): Array<Part> {
  const sorted = [...parts].filter((p) => p.value > CENT).sort((a, b) => b.value - a.value);
  const kept = sorted.length > keep + 1 ? sorted.slice(0, keep) : sorted;
  const shown = kept.reduce((s, p) => s + p.value, 0);
  const remainder = total - shown;
  return remainder > CENT ? [...kept, { name: rest, value: remainder }] : kept;
}

export type FlowNodeKind = "income" | "hub" | "spend" | "saved" | "drawn";

export interface FlowNode {
  name: string;
  kind: FlowNodeKind;
  color: string;
}

export interface FlowLink {
  source: number;
  target: number;
  value: number;
}

export interface FlowGraph {
  nodes: Array<FlowNode>;
  links: Array<FlowLink>;
}

export const OTHER_INCOME = "Other income";
export const OTHER_SPENDING = "Other spending";
export const SAVED = "Saved";
export const FROM_SAVINGS = "From savings";
const HUB = "Income";

const INCOME_COLOR = "var(--color-positive)";
const SAVED_COLOR = "var(--color-positive)";
const DRAWN_COLOR = "var(--color-negative)";
const OTHER_COLOR = categoryColor(null);

/**
 * The Sankey: where the money came from (payers, plus savings when spending beat income), one
 * hub, and where it went (categories, plus what was saved). Both sides add up to the hub.
 * Empty when nothing came in or went out.
 */
export function buildFlow({
  income,
  spending,
  sources,
  categories,
  maxSources = 4,
  maxCategories = 7,
}: {
  income: number;
  spending: number;
  sources: Array<Part>;
  categories: Array<Part>;
  maxSources?: number;
  maxCategories?: number;
}): FlowGraph {
  if (income <= CENT && spending <= CENT) return { nodes: [], links: [] };
  const nodes: Array<FlowNode> = [];
  const links: Array<FlowLink> = [];
  const lefts = topParts(sources, Math.max(income, 0), maxSources, OTHER_INCOME);
  const rights = topParts(categories, Math.max(spending, 0), maxCategories, OTHER_SPENDING);
  const net = income - spending;

  const left = (name: string, kind: FlowNodeKind, color: string, value: number) => {
    nodes.push({ name, kind, color });
    links.push({ source: nodes.length - 1, target: -1, value });
  };
  for (const p of lefts) left(p.name, "income", INCOME_COLOR, p.value);
  if (net < -CENT) left(FROM_SAVINGS, "drawn", DRAWN_COLOR, -net);

  nodes.push({ name: HUB, kind: "hub", color: "var(--color-foreground)" });
  const hub = nodes.length - 1;
  for (const l of links) l.target = hub;

  const right = (name: string, kind: FlowNodeKind, color: string, value: number) => {
    nodes.push({ name, kind, color });
    links.push({ source: hub, target: nodes.length - 1, value });
  };
  for (const p of rights)
    right(
      p.name,
      "spend",
      p.name === OTHER_SPENDING ? OTHER_COLOR : categoryColor(p.name),
      p.value,
    );
  if (net > CENT) right(SAVED, "saved", SAVED_COLOR, net);

  return { nodes, links };
}

/** A long payer or category name, cut to fit the narrow label column on phones. */
export function fitLabel(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}
