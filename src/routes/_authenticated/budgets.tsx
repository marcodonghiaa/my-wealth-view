import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatISODate } from "@/lib/date";
import { formatEur, startOfMonth } from "@/lib/transactions";
import {
  AVERAGE_MONTHS,
  addMonths,
  budgetLines,
  monthIncome,
  parseAmount,
  suggestedBudgets,
  type BudgetLine,
  type BudgetRow,
  type MonthSpend,
} from "@/lib/budgets";
import { ALWAYS_SHOWN } from "@/lib/categories";
import { useCategories } from "@/lib/use-categories";
import { MonthSwitcher } from "@/components/month-switcher";
import { HeadlineFigure } from "@/components/headline-figure";
import { CategoryAvatar } from "@/components/category-avatar";
import { EmptyState } from "@/components/empty-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { GroupedList, SectionTitle } from "@/components/ui/grouped-list";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/budgets")({
  head: () => ({
    meta: [
      { title: "Budgets — Alopex" },
      { name: "description", content: "A monthly budget per category, with rollover." },
    ],
  }),
  component: BudgetsPage,
});

const BUDGETS_KEY = ["category-budgets"];
const SPREAD_KEY = "alopex.budgets.spreadIncome";
// Never budgeted: they aren't spending.
const NOT_BUDGETED = new Set(ALWAYS_SHOWN);
// Spend history read for averages and unbudgeted spend: this many months back, every category.
const HISTORY_MONTHS = AVERAGE_MONTHS;

async function fetchBudgets(): Promise<Array<BudgetRow>> {
  const { data, error } = await supabase
    .from("category_budgets")
    .select("category,month,amount,rollover");
  if (error) throw error;
  return ((data ?? []) as Array<BudgetRow>).map((r) => ({ ...r, amount: Number(r.amount) }));
}

const PAGE_SIZE = 1000; // PostgREST returns at most 1000 rows per request

/**
 * Spend per month and category from `from` to `to`, every page of it. With `categories`, only
 * those (a long rollover history needs only the budgeted ones).
 */
async function fetchSpend(
  from: string,
  to: string,
  categories?: ReadonlyArray<string>,
): Promise<Array<MonthSpend>> {
  if (from > to || categories?.length === 0) return [];
  const out: Array<MonthSpend> = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    let q = supabase
      .from("v_spend_by_category_monthly")
      .select("month,category,spend_eur")
      .gte("month", from)
      .lte("month", to);
    if (categories) q = q.in("category", [...categories]);
    const { data, error } = await q
      .order("month")
      .order("category")
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as Array<{
      month: string;
      category: string | null;
      spend_eur: number | null;
    }>;
    for (const r of page)
      out.push({
        month: String(r.month),
        category: r.category ?? "Uncategorized",
        spend_eur: Number(r.spend_eur ?? 0),
      });
    if (page.length < PAGE_SIZE) return out;
  }
}

// Same income as Reports: my share of money in, per month (transfers and refunds excluded).
async function fetchIncomeByMonth(from: string, to: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("v_income_vs_expenses_monthly")
    .select("month,income_eur")
    .gte("month", from)
    .lte("month", to);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ month: string; income_eur: number | null }>;
  return new Map(rows.map((r) => [String(r.month), Number(r.income_eur ?? 0)]));
}

function readSpread(): boolean {
  try {
    return window.localStorage.getItem(SPREAD_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSpread(on: boolean) {
  try {
    window.localStorage.setItem(SPREAD_KEY, on ? "1" : "0");
  } catch {
    // Private mode or blocked storage: the toggle still works for this visit.
  }
}

function BudgetsPage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [spread, setSpread] = useState<boolean>(readSpread);
  const monthIso = formatISODate(month);

  const budgetsQuery = useQuery({ queryKey: BUDGETS_KEY, queryFn: fetchBudgets });
  const rows = useMemo(() => budgetsQuery.data ?? [], [budgetsQuery.data]);
  // Recent months for every category (averages, unbudgeted spend); older months only for the
  // budgeted categories, as far back as their first budget (rollover).
  const recentFrom = addMonths(monthIso, -HISTORY_MONTHS);
  const earliest = rows.reduce((a, r) => (r.month < a ? r.month : a), recentFrom);
  const budgetedCategories = [...new Set(rows.map((r) => r.category))].sort();
  const spendQuery = useQuery({
    queryKey: ["budget-spend", earliest, monthIso, budgetedCategories],
    queryFn: async () => [
      ...(await fetchSpend(earliest, addMonths(recentFrom, -1), budgetedCategories)),
      ...(await fetchSpend(recentFrom, monthIso)),
    ],
    enabled: budgetsQuery.isSuccess,
  });
  const incomeQuery = useQuery({
    queryKey: ["budget-income", monthIso],
    queryFn: () => fetchIncomeByMonth(addMonths(monthIso, -12), monthIso),
  });
  const { list: categories } = useCategories();

  const spend = useMemo(() => spendQuery.data ?? [], [spendQuery.data]);
  const lines = useMemo(() => budgetLines(rows, spend, monthIso), [rows, spend, monthIso]);
  const { amounts: suggestions, months: averageMonths } = useMemo(
    () => suggestedBudgets(spend, monthIso),
    [spend, monthIso],
  );
  const budgeted = new Set(lines.map((l) => l.category));
  const unbudgeted = spend
    .filter(
      (s) =>
        s.month === monthIso &&
        s.spend_eur > 0 &&
        !budgeted.has(s.category) &&
        !NOT_BUDGETED.has(s.category),
    )
    .sort((a, b) => b.spend_eur - a.spend_eur);
  const addable = categories.filter((c) => !budgeted.has(c) && !NOT_BUDGETED.has(c));

  const save = useMutation({
    mutationFn: async (next: Array<Omit<BudgetRow, "month">>) => {
      const { error } = await supabase.from("category_budgets").upsert(
        next.map((r) => ({ ...r, month: monthIso, updated_at: new Date().toISOString() })),
        { onConflict: "user_id,category,month" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: BUDGETS_KEY }),
    onError: (err: Error) => toast.error("Couldn't save the budget", { description: err.message }),
  });

  const totalAvailable = lines.reduce((s, l) => s + l.available, 0);
  const totalSpent = lines.reduce((s, l) => s + l.spent, 0);
  const totalBudget = lines.reduce((s, l) => s + l.budget, 0);
  const income = incomeQuery.data
    ? monthIncome(incomeQuery.data, monthIso, spread, formatISODate(startOfMonth(new Date())))
    : null;

  const monthLabel = month.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const canGoNext =
    startOfMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)) <=
    startOfMonth(new Date());
  const loading = budgetsQuery.isPending || (budgetsQuery.isSuccess && spendQuery.isPending);
  const error = budgetsQuery.error ?? spendQuery.error;

  const startFromAverages = () =>
    save.mutate(
      [...suggestions].map(([category, amount]) => ({ category, amount, rollover: false })),
    );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <h1 className="sr-only">Budgets</h1>

      {error && (
        <Alert className="mb-6">
          Couldn't load budgets: {error.message}. If this is a new install or an update, apply the
          latest database migration (see UPGRADING.md).
        </Alert>
      )}

      <MonthSwitcher
        className="mb-6"
        label={monthLabel}
        onPrev={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        onNext={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        canGoNext={canGoNext}
      />

      {/* Option A from polish pass 1: a past-month change holds onward, so say so up front. */}
      {canGoNext && !loading && !error && (
        <p className="-mt-3 mb-6 text-sm text-muted-foreground">
          Changes here apply from {monthLabel} onward, until a later month has its own budget.
        </p>
      )}

      {loading ? (
        <Skeleton className="h-80" />
      ) : error ? null : lines.length === 0 ? (
        <GroupedList>
          <EmptyState
            title={`No budgets for ${monthLabel}`}
            hint={
              suggestions.size > 0
                ? `Start from what you usually spend: your average of the last ${
                    averageMonths === 1 ? "month" : `${averageMonths} months`
                  }, per category. You can change each one after.`
                : "Add a budget for a category below."
            }
            action={
              suggestions.size > 0 ? (
                <Button onClick={startFromAverages} disabled={save.isPending}>
                  Start from my averages
                </Button>
              ) : undefined
            }
          />
        </GroupedList>
      ) : (
        <>
          <section aria-label={`Left to spend in ${monthLabel}`} className="mb-8">
            <p className="text-[0.9375rem] font-medium text-muted-foreground">
              {totalAvailable - totalSpent < 0 ? "Over budget" : "Left to spend"}
            </p>
            <div className="mt-1">
              <HeadlineFigure value={totalAvailable - totalSpent} currency="EUR" />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-figure text-foreground">{formatEur(totalSpent)}</span> spent of{" "}
              <span className="font-figure text-foreground">{formatEur(totalAvailable)}</span>
            </p>
          </section>

          <GroupedList>
            <ul className="divide-y divide-hairline">
              {lines.map((line) => (
                <BudgetLineRow
                  key={line.category}
                  line={line}
                  busy={save.isPending}
                  onSave={(amount, rollover) =>
                    save.mutate([{ category: line.category, amount, rollover }])
                  }
                />
              ))}
            </ul>
          </GroupedList>
        </>
      )}

      {!loading && !error && (
        <>
          {unbudgeted.length > 0 && (
            <section className="mt-6">
              <SectionTitle>Spent without a budget</SectionTitle>
              <GroupedList>
                <ul className="divide-y divide-hairline">
                  {unbudgeted.map((s) => (
                    <li
                      key={s.category}
                      className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 text-sm sm:px-5"
                    >
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        <CategoryAvatar
                          category={s.category === "Uncategorized" ? null : s.category}
                        />
                        {s.category}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="font-figure text-foreground">
                          {formatEur(s.spend_eur)}
                        </span>
                        {s.category !== "Uncategorized" && (
                          <Button
                            variant="quiet"
                            size="sm"
                            disabled={save.isPending}
                            onClick={() =>
                              save.mutate([
                                {
                                  category: s.category,
                                  amount:
                                    suggestions.get(s.category) ?? Math.ceil(s.spend_eur / 10) * 10,
                                  rollover: false,
                                },
                              ])
                            }
                          >
                            Add budget
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </GroupedList>
            </section>
          )}

          <AddBudget
            categories={addable}
            suggestions={suggestions}
            busy={save.isPending}
            onAdd={(category, amount) => save.mutate([{ category, amount, rollover: false }])}
          />

          <section className="mt-6" aria-label="Income">
            <SectionTitle>Income</SectionTitle>
            <GroupedList>
              <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                <span className="font-medium text-foreground">
                  {spread ? "Income, spread over the year" : "Income this month"}
                </span>
                <span className="font-figure text-foreground">
                  {incomeQuery.isError ? (
                    <span className="text-negative">
                      Couldn't load income: {incomeQuery.error.message}
                    </span>
                  ) : income == null ? (
                    "—"
                  ) : (
                    formatEur(income)
                  )}
                </span>
              </div>
              {lines.length > 0 && income != null && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                  <span className="text-muted-foreground">Not yet budgeted</span>
                  <span
                    className={`font-figure ${income - totalBudget < 0 ? "text-negative" : "text-foreground"}`}
                  >
                    {formatEur(income - totalBudget)}
                  </span>
                </div>
              )}
              <label className="flex cursor-pointer items-start gap-3 px-4 py-3 text-sm sm:px-5">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[var(--color-primary)]"
                  checked={spread}
                  onChange={(e) => {
                    setSpread(e.target.checked);
                    writeSpread(e.target.checked);
                  }}
                />
                <span>
                  <span className="font-medium text-foreground">Spread yearly income evenly</span>
                  <span className="mt-0.5 block text-muted-foreground">
                    For a 13th or 14th month salary or a yearly bonus: counts your last 12 months of
                    income ÷ 12, so June and December don't look like windfalls.
                  </span>
                </span>
              </label>
            </GroupedList>
          </section>
        </>
      )}
    </div>
  );
}

function BudgetLineRow({
  line,
  busy,
  onSave,
}: {
  line: BudgetLine;
  busy: boolean;
  onSave: (amount: number, rollover: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(line.budget));
  const over = line.left < 0;
  const used = line.available > 0 ? Math.min(1, line.spent / line.available) : over ? 1 : 0;

  const [invalid, setInvalid] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // A blank or mistyped amount never removes the budget: Remove does that.
    const amount = parseAmount(draft);
    if (amount == null) return setInvalid(true);
    setInvalid(false);
    setEditing(false);
    onSave(amount, line.rollover);
  }

  return (
    <li className="px-4 py-3 text-sm sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
          <CategoryAvatar category={line.category} />
          <span className="truncate">{line.category}</span>
        </span>
        <span className={`font-figure shrink-0 ${over ? "text-negative" : "text-foreground"}`}>
          {over ? `${formatEur(-line.left)} over` : `${formatEur(line.left)} left`}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`${line.category}: spent of budget`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(used * 100)}
      >
        <div
          className={`h-full rounded-full ${over ? "bg-negative" : "bg-primary"}`}
          style={{ width: `${used * 100}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[0.8125rem] text-muted-foreground">
        {editing ? (
          <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={`Budget for ${line.category}`}
              aria-invalid={invalid}
              aria-describedby={invalid ? `budget-error-${line.category}` : undefined}
              inputMode="decimal"
              autoFocus
              className="h-9 w-28"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setInvalid(false);
              }}
            />
            <Button type="submit" size="sm" disabled={busy}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                onSave(0, false);
              }}
            >
              Remove
            </Button>
            {invalid && (
              <span id={`budget-error-${line.category}`} role="alert" className="text-negative">
                Type an amount below 10 million, like 250.
              </span>
            )}
          </form>
        ) : (
          <span>
            <span className="font-figure">{formatEur(line.spent)}</span> of{" "}
            <button
              type="button"
              className="font-figure text-foreground underline decoration-rule underline-offset-4 hover:decoration-foreground"
              aria-label={`Change budget for ${line.category}, now ${formatEur(line.budget)}`}
              onClick={() => {
                setDraft(String(line.budget));
                setEditing(true);
              }}
            >
              {formatEur(line.budget)}
            </button>
            {line.carriedIn !== 0 && (
              <span className="font-figure">
                {" "}
                {line.carriedIn > 0 ? "+" : "−"} {formatEur(Math.abs(line.carriedIn))} rolled over
              </span>
            )}
          </span>
        )}
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-primary)]"
            checked={line.rollover}
            disabled={busy}
            onChange={(e) => onSave(line.budget, e.target.checked)}
          />
          Roll over
        </label>
      </div>
    </li>
  );
}

function AddBudget({
  categories,
  suggestions,
  busy,
  onAdd,
}: {
  categories: ReadonlyArray<string>;
  suggestions: ReadonlyMap<string, number>;
  busy: boolean;
  onAdd: (category: string, amount: number) => void;
}) {
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [invalid, setInvalid] = useState(false);
  if (categories.length === 0) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseAmount(amount);
    if (!category) return;
    if (value == null || value <= 0) return setInvalid(true);
    setInvalid(false);
    onAdd(category, value);
    setCategory("");
    setAmount("");
  }

  return (
    <section className="mt-6">
      <SectionTitle>Add a budget</SectionTitle>
      <GroupedList>
        <form onSubmit={submit} className="flex flex-col gap-2 p-4 sm:flex-row sm:px-5">
          <Select
            aria-label="Category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              const s = suggestions.get(e.target.value);
              if (s && !amount) setAmount(String(s));
            }}
          >
            <option value="">Category…</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input
            aria-label="Monthly budget in euros"
            inputMode="decimal"
            placeholder="€ per month"
            value={amount}
            aria-invalid={invalid}
            onChange={(e) => {
              setAmount(e.target.value);
              setInvalid(false);
            }}
            className="sm:w-40"
          />
          <Button type="submit" disabled={busy || !category || !amount}>
            Add
          </Button>
        </form>
        {invalid && (
          <p role="alert" className="px-4 pb-4 text-sm text-negative sm:px-5">
            Type an amount above 0 and below 10 million, like 250.
          </p>
        )}
      </GroupedList>
    </section>
  );
}
