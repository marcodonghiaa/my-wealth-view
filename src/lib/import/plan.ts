import { parseAmount, parseMonth } from "./normalize";
import { suggestCategory, type AppCategory } from "./suggest-category";

export interface Skipped {
  line: number;
  reason: string;
}

export interface NetWorthPlanRow {
  snapshot_date: string;
  stocks_eur: number;
  bonds_eur: number;
  crypto_eur: number;
  cash_eur: number;
  other_eur: number;
  liabilities_eur: number;
  total_eur: number;
}

export interface SpendPlanRow {
  month: string;
  category: string;
  spend_eur: number;
}

export interface Plan<T> {
  rows: Array<T>;
  skipped: Array<Skipped>;
}

/** A category as written in the file, and the app category its rows are saved under. */
export interface CategoryMapping {
  source: string;
  category: AppCategory;
}

type Columns<K extends string> = Record<K, number | null>;

const CLASS_ROLES = ["stocks", "bonds", "crypto", "cash"] as const;
const cell = (row: Array<string>, index: number | null) =>
  index === null ? "" : (row[index] ?? "").trim();
// Sums of parsed floats drift (0.1 + 0.2 = 0.30000000000000004): store whole cents.
const cents = (n: number) => Math.round(n * 100) / 100;
// Line 1 is the header, so the first data row is line 2.
const lineOf = (i: number) => i + 2;
const monthEnd = (ym: string) => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

type NetWorthRoles = "month" | "total" | "stocks" | "bonds" | "crypto" | "cash";

/** Turns CSV rows into net_worth_history rows. Pure: nothing is written here. */
export function planNetWorth(
  rows: Array<Array<string>>,
  columns: Columns<NetWorthRoles>,
): Plan<NetWorthPlanRow> {
  const byMonth = new Map<string, { line: number; row: NetWorthPlanRow }>();
  const skipped: Array<Skipped> = [];

  rows.forEach((raw, i): undefined => {
    const line = lineOf(i);
    const skip = (reason: string): undefined => {
      skipped.push({ line, reason });
    };

    const month = parseMonth(cell(raw, columns.month));
    if (!month) return skip("Month not readable.");

    const parts: Array<number> = [];
    for (const role of CLASS_ROLES) {
      const text = cell(raw, columns[role]);
      const value = text === "" ? 0 : parseAmount(text);
      if (value === null || value < 0) return skip(`${role} is not a valid amount.`);
      parts.push(value);
    }
    const [stocks, bonds, crypto, cash] = parts as [number, number, number, number];
    const split = cents(stocks + bonds + crypto + cash);

    const totalText = cell(raw, columns.total);
    const hasSplit = CLASS_ROLES.some((role) => cell(raw, columns[role]) !== "");
    if (totalText === "" && !hasSplit) return skip("No total and no asset split.");
    const total = totalText === "" ? split : parseAmount(totalText);
    if (total === null) return skip("Total is not a valid amount.");

    const previous = byMonth.get(month);
    if (previous) {
      skipped.push({
        line: previous.line,
        reason: "Month repeated later in the file; last one kept.",
      });
    }
    byMonth.set(month, {
      line,
      row: {
        snapshot_date: monthEnd(month),
        stocks_eur: stocks,
        bonds_eur: bonds,
        crypto_eur: crypto,
        cash_eur: cash,
        other_eur: Math.max(0, cents(total - split)),
        liabilities_eur: Math.max(0, cents(split - total)),
        total_eur: total,
      },
    });
    return undefined;
  });

  const sorted = [...byMonth.values()]
    .map((v) => v.row)
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  return { rows: sorted, skipped };
}

const EUR = new Set(["", "EUR", "€"]);
const NOT_SPEND = new Set(["Income", "Transfer"]);

/** Turns CSV rows into spend_history rows: EUR only, one row per month and category.
 * overrides: the user's choice for a file category, in place of the suggested one. */
export function planSpend(
  rows: Array<Array<string>>,
  columns: Columns<"month" | "category" | "amount" | "currency">,
  overrides: Partial<Record<string, AppCategory>> = {},
): Plan<SpendPlanRow> & { categories: Array<CategoryMapping> } {
  const totals = new Map<string, SpendPlanRow>();
  const skipped: Array<Skipped> = [];
  // Every file category once, so the user sees (and can change) where its rows go.
  const mapped = new Map<string, AppCategory>();
  const categoryOf = (source: string) => {
    // hasOwn: a file category named "constructor" must not read Object.prototype.
    const category =
      (Object.hasOwn(overrides, source) && overrides[source]) || suggestCategory(source);
    mapped.set(source, category);
    return category;
  };

  rows.forEach((raw, i): undefined => {
    const line = lineOf(i);
    const skip = (reason: string): undefined => {
      skipped.push({ line, reason });
    };

    const month = parseMonth(cell(raw, columns.month));
    if (!month) return skip("Month not readable.");
    if (!EUR.has(cell(raw, columns.currency).toUpperCase())) return skip("Not in EUR.");
    const category = categoryOf(cell(raw, columns.category));
    if (NOT_SPEND.has(category)) return skip(`${category} is not spending.`);
    const amount = parseAmount(cell(raw, columns.amount));
    if (amount === null) return skip("Amount is not valid.");
    if (amount === 0) return skip("Amount is zero.");

    const key = `${month}|${category}`;
    const spend = (totals.get(key)?.spend_eur ?? 0) + Math.abs(amount);
    totals.set(key, { month: `${month}-01`, category, spend_eur: cents(spend) });
    return undefined;
  });

  const categories = [...mapped].map(([source, category]) => ({ source, category }));
  return { rows: [...totals.values()], skipped, categories };
}
