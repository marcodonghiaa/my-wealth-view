import { supabase } from "@/integrations/supabase/client";

/** A month's row of v_income_vs_expenses_monthly; null when nothing was recorded that month. */
export interface IncomeExpenseRow {
  income_eur: number | null;
  expenses_eur: number | null;
}

/** One month's income and spending, the source of Reports' and Income's net lines. */
export async function fetchIncomeExpenses(monthISO: string): Promise<IncomeExpenseRow | null> {
  const { data, error } = await supabase
    .from("v_income_vs_expenses_monthly")
    .select("income_eur,expenses_eur")
    .eq("month", monthISO)
    .maybeSingle();
  if (error) throw error;
  return data as IncomeExpenseRow | null;
}

/** Shared cache key, so Reports and Income ask once per month. */
export const incomeExpensesKey = (monthISO: string) => ["reports-income-expenses", monthISO];

/** Income minus spending; null for a month with no row (nothing recorded is not a net of zero). */
export const netAfterSpending = (row: IncomeExpenseRow | null | undefined): number | null =>
  row ? (row.income_eur ?? 0) - (row.expenses_eur ?? 0) : null;
