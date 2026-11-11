import { dateLocale } from "@/lib/locale";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { TrendingUp, TrendingDown, ArrowLeftRight, ThumbsDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatISODate } from "@/lib/date";
import { estimatedMonthlyEur, splitSubscriptions } from "@/lib/subscriptions";
import { formatEur, formatSignedEur, personalAmountEur, startOfMonth } from "@/lib/transactions";
import { fetchIncomeExpenses, incomeExpensesKey, netAfterSpending } from "@/lib/income-expenses";
import { CategoryRow } from "@/components/spending/category-row";
import {
  biggestMover,
  categorySpend,
  ratedLabel,
  sharePercent,
  type MonthlySpendRow,
} from "@/lib/spending";
import { monthNetWorth, withHistory } from "@/lib/net-worth";
import { fetchHistory, fetchNetWorth, fetchReconstructed } from "@/lib/net-worth-queries";
import { TONE_TEXT, toneOf, type Tone } from "@/lib/tone";
import { MonthSwitcher } from "@/components/month-switcher";
import { Alert } from "@/components/ui/alert";
import { GroupedList, SectionTitle } from "@/components/ui/grouped-list";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Alopex" },
      {
        name: "description",
        content: "Net worth change, income vs expenses, and spending for the month.",
      },
      { property: "og:title", content: "Reports — Alopex" },
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

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

async function fetchSpendByCategory(monthISO: string): Promise<Array<MonthlySpendRow>> {
  const { data, error } = await supabase
    .from("v_spend_by_category_monthly")
    .select("category,spend_eur")
    .eq("month", monthISO);
  if (error) throw error;
  return (data ?? []) as Array<MonthlySpendRow>;
}

interface SubscriptionTotalRow {
  monthly_equivalent_eur: number | null;
  charge_count: number | null;
  billing_frequency_is_manual: boolean | null;
  billing_frequency: string | null;
  last_charged: string | null;
  custom_interval_value: number | null;
  custom_interval_unit: string | null;
}

// Current subscriptions, not historized -- v_subscriptions reflects today's
// state regardless of which month is selected. Labeled "current" in the UI
// rather than implied to be that month's actual figure.
async function fetchSubscriptionsTotal(): Promise<number> {
  const { data, error } = await supabase
    .from("v_subscriptions")
    .select(
      "monthly_equivalent_eur,charge_count,billing_frequency_is_manual,billing_frequency,last_charged,custom_interval_value,custom_interval_unit",
    );
  if (error) throw error;
  // Same recurring-only total as the Subscriptions page; one-off charges are not a monthly cost.
  return estimatedMonthlyEur(
    splitSubscriptions((data ?? []) as Array<SubscriptionTotalRow>).recurring,
  );
}

interface WorthItTxRow {
  personal_signed_amount_eur: number | null;
  signed_amount_eur: number | null;
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
  const { data, error } = await supabase
    .from("v_transactions_eur")
    .select("personal_signed_amount_eur,signed_amount_eur,worth_it")
    .not("worth_it", "is", null)
    .eq("flow_type", "spend") // a refunded charge was money back, not a regret
    .gte("booking_date", startISO)
    .lt("booking_date", endExclusiveISO);
  if (error) throw error;
  const rows = (data ?? []) as Array<WorthItTxRow>;
  return {
    yes: rows.filter((r) => r.worth_it === "yes").length,
    no: rows.filter((r) => r.worth_it === "no").length,
    notWorthItTotal: rows
      .filter((r) => r.worth_it === "no")
      .reduce((sum, r) => sum + personalAmountEur(r), 0),
  };
}

function ReportsPage() {
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));

  const monthISO = formatISODate(startOfMonth(month));
  const prevMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const prevMonthISO = formatISODate(startOfMonth(prevMonth));
  const nextMonthStartISO = formatISODate(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const dayBeforeMonthISO = formatISODate(new Date(month.getFullYear(), month.getMonth(), 0));
  const endOfMonthISO = formatISODate(endOfMonth(month));

  // Same sources and keys as the Net Worth page: imported months, rebuilt months, live days.
  const liveQuery = useQuery({ queryKey: ["net-worth-daily"], queryFn: fetchNetWorth });
  const historyQuery = useQuery({ queryKey: ["net-worth-history"], queryFn: fetchHistory });
  const rebuiltQuery = useQuery({
    queryKey: ["net-worth-reconstructed"],
    queryFn: fetchReconstructed,
  });
  const netWorthRows = useMemo(
    () => withHistory(historyQuery.data ?? [], liveQuery.data ?? [], undefined, rebuiltQuery.data),
    [historyQuery.data, liveQuery.data, rebuiltQuery.data],
  );
  const incomeExpensesQuery = useQuery({
    queryKey: incomeExpensesKey(monthISO),
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

  // A failed query leaves its figure at zero, which reads like real data; say so instead.
  const loadError = [
    liveQuery,
    historyQuery,
    rebuiltQuery,
    incomeExpensesQuery,
    spendQuery,
    prevSpendQuery,
    subscriptionsQuery,
    worthItQuery,
  ].find((q) => q.isError)?.error;

  const netWorthDelta = useMemo(
    () => monthNetWorth(netWorthRows, dayBeforeMonthISO, endOfMonthISO),
    [netWorthRows, endOfMonthISO, dayBeforeMonthISO],
  );

  const topCategories = useMemo(
    () => categorySpend(spendQuery.data ?? []).slice(0, 5),
    [spendQuery.data],
  );

  const biggestMoverRow = useMemo(
    () => (prevSpendQuery.data ? biggestMover(spendQuery.data ?? [], prevSpendQuery.data) : null),
    [spendQuery.data, prevSpendQuery.data],
  );

  const monthLabel = month.toLocaleDateString(dateLocale(), { month: "long", year: "numeric" });
  const canGoNext =
    startOfMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)) <=
    startOfMonth(new Date());

  const net = netAfterSpending(incomeExpensesQuery.data);
  const spendTotal = categorySpend(spendQuery.data ?? []).reduce((s, r) => s + r.spend_eur, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      {/* One header, as on Spending: the month and its arrows name the page */}
      <h1 className="sr-only">Report for {monthLabel}</h1>

      {loadError && <Alert className="mb-6">Some figures didn't load: {loadError.message}</Alert>}

      <MonthSwitcher
        className="mb-6"
        label={monthLabel}
        onPrev={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        onNext={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        canGoNext={canGoNext}
      />

      <GroupedList>
        <ul className="divide-y divide-hairline">
          <HeadlineCard
            icon={
              netWorthDelta?.delta && netWorthDelta.delta.total < 0 ? (
                <TrendingDown className="size-4" />
              ) : (
                <TrendingUp className="size-4" />
              )
            }
            label="Net worth"
            to="/"
            sublabel={netWorthDelta?.delta ? "change this month" : undefined}
            pending={liveQuery.isPending || historyQuery.isPending || rebuiltQuery.isPending}
            value={
              netWorthDelta?.delta
                ? formatSignedEur(netWorthDelta.delta.total)
                : netWorthDelta?.end
                  ? formatEur(netWorthDelta.end.total_eur ?? 0)
                  : "—"
            }
            tone={netWorthDelta?.delta ? toneOf(netWorthDelta.delta.total) : "neutral"}
          />
          <HeadlineCard
            icon={<ArrowLeftRight className="size-4" />}
            label="Income minus spending"
            sublabel={undefined}
            to="/cash-flow"
            pending={incomeExpensesQuery.isPending}
            // No row: nothing was recorded that month (or only imported totals), not a net of zero.
            value={net == null ? "—" : formatSignedEur(net)}
            tone={net == null ? "neutral" : toneOf(net)}
          />
          <HeadlineCard
            icon={<ThumbsDown className="size-4" />}
            label="Not worth it"
            sublabel={worthItQuery.data ? ratedLabel(worthItQuery.data) : undefined}
            to="/spending"
            pending={worthItQuery.isPending}
            value={formatEur(worthItQuery.data?.notWorthItTotal ?? 0)}
            tone="neutral"
          />
        </ul>
      </GroupedList>

      {netWorthDelta?.delta && (
        <section className="mt-6">
          <SectionTitle>Net worth by source</SectionTitle>
          <GroupedList>
            <ul className="divide-y divide-hairline">
              <SourceRow label="Bank accounts" to="/accounts" value={netWorthDelta.delta.bank} />
              <SourceRow label="Portfolio" to="/portfolio" value={netWorthDelta.delta.portfolio} />
              <SourceRow label="Crypto" to="/crypto" value={netWorthDelta.delta.crypto} />
              {netWorthDelta.delta.debts !== 0 && (
                <SourceRow label="Debts" to="/accounts" value={netWorthDelta.delta.debts} />
              )}
            </ul>
          </GroupedList>
        </section>
      )}

      <section className="mt-6">
        <SectionTitle>Top spending categories</SectionTitle>
        {biggestMoverRow && (
          <p className="px-4 pb-1.5 text-xs text-muted-foreground">
            Biggest jump: {biggestMoverRow.category} (+{formatEur(biggestMoverRow.delta)} vs last
            month)
          </p>
        )}
        <GroupedList>
          {topCategories.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground sm:px-5">
              No spending recorded for {monthLabel}.
            </div>
          ) : (
            <ul className="divide-y divide-hairline">
              {topCategories.map((row) => (
                <CategoryRow
                  key={row.category}
                  category={row.category}
                  total={row.spend_eur}
                  share={sharePercent(row.spend_eur, spendTotal)}
                  month={month}
                />
              ))}
            </ul>
          )}
        </GroupedList>
      </section>

      <section className="mt-6">
        <GroupedList>
          <Link to="/subscriptions" className={ROW_LINK}>
            <div className="min-w-0 flex-1">
              <h2 className="text-[0.9375rem] font-medium text-foreground">Subscriptions</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Current, per month</p>
            </div>
            <span className="font-figure text-sm text-foreground">
              {subscriptionsQuery.isPending ? "…" : formatEur(subscriptionsQuery.data ?? 0)}
            </span>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </GroupedList>
      </section>
    </div>
  );
}

// A row that opens the page behind its figure (Spending's CategoryRow look).
const ROW_LINK =
  "flex min-h-11 items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-5";

function SourceRow({ label, to, value }: { label: string; to: string; value: number }) {
  return (
    <li>
      <Link to={to} className={ROW_LINK}>
        <span className="flex-1 text-foreground">{label}</span>
        <span className="font-figure text-foreground">{formatSignedEur(value)}</span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

function HeadlineCard({
  icon,
  label,
  sublabel,
  value,
  pending,
  tone,
  to,
}: {
  icon: ReactNode;
  label: string;
  sublabel: string | undefined;
  value: string;
  pending: boolean;
  tone: Tone;
  to: string;
}) {
  return (
    <li>
      <Link to={to} className={`${ROW_LINK} min-h-16`}>
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-medium text-foreground">{label}</p>
          {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
        </div>
        {pending ? (
          <Skeleton className="h-6 w-24" />
        ) : (
          <p
            className={`font-figure text-lg tracking-[-0.02em] ${
              tone === "neutral" ? "text-foreground" : TONE_TEXT[tone]
            }`}
          >
            {value}
          </p>
        )}
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}
