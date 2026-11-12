import { categoryColor } from "@/lib/categories";
import { formatISODate } from "@/lib/date";
import type { IncomeExpenseRow } from "@/lib/income-expenses";
import { formatPercent } from "@/lib/locale";
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

/**
 * Where a period switch lands. Wider: the period holding the one you were on. Narrower: today's
 * month or quarter when the period you were on holds today, else its last one, so Year → Month
 * never drops you on a January before your data.
 */
export function switchPeriod(start: Date, from: Period, to: Period, today: Date): Date {
  if (MONTHS_IN[to] >= MONTHS_IN[from]) return periodStart(start, to);
  const end = shiftPeriod(start, from, 1);
  const anchor =
    today >= start && today < end ? today : new Date(end.getFullYear(), end.getMonth() - 1, 1);
  return periodStart(anchor, to);
}

const quarterOf = (date: Date) => Math.floor(date.getMonth() / 3) + 1;

/** "November 2026", "Q4 2026" or "2026". */
export function periodLabel(start: Date, period: Period, locale?: string): string {
  if (period === "year") return String(start.getFullYear());
  if (period === "quarter") return `Q${quarterOf(start)} ${start.getFullYear()}`;
  return start.toLocaleDateString(locale, { month: "long", year: "numeric" });
}

/** A short label for one bar of the trend: "Nov", "Q4 '26" or "2026". */
export function shortPeriodLabel(start: Date, period: Period, locale?: string): string {
  if (period === "year") return String(start.getFullYear());
  if (period === "quarter") return `Q${quarterOf(start)} '${String(start.getFullYear()).slice(2)}`;
  return start.toLocaleDateString(locale, { month: "short" });
}

/** [first day, first day after) of the period, as ISO dates for range filters. */
export function periodRange(start: Date, period: Period): { from: string; to: string } {
  return { from: formatISODate(start), to: formatISODate(shiftPeriod(start, period, 1)) };
}

/** A month's row of v_income_vs_expenses_monthly, with its month. */
export type MonthlyFlowRow = IncomeExpenseRow & { month: string | null };

/** A row of v_spend_by_category_monthly, with its month. */
export type MonthlyCategoryRow = MonthlySpendRow & { month: string | null };

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

const RATE_FLOOR = -9.99;

/** "25%" ("25 %" in de-DE), "−12%"; a dash when there is no rate. Locale from Settings. */
export function formatRate(rate: number | null): string {
  if (rate == null) return "—";
  // Tiny income (a refund, no salary) gives rates like −4,999,900%: show a floor instead.
  if (rate < RATE_FLOOR) return `< ${formatPercent(RATE_FLOOR, { digits: 0, signed: true })}`;
  // Signed only below zero, with a real minus; a rate that rounds to 0% shows none.
  const negative = rate < 0 && Math.round(-rate * 100) >= 1;
  return formatPercent(negative ? rate : Math.abs(rate), { digits: 0, signed: negative });
}

const toCents = (v: number) => Math.round(v * 100) / 100 || 0;

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
  // Money in cents: adding months leaves float noise that would read as "spent more".
  income = toCents(income);
  spending = toCents(spending);
  return {
    income,
    spending,
    net: toCents(income - spending),
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

/**
 * Where the trend of `count` bars ends: the current period, unless the one on screen is older
 * than that window, then the window starts at it, so its bar is always there to highlight.
 */
export function trendEnd(start: Date, current: Date, period: Period, count: number): Date {
  return start < shiftPeriod(current, period, -(count - 1))
    ? shiftPeriod(start, period, count - 1)
    : current;
}

/**
 * Drops the empty periods before the first one with data, so a new install isn't a row of gaps.
 * Bars from `keep` (the period on screen) on are never dropped, even when empty.
 */
export function trimLeadingEmpty(bars: Array<TrendBar>, keep?: string): Array<TrendBar> {
  const first = bars.findIndex((b) => b.months > 0 || (keep != null && b.key >= keep));
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
  rows: Array<MonthlyCategoryRow>,
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

// Money in and money kept share the gain colour; money taken from savings is the loss colour.
const GAIN_COLOR = "var(--color-positive)";
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
  for (const p of lefts) left(p.name, "income", GAIN_COLOR, p.value);
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
  if (net > CENT) right(SAVED, "saved", GAIN_COLOR, net);

  return { nodes, links };
}

/** A long payer or category name, cut to fit the narrow label column on phones. */
export function fitLabel(name: string, max: number): string {
  // Direction overrides could flip the label (and its amount), or stay open after a cut: drop them.
  // Only the start is segmented, so a huge custom name can't stall the page.
  const shown = name.replace(/[\u202A-\u202E\u2066-\u2069]/g, "");
  const clean = shown.slice(0, max * 8);
  // Count what the reader sees: an emoji or a letter with its accent is one character.
  const chars = Array.from(new Intl.Segmenter().segment(clean), (g) => g.segment);
  return chars.length > max || clean.length < shown.length
    ? `${chars
        .slice(0, max - 1)
        .join("")
        .trimEnd()}…`
    : clean;
}

/** Gap between a Sankey band and its label. */
export const SANKEY_LAYOUT_GAP = 8;

/**
 * Sankey label room. The svg clips past its edge, so each side's margin holds the longest label
 * (`chars` capitals). On a phone the payers' labels sit on their band instead of outside it.
 */
export const SANKEY_LAYOUT = {
  desktop: { chars: 20, left: 160, right: 168, outsideLeft: true },
  phone: { chars: 12, left: 4, right: 104, outsideLeft: false },
};
