import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dateLocale } from "@/lib/locale";
import {
  buildFlow,
  firstMonth,
  formatRate,
  incomeBySource,
  periodLabel,
  periodRange,
  periodStart,
  shiftPeriod,
  shortPeriodLabel,
  spendByCategory,
  summarize,
  trend,
  trimLeadingEmpty,
  type IncomeTxRow,
  type MonthlyFlowRow,
  type Period,
} from "@/lib/cash-flow";
import type { MonthlySpendRow } from "@/lib/spending";
import { formatEur, formatSignedEur } from "@/lib/transactions";
import { TONE_TEXT, toneOf } from "@/lib/tone";
import { FlowSankey } from "@/components/cash-flow/flow-sankey";
import { TrendBars } from "@/components/cash-flow/trend-bars";
import { HeadlineFigure } from "@/components/headline-figure";
import { MonthSwitcher } from "@/components/month-switcher";
import { SegmentedControl } from "@/components/segmented-control";
import { Alert } from "@/components/ui/alert";
import { GroupedList, SectionTitle } from "@/components/ui/grouped-list";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/cash-flow")({
  head: () => ({
    meta: [
      { title: "Cash flow — Alopex" },
      {
        name: "description",
        content:
          "Where your money came from and went, by month, quarter or year, with your savings rate.",
      },
      { property: "og:title", content: "Cash flow — Alopex" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CashFlowPage,
});

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

/** Bars in the trend: a year of months, two years of quarters, five years. */
const TREND_COUNT: Record<Period, number> = { month: 12, quarter: 8, year: 5 };

async function fetchMonthlyFlow(): Promise<Array<MonthlyFlowRow>> {
  // One row per month with any activity, so the whole history is small.
  const { data, error } = await supabase
    .from("v_income_vs_expenses_monthly")
    .select("month,income_eur,expenses_eur")
    .order("month", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<MonthlyFlowRow>;
}

async function fetchCategorySpend(
  from: string,
  to: string,
): Promise<Array<MonthlySpendRow & { month: string | null }>> {
  const { data, error } = await supabase
    .from("v_spend_by_category_monthly")
    .select("month,category,spend_eur")
    .gte("month", from)
    .lt("month", to);
  if (error) throw error;
  return (data ?? []) as Array<MonthlySpendRow & { month: string | null }>;
}

async function fetchIncomeRows(from: string, to: string): Promise<Array<IncomeTxRow>> {
  // Past the server's row cap the payers fall short of the total; the diagram shows the gap as
  // "Other income", so the figures never disagree.
  const { data, error } = await supabase
    .from("v_transactions_eur")
    .select("creditor_name,category,personal_signed_amount_eur")
    .eq("flow_type", "income")
    .gt("personal_signed_amount_eur", 0)
    .gte("booking_date", from)
    .lt("booking_date", to);
  if (error) throw error;
  return (data ?? []) as Array<IncomeTxRow>;
}

function CashFlowPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [start, setStart] = useState<Date>(() => periodStart(new Date(), "month"));
  const locale = dateLocale();

  const { from, to } = periodRange(start, period);
  const current = periodStart(new Date(), period);

  const monthlyQuery = useQuery({ queryKey: ["cash-flow-monthly"], queryFn: fetchMonthlyFlow });
  const spendQuery = useQuery({
    queryKey: ["cash-flow-spend", from, to],
    queryFn: () => fetchCategorySpend(from, to),
  });
  const incomeQuery = useQuery({
    queryKey: ["cash-flow-income", from, to],
    queryFn: () => fetchIncomeRows(from, to),
  });
  const loadError = [monthlyQuery, spendQuery, incomeQuery].find((q) => q.isError)?.error;

  const monthly = useMemo(() => monthlyQuery.data ?? [], [monthlyQuery.data]);
  const summary = useMemo(() => summarize(monthly, from, to), [monthly, from, to]);
  const earliest = firstMonth(monthly);
  const canGoPrev = earliest != null && from > earliest;
  const canGoNext = start < current;

  const graph = useMemo(() => {
    const monthTotals = new Map(
      monthly.filter((r) => r.month).map((r) => [r.month as string, r.expenses_eur ?? 0]),
    );
    return buildFlow({
      income: summary.income,
      spending: summary.spending,
      sources: incomeBySource(incomeQuery.data ?? []),
      categories: spendByCategory(spendQuery.data ?? [], monthTotals),
    });
  }, [monthly, summary, incomeQuery.data, spendQuery.data]);

  const bars = useMemo(
    () => trimLeadingEmpty(trend(monthly, period, current, TREND_COUNT[period])),
    [monthly, period, current.getTime()], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const label = periodLabel(start, period, locale);
  const pending = monthlyQuery.isPending;
  const flowPending = pending || spendQuery.isPending || incomeQuery.isPending;

  function changePeriod(next: Period) {
    setPeriod(next);
    // Keep the moment you were looking at: March in Month view becomes Q1, then that year.
    setStart(periodStart(start, next));
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <h1 className="sr-only">Cash flow for {label}</h1>

      {loadError && <Alert className="mb-6">Some figures didn't load: {loadError.message}</Alert>}

      <div className="mb-4">
        <SegmentedControl label="Period" options={PERIODS} value={period} onChange={changePeriod} />
      </div>

      <MonthSwitcher
        className="mb-6"
        label={label}
        unit={period}
        onPrev={() => setStart(shiftPeriod(start, period, -1))}
        onNext={() => setStart(shiftPeriod(start, period, 1))}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
      />

      <section aria-label={`Saved in ${label}`} className="mb-8">
        <p className="text-[0.9375rem] font-medium text-muted-foreground">
          {summary.net < 0 ? "Spent more than came in" : "Saved"}
        </p>
        <div className="mt-1">
          {pending ? (
            <Skeleton className="h-12 w-48" />
          ) : (
            <HeadlineFigure value={summary.net} currency="EUR" />
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Excludes transfers between your accounts.
        </p>
      </section>

      <GroupedList>
        <ul className="divide-y divide-hairline">
          <SummaryRow label="Income" pending={pending} value={formatEur(summary.income)} />
          <SummaryRow label="Spending" pending={pending} value={formatEur(summary.spending)} />
          <SummaryRow
            label="Savings rate"
            hint={summary.savingsRate == null ? "No income this period" : "Share of income kept"}
            pending={pending}
            value={formatRate(summary.savingsRate)}
            toneClass={
              summary.savingsRate == null
                ? "text-foreground"
                : TONE_TEXT[toneOf(summary.savingsRate)]
            }
          />
        </ul>
      </GroupedList>

      <section className="mt-8">
        <SectionTitle>Where it went</SectionTitle>
        <GroupedList className="px-2 py-4 sm:px-4">
          {flowPending ? (
            <Skeleton className="h-60 w-full" />
          ) : graph.nodes.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              Nothing came in or went out in {label}.
            </p>
          ) : (
            <FlowSankey
              graph={graph}
              label={`Cash flow for ${label}: ${formatEur(summary.income)} in, ${formatEur(
                summary.spending,
              )} out, ${formatSignedEur(summary.net)} saved.`}
            />
          )}
        </GroupedList>
      </section>

      <section className="mt-8">
        <SectionTitle>Saved per {period}</SectionTitle>
        <GroupedList className="px-2 py-4 sm:px-4">
          {pending ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <TrendBars
              bars={bars}
              selected={from}
              label={`Saved per ${period}, last ${bars.length}`}
              tickLabel={(b) => shortPeriodLabel(b.start, period, locale)}
              onSelect={(b) => setStart(b.start)}
            />
          )}
        </GroupedList>
      </section>
    </div>
  );
}

function SummaryRow({
  label,
  hint,
  value,
  pending,
  toneClass = "text-foreground",
}: {
  label: string;
  hint?: string;
  value: string;
  pending: boolean;
  toneClass?: string;
}) {
  return (
    <li className="flex min-h-11 items-center gap-3 px-4 py-3 text-sm sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-foreground">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {pending ? (
        <Skeleton className="h-5 w-20" />
      ) : (
        <span className={`font-figure ${toneClass}`}>{value}</span>
      )}
    </li>
  );
}
