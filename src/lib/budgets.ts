// Monthly budgets per category (table category_budgets). A row holds from its month onward
// until a later row for the same category changes it; amount 0 means no budget from then on.
// With rollover on, a month's leftover (or overspend) moves into the next month:
// carried into next = carried in + budget − spent. Turning rollover on or off in a month changes
// what that month passes on to the next; what it received stays.

export interface BudgetRow {
  category: string;
  month: string; // YYYY-MM-01
  amount: number;
  rollover: boolean;
}

/** One row of v_spend_by_category_monthly: only flow_type = spend, never transfers or income. */
export interface MonthSpend {
  month: string;
  category: string;
  spend_eur: number;
}

export interface BudgetLine {
  category: string;
  budget: number;
  rollover: boolean;
  /** Leftover (positive) or overspend (negative) brought in from earlier months. */
  carriedIn: number;
  /** What may be spent this month: budget + carriedIn. */
  available: number;
  spent: number;
  /** available − spent; negative when over. */
  left: number;
}

const cents = (v: number) => Math.round(v * 100) / 100;

/** A typed budget amount ("250", "250,5"), rounded to cents; null when blank or not a number. */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
}

/** "YYYY-MM-01" of the month `offset` months after `month`. */
export function addMonths(month: string, offset: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Every month from `from` to `to`, both included. */
export function monthsBetween(from: string, to: string): Array<string> {
  const out: Array<string> = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** The row that sets a category's budget in a month: the latest one at or before it. */
export function effectiveBudget(
  rows: ReadonlyArray<BudgetRow>,
  category: string,
  month: string,
): BudgetRow | undefined {
  let best: BudgetRow | undefined;
  for (const r of rows)
    if (r.category === category && r.month <= month && (!best || r.month > best.month)) best = r;
  return best;
}

const spendKey = (month: string, category: string) => `${month}|${category}`;

function spendIndex(spend: ReadonlyArray<MonthSpend>): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of spend) {
    const k = spendKey(s.month, s.category);
    out.set(k, (out.get(k) ?? 0) + Number(s.spend_eur ?? 0));
  }
  return out;
}

/** Budget, spend and what's left for each budgeted category in `month`, biggest budget first. */
export function budgetLines(
  rows: ReadonlyArray<BudgetRow>,
  spend: ReadonlyArray<MonthSpend>,
  month: string,
): Array<BudgetLine> {
  const spent = spendIndex(spend);
  const lines: Array<BudgetLine> = [];
  for (const category of new Set(rows.map((r) => r.category))) {
    const first = rows
      .filter((r) => r.category === category)
      .reduce((a, r) => (r.month < a ? r.month : a), "9999-12-01");
    if (first > month) continue;
    let carry = 0;
    let line: BudgetLine | undefined;
    for (const m of monthsBetween(first, month)) {
      const row = effectiveBudget(rows, category, m)!;
      const budget = Number(row.amount);
      // What last month passed on (0 unless its rollover was on): the switch takes effect from
      // the next month, both ways.
      const carriedIn = carry;
      const available = budget + carriedIn;
      const s = spent.get(spendKey(m, category)) ?? 0;
      carry = row.rollover ? available - s : 0;
      line = {
        category,
        budget,
        rollover: row.rollover,
        carriedIn: cents(carriedIn),
        available: cents(available),
        spent: cents(s),
        left: cents(available - s),
      };
    }
    // A removed budget (0) with nothing carried in is no budget at all.
    if (line && (line.budget > 0 || line.carriedIn !== 0)) lines.push(line);
  }
  return lines.sort((a, b) => b.budget - a.budget || a.category.localeCompare(b.category));
}

/**
 * A starting budget per category: the average monthly spend over the last 3 to 6 months before
 * `month` that have any spending, rounded up to the next 10. Uncategorized is left out.
 */
export function suggestedBudgets(
  spend: ReadonlyArray<MonthSpend>,
  month: string,
  maxMonths = 6,
): Map<string, number> {
  const months = [...new Set(spend.filter((s) => s.month < month).map((s) => s.month))]
    .sort()
    .slice(-maxMonths);
  const out = new Map<string, number>();
  if (months.length === 0) return out;
  const inWindow = new Set(months);
  const totals = new Map<string, number>();
  for (const s of spend) {
    if (!inWindow.has(s.month) || s.category === "Uncategorized") continue;
    totals.set(s.category, (totals.get(s.category) ?? 0) + Number(s.spend_eur ?? 0));
  }
  for (const [category, total] of totals) {
    const avg = total / months.length;
    if (avg > 0) out.set(category, Math.ceil(avg / 10) * 10);
  }
  return out;
}

/**
 * Income for a month. Spread: 12 months divided evenly, so a 13th or 14th salary in June or
 * December counts a bit in every month instead of as a windfall. The 12 months end with this one
 * once it has income; before payday they end with the month before, so an unfinished month
 * doesn't pull the average down. Fewer than 12 months of history divide by the months since the
 * first income.
 */
export function monthIncome(
  incomeByMonth: ReadonlyMap<string, number>,
  month: string,
  spread: boolean,
): number {
  const own = incomeByMonth.get(month) ?? 0;
  if (!spread) return cents(own);
  const last = own > 0 ? month : addMonths(month, -1);
  const window = monthsBetween(addMonths(last, -11), last);
  const firstWithIncome = window.findIndex((m) => (incomeByMonth.get(m) ?? 0) > 0);
  if (firstWithIncome < 0) return 0;
  const used = window.slice(firstWithIncome);
  const total = used.reduce((sum, m) => sum + (incomeByMonth.get(m) ?? 0), 0);
  return cents(total / used.length);
}
