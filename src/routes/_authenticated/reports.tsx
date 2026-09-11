import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  ThumbsDown,
} from "lucide-react";
import { getSupabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Monthly Report — Finance Dashboard" },
      {
        name: "description",
        content: "Net worth change, income vs expenses, and spending for the month.",
      },
      { property: "og:title", content: "Monthly Report — Finance Dashboard" },
      {
        property: "og:description",
        content: "Net worth change, income vs expenses, and spending for the month.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function formatISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatEur(value: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatEur(value)}`;
}

interface NetWorthDailyRow {
  snapshot_date: string;
  total_eur: number | null;
  bank_total_eur: number | null;
  portfolio_total_eur: number | null;
  crypto_total_eur: number | null;
}

// Latest snapshot at or before the given date -- used for both the
// end-of-month figure and, applied to the day before the month started,
// the start-of-month baseline. No new view needed: v_net_worth_daily
// already has one row per day per user.
async function fetchNetWorthBoundary(onOrBefore: string): Promise<NetWorthDailyRow | null> {
  const { data, error } = await getSupabase()
    .from("v_net_worth_daily")
    .select("snapshot_date,total_eur,bank_total_eur,portfolio_total_eur,crypto_total_eur")
    .lte("snapshot_date", onOrBefore)
    .order("snapshot_date", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as NetWorthDailyRow | undefined) ?? null;
}

interface IncomeExpenseRow {
  income_eur: number | null;
  expenses_eur: number | null;
}

async function fetchIncomeExpenses(monthISO: string): Promise<IncomeExpenseRow | null> {
  const { data, error } = await getSupabase()
    .from("v_income_vs_expenses_monthly")
    .select("income_eur,expenses_eur")
    .eq("month", monthISO)
    .maybeSingle();
  if (error) throw error;
  return data as IncomeExpenseRow | null;
}

interface SpendRow {
  category: string | null;
  spend_eur: number | null;
}

async function fetchSpendByCategory(monthISO: string): Promise<Array<SpendRow>> {
  const { data, error } = await getSupabase()
    .from("v_spend_by_category_monthly")
    .select("category,spend_eur")
    .eq("month", monthISO);
  if (error) throw error;
  return (data ?? []) as Array<SpendRow>;
}

interface SubscriptionTotalRow {
  monthly_equivalent_eur: number | null;
}

// Current subscriptions, not historized -- v_subscriptions reflects today's
// state regardless of which month is selected. Labeled "current" in the UI
// rather than implied to be that month's actual figure.
async function fetchSubscriptionsTotal(): Promise<number> {
  const { data, error } = await getSupabase()
    .from("v_subscriptions")
    .select("monthly_equivalent_eur");
  if (error) throw error;
  // monthly_equivalent_eur is signed (debits negative), same convention as
  // signed_amount_eur elsewhere -- but this is displayed as a cost total,
  // so take the magnitude.
  return ((data ?? []) as Array<SubscriptionTotalRow>).reduce(
    (sum, r) => sum + Math.abs(r.monthly_equivalent_eur ?? 0),
    0,
  );
}

interface WorthItTxRow {
  amount: number;
  worth_it: "yes" | "no" | null;
}

interface WorthItSummary {
  yes: number;
  no: number;
  notWorthItTotal: number;
}

async function fetchWorthItForMonth(
  startISO: string,
  endExclusiveISO: string,
): Promise<WorthItSummary> {
  const { data, error } = await getSupabase()
    .from("transactions")
    .select("amount,worth_it")
    .not("worth_it", "is", null)
    .gte("booking_date", startISO)
    .lt("booking_date", endExclusiveISO);
  if (error) throw error;
  const rows = (data ?? []) as Array<WorthItTxRow>;
  return {
    yes: rows.filter((r) => r.worth_it === "yes").length,
    no: rows.filter((r) => r.worth_it === "no").length,
    notWorthItTotal: rows
      .filter((r) => r.worth_it === "no")
      .reduce((sum, r) => sum + r.amount, 0),
  };
}

export function ReportsPage() {
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));

  const monthISO = formatISODate(startOfMonth(month));
  const prevMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const prevMonthISO = formatISODate(startOfMonth(prevMonth));
  const nextMonthStartISO = formatISODate(
    new Date(month.getFullYear(), month.getMonth() + 1, 1),
  );
  const dayBeforeMonthISO = formatISODate(
    new Date(month.getFullYear(), month.getMonth(), 0),
  );
  const endOfMonthISO = formatISODate(endOfMonth(month));

  const endBoundaryQuery = useQuery({
    queryKey: ["reports-net-worth-boundary", endOfMonthISO],
    queryFn: () => fetchNetWorthBoundary(endOfMonthISO),
  });
  const startBoundaryQuery = useQuery({
    queryKey: ["reports-net-worth-boundary", dayBeforeMonthISO],
    queryFn: () => fetchNetWorthBoundary(dayBeforeMonthISO),
  });
  const incomeExpensesQuery = useQuery({
    queryKey: ["reports-income-expenses", monthISO],
    queryFn: () => fetchIncomeExpenses(monthISO),
  });
  const spendQuery = useQuery({
    queryKey: ["reports-spend", monthISO],
    queryFn: () => fetchSpendByCategory(monthISO),
  });
  const prevSpendQuery = useQuery({
    queryKey: ["reports-spend", prevMonthISO],
    queryFn: () => fetchSpendByCategory(prevMonthISO),
  });
  const subscriptionsQuery = useQuery({
    queryKey: ["reports-subscriptions-total"],
    queryFn: fetchSubscriptionsTotal,
  });
  const worthItQuery = useQuery({
    queryKey: ["reports-worth-it", monthISO],
    queryFn: () => fetchWorthItForMonth(monthISO, nextMonthStartISO),
  });

  const netWorthDelta = useMemo(() => {
    const end = endBoundaryQuery.data;
    const start = startBoundaryQuery.data;
    if (!end) return null;
    if (!start) return { end, start: null, delta: null };
    return {
      end,
      start,
      delta: {
        total: (end.total_eur ?? 0) - (start.total_eur ?? 0),
        bank: (end.bank_total_eur ?? 0) - (start.bank_total_eur ?? 0),
        portfolio: (end.portfolio_total_eur ?? 0) - (start.portfolio_total_eur ?? 0),
        crypto: (end.crypto_total_eur ?? 0) - (start.crypto_total_eur ?? 0),
      },
    };
  }, [endBoundaryQuery.data, startBoundaryQuery.data]);

  const topCategories = useMemo(
    () =>
      (spendQuery.data ?? [])
        .filter((r) => r.spend_eur != null && r.spend_eur > 0)
        .map((r) => ({ category: r.category ?? "Uncategorized", spend_eur: r.spend_eur as number }))
        .sort((a, b) => b.spend_eur - a.spend_eur)
        .slice(0, 5),
    [spendQuery.data],
  );

  const biggestMover = useMemo(() => {
    if (!prevSpendQuery.data) return null;
    const prevByCategory = new Map<string, number>();
    for (const r of prevSpendQuery.data) {
      prevByCategory.set(r.category ?? "Uncategorized", r.spend_eur ?? 0);
    }
    let mover: { category: string; delta: number } | null = null;
    for (const r of spendQuery.data ?? []) {
      const category = r.category ?? "Uncategorized";
      const delta = (r.spend_eur ?? 0) - (prevByCategory.get(category) ?? 0);
      if (delta > 0 && (!mover || delta > mover.delta)) {
        mover = { category, delta };
      }
    }
    return mover;
  }, [spendQuery.data, prevSpendQuery.data]);

  const monthLabel = month.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const canGoNext =
    startOfMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)) <= startOfMonth(new Date());

  const income = incomeExpensesQuery.data?.income_eur ?? 0;
  const expenses = incomeExpensesQuery.data?.expenses_eur ?? 0;
  const net = income - expenses;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Monthly Report</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Net worth, income vs expenses, and spending — one month at a time.
        </p>
      </header>

      <div className="mb-6 flex items-center justify-between rounded-xl border bg-card p-2 card-ring">
        <button
          type="button"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          aria-label="Previous month"
          className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="text-sm font-medium text-foreground">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          disabled={!canGoNext}
          aria-label="Next month"
          className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <HeadlineCard
          icon={
            netWorthDelta?.delta && netWorthDelta.delta.total < 0 ? (
              <TrendingDown className="size-4" />
            ) : (
              <TrendingUp className="size-4" />
            )
          }
          label="Net worth"
          sublabel={netWorthDelta?.delta ? "change this month" : undefined}
          pending={endBoundaryQuery.isPending || startBoundaryQuery.isPending}
          value={
            netWorthDelta?.delta
              ? formatSigned(netWorthDelta.delta.total)
              : netWorthDelta?.end
                ? formatEur(netWorthDelta.end.total_eur ?? 0)
                : "—"
          }
          tone={!netWorthDelta?.delta || netWorthDelta.delta.total >= 0 ? "positive" : "negative"}
        />
        <HeadlineCard
          icon={<ArrowLeftRight className="size-4" />}
          label="Income vs expenses"
          sublabel="net"
          pending={incomeExpensesQuery.isPending}
          value={formatSigned(net)}
          tone={net >= 0 ? "positive" : "negative"}
        />
        <HeadlineCard
          icon={<ThumbsDown className="size-4" />}
          label="Not worth it"
          sublabel={
            worthItQuery.data ? `${worthItQuery.data.no} of ${worthItQuery.data.yes + worthItQuery.data.no}` : undefined
          }
          pending={worthItQuery.isPending}
          value={formatEur(worthItQuery.data?.notWorthItTotal ?? 0)}
          tone="negative"
        />
      </div>

      {netWorthDelta?.delta && (
        <section className="mt-6 overflow-hidden rounded-2xl border bg-card card-ring">
          <div className="border-b px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-foreground">Net worth by source</h2>
          </div>
          <ul className="divide-y">
            <li className="flex items-center justify-between px-4 py-3 text-sm sm:px-5">
              <span className="text-foreground">Bank accounts</span>
              <span className="font-figure text-foreground">{formatSigned(netWorthDelta.delta.bank)}</span>
            </li>
            <li className="flex items-center justify-between px-4 py-3 text-sm sm:px-5">
              <span className="text-foreground">Portfolio</span>
              <span className="font-figure text-foreground">{formatSigned(netWorthDelta.delta.portfolio)}</span>
            </li>
            <li className="flex items-center justify-between px-4 py-3 text-sm sm:px-5">
              <span className="text-foreground">Crypto</span>
              <span className="font-figure text-foreground">{formatSigned(netWorthDelta.delta.crypto)}</span>
            </li>
          </ul>
        </section>
      )}

      <section className="mt-6 overflow-hidden rounded-2xl border bg-card card-ring">
        <div className="border-b px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-foreground">Top spending categories</h2>
          {biggestMover && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Biggest jump: {biggestMover.category} (+{formatEur(biggestMover.delta)} vs last month)
            </p>
          )}
        </div>
        {topCategories.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground sm:px-5">
            No spending recorded for {monthLabel}.
          </div>
        ) : (
          <ul className="divide-y">
            {topCategories.map((row) => (
              <li key={row.category} className="flex items-center justify-between px-4 py-3 text-sm sm:px-5">
                <span className="font-medium text-foreground">{row.category}</span>
                <span className="font-figure text-foreground">{formatEur(row.spend_eur)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border bg-card card-ring">
        <div className="flex items-center justify-between px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Subscriptions</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Current monthly-equivalent total, not historical</p>
          </div>
          <span className="font-figure text-sm font-semibold text-foreground">
            {subscriptionsQuery.isPending ? "…" : formatEur(subscriptionsQuery.data ?? 0)}
          </span>
        </div>
      </section>
    </div>
  );
}

function HeadlineCard({
  icon,
  label,
  sublabel,
  value,
  pending,
  tone,
}: {
  icon: ReactNode;
  label: string;
  sublabel: string | undefined;
  value: string;
  pending: boolean;
  tone: "positive" | "negative";
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 card-ring">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
        {sublabel && <span className="ml-1 text-xs">· {sublabel}</span>}
      </div>
      <div className="mt-2 min-h-9">
        {pending ? (
          <div className="h-8 w-28 animate-pulse rounded-lg bg-muted" />
        ) : (
          <p
            className={`font-figure text-2xl font-semibold tracking-tight sm:text-3xl ${
              tone === "positive" ? "text-positive" : "text-negative"
            }`}
          >
            {value}
          </p>
        )}
      </div>
    </section>
  );
}
