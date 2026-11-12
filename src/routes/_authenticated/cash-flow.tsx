import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dateLocale } from "@/lib/locale";
import {
  buildFlow,
  firstMonth,
  formatRate,
  incomeBySource,
  periodLabel,
  savedPhrase,
  periodRange,
  periodStart,
  shiftPeriod,
  shortPeriodLabel,
  switchPeriod,
  spendByCategory,
  summarize,
  trend,
  trimLeadingEmpty,
  trendEnd,
  type IncomeTxRow,
  type MonthlyCategoryRow,
  type MonthlyFlowRow,
  type Period,
} from "@/lib/cash-flow";
import { formatEur, monthFromParam, parseTransactionsSearch } from "@/lib/transactions";
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
  // ?month=YYYY-MM: the month to open on (Reports links here with the month it shows).
  validateSearch: (s: Record<string, unknown>): { month?: string } => {
    const { month } = parseTransactionsSearch(s);
    return month ? { month } : {};
  },
  component: CashFlowPage,
});

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

/** Below half a percent the rate shows as 0% (0.5% already rounds to 1%). */
const ZERO_RATE = 0.005 - 1e-9;

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

async function fetchCategorySpend(from: string, to: string): Promise<Array<MonthlyCategoryRow>> {
  const { data, error } = await supabase
    .from("v_spend_by_category_monthly")
    .select("month,category,spend_eur")
    .gte("month", from)
    .lt("month", to);
  if (error) throw error;
  return (data ?? []) as Array<MonthlyCategoryRow>;
}

async function fetchIncomeRows(from: string, to: string): Promise<Array<IncomeTxRow>> {
  // Past the server's row cap the payers fall short of the total; the diagram shows the gap as
  // "Other income", so the figures never disagree.
  const { data, error } = await supabase
    .from("v_transactions_eur")
    .select("payer_name,creditor_name,category,personal_signed_amount_eur")
    .eq("flow_type", "income")
    .gt("personal_signed_amount_eur", 0)
    .gte("booking_date", from)
    .lt("booking_date", to)
    // Biggest first, so a cut-off list keeps the payers that matter.
    .order("personal_signed_amount_eur", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<IncomeTxRow>;
}

function CashFlowPage() {
  const [period, setPeriod] = useState<Period>("month");
  const search = Route.useSearch();
  const [start, setStart] = useState<Date>(() => monthFromParam(search.month));
  const locale = dateLocale();

  const { from, to } = periodRange(start, period);
  const current = periodStart(new Date(), period);

  // One "cash-flow" prefix, so edits and imports refresh the page with one key.
  const monthlyQuery = useQuery({ queryKey: ["cash-flow", "monthly"], queryFn: fetchMonthlyFlow });
  const spendQuery = useQuery({
    queryKey: ["cash-flow", "spend", from, to],
    queryFn: () => fetchCategorySpend(from, to),
  });
  const incomeQuery = useQuery({
    queryKey: ["cash-flow", "income", from, to],
    queryFn: () => fetchIncomeRows(from, to),
  });
  const loadError = [monthlyQuery, spendQuery, incomeQuery].find((q) => q.isError)?.error;

  // A few months and categories: cheap enough to work out on every render.
  const monthly = monthlyQuery.data ?? [];
  const summary = summarize(monthly, from, to);
  const earliest = firstMonth(monthly);
  const canGoPrev = earliest != null && from > earliest;
  const canGoNext = start < current;

  const monthTotals = new Map(
    monthly.filter((r) => r.month).map((r) => [r.month as string, r.expenses_eur ?? 0]),
  );
  const graph = buildFlow({
    income: summary.income,
    spending: summary.spending,
    sources: incomeBySource(incomeQuery.data ?? []),
    categories: spendByCategory(spendQuery.data ?? [], monthTotals),
  });

  const count = TREND_COUNT[period];
  const bars = trimLeadingEmpty(
    trend(monthly, period, trendEnd(start, current, period, count), count),
    from,
  );

  const label = periodLabel(start, period, locale);
  const pending = monthlyQuery.isPending;
  // Without the totals every figure would read as a real €0 month: show dashes instead. A failed
  // refresh keeps what already loaded (the alert still says it failed).
  const failed = (q: { isError: boolean; data?: unknown }) => q.isError && q.data === undefined;
  const noTotals = failed(monthlyQuery);
  const money = (value: number) => (noTotals ? "—" : formatEur(value));
  const flowPending = pending || spendQuery.isPending || incomeQuery.isPending;

  function changePeriod(next: Period) {
    setPeriod(next);
    setStart(switchPeriod(start, period, next, new Date()));
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <h1 className="sr-only">Cash flow for {label}</h1>

      {loadError && <Alert className="mb-6">Some figures didn't load: {loadError.message}</Alert>}

      {/* The title leads, as on every list screen; the period control sits beside it on desktop
          and under it on a phone, sized to its options. */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        <MonthSwitcher
          className="md:flex-1"
          label={label}
          unit={period}
          onPrev={() => setStart(shiftPeriod(start, period, -1))}
          onNext={() => setStart(shiftPeriod(start, period, 1))}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
        />
        <div className="md:w-64 md:shrink-0">
          <SegmentedControl
            label="Period"
            options={PERIODS}
            value={period}
            onChange={changePeriod}
          />
        </div>
      </div>

      <section aria-label={`Saved in ${label}`} className="mb-8">
        <p className="text-[0.9375rem] font-medium text-muted-foreground">
          {summary.net < 0 ? "Spent more than came in" : "Saved"}
          {/* The period still running isn't a full month, quarter or year yet. */}
          {!canGoNext && " so far"}
        </p>
        <div className="mt-1">
          {pending ? (
            <Skeleton className="h-12 w-48" />
          ) : noTotals || summary.months === 0 ? (
            // Nothing recorded is not a net of zero (as on Reports).
            <p className="figure-display text-muted-foreground">—</p>
          ) : (
            <HeadlineFigure value={summary.net} currency="EUR" />
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Excludes transfers.</p>
      </section>

      <GroupedList>
        <ul className="divide-y divide-hairline">
          <SummaryRow label="Income" to="/income" pending={pending} value={money(summary.income)} />
          <SummaryRow
            label="Spending"
            to="/spending"
            pending={pending}
            value={money(summary.spending)}
          />
          <SummaryRow
            label="Savings rate"
            hint={
              pending
                ? undefined
                : noTotals
                  ? "Didn't load"
                  : summary.savingsRate == null
                    ? "No income this period"
                    : summary.savingsRate < 0
                      ? "Taken from savings"
                      : "Share of income kept"
            }
            pending={pending}
            value={formatRate(summary.savingsRate)}
            toneClass={
              summary.savingsRate == null
                ? "text-foreground"
                : // Same dead band as formatRate: a rate shown as 0% is neither gain nor loss.
                  TONE_TEXT[toneOf(summary.savingsRate, ZERO_RATE)]
            }
          />
        </ul>
      </GroupedList>

      <section className="mt-8">
        <SectionTitle>Money in and out</SectionTitle>
        <GroupedList className="px-2 py-4 sm:px-4">
          {flowPending ? (
            <Skeleton className="h-60 w-full" />
          ) : noTotals ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              The totals didn't load.
            </p>
          ) : failed(spendQuery) || failed(incomeQuery) ? (
            // Drawing without the breakdown would lump everything into one "Other" band.
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              The breakdown didn't load.
            </p>
          ) : graph.nodes.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              Nothing came in or went out in {label}.
            </p>
          ) : (
            <FlowSankey
              graph={graph}
              label={`Cash flow for ${label}: ${formatEur(summary.income)} in, ${formatEur(
                summary.spending,
              )} out, ${savedPhrase(summary.net)}.`}
            />
          )}
        </GroupedList>
      </section>

      <section className="mt-8">
        <SectionTitle>Saved per {period}</SectionTitle>
        <GroupedList className="px-2 py-4 sm:px-4">
          {pending ? (
            <Skeleton className="h-40 w-full" />
          ) : noTotals ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              The totals didn't load.
            </p>
          ) : bars.length < 2 ? (
            // One bar compares nothing.
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              Not enough history for a trend yet.
            </p>
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

// A row that opens the page behind its figure, as on Reports.
const ROW_LINK =
  "flex min-h-11 items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-5";

function SummaryRow({
  label,
  hint,
  value,
  pending,
  to,
  toneClass = "text-foreground",
}: {
  label: string;
  hint?: string | undefined;
  value: string;
  pending: boolean;
  to?: "/income" | "/spending";
  toneClass?: string;
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-foreground">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {pending ? (
        <Skeleton className="h-5 w-20" />
      ) : (
        <span className={`font-figure ${toneClass}`}>{value}</span>
      )}
      {to && <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
    </>
  );
  return (
    <li>
      {to ? (
        <Link to={to} className={ROW_LINK}>
          {body}
        </Link>
      ) : (
        <div className="flex min-h-11 items-center gap-3 px-4 py-3 text-sm sm:px-5">{body}</div>
      )}
    </li>
  );
}
