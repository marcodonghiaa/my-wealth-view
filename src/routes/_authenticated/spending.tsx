import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CategoryRow } from "@/components/spending/category-row";
import { supabase } from "@/integrations/supabase/client";
import { formatISODate } from "@/lib/date";
import { categoryColor } from "@/lib/categories";
import { shareSummary } from "@/lib/chart-summary";
import { categorySpend, sharePercent, spendChange, type MonthlySpendRow } from "@/lib/spending";
import { TONE_TEXT, type Tone } from "@/lib/tone";
import { formatEur, personalAmountEur, startOfMonth } from "@/lib/transactions";
import { MonthSwitcher } from "@/components/month-switcher";
import { HeadlineFigure } from "@/components/headline-figure";
import { Stripes } from "@/components/share-bar";
import { EmptyState } from "@/components/empty-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { GroupedList, SectionTitle } from "@/components/ui/grouped-list";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/spending")({
  head: () => ({
    meta: [
      { title: "Spend by Category — Alopex" },
      {
        name: "description",
        content: "See how much you spent per category, month by month.",
      },
      { property: "og:title", content: "Spend by Category — Alopex" },
      {
        property: "og:description",
        content: "See how much you spent per category, month by month.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SpendingPage,
});

interface RegretRow {
  category: string | null;
  personal_signed_amount_eur: number | null;
  signed_amount_eur: number | null;
}

interface RegretGroup {
  category: string;
  total: number;
  count: number;
}

async function fetchSpendForMonth(month: Date): Promise<Array<MonthlySpendRow>> {
  const { data, error } = await supabase
    .from("v_spend_by_category_monthly")
    .select("month,category,spend_eur")
    .eq("month", formatISODate(startOfMonth(month)));
  if (error) throw error;
  return (data ?? []) as Array<MonthlySpendRow>;
}

// Scoped to the selected month, like the rest of the page.
async function fetchRegretSpend(month: Date): Promise<Array<RegretGroup>> {
  const start = formatISODate(startOfMonth(month));
  const end = formatISODate(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const { data, error } = await supabase
    .from("v_transactions_eur")
    .select("category,personal_signed_amount_eur,signed_amount_eur")
    .eq("worth_it", "no")
    .eq("flow_type", "spend") // a refunded charge was money back, not a regret
    .gte("booking_date", start)
    .lt("booking_date", end);
  if (error) throw error;
  const byCategory = new Map<string, RegretGroup>();
  for (const row of (data ?? []) as Array<RegretRow>) {
    const category = row.category ?? "Uncategorized";
    const amount = personalAmountEur(row);
    const existing = byCategory.get(category);
    if (existing) {
      existing.total += amount;
      existing.count += 1;
    } else {
      byCategory.set(category, { category, total: amount, count: 1 });
    }
  }
  return Array.from(byCategory.values()).sort((a, b) => b.total - a.total);
}

function SpendingPage() {
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));

  const spendQuery = useQuery({
    queryKey: ["spend-by-category", formatISODate(month)],
    queryFn: () => fetchSpendForMonth(month),
  });

  // Last month, for "is that normal?": same view and cache key as when you step back to it.
  const prevMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const prevSpendQuery = useQuery({
    queryKey: ["spend-by-category", formatISODate(prevMonth)],
    queryFn: () => fetchSpendForMonth(prevMonth),
  });

  const regretQuery = useQuery({
    queryKey: ["worth-it-regret", formatISODate(month)],
    queryFn: () => fetchRegretSpend(month),
  });
  const regretRows = regretQuery.data ?? [];
  const regretTotal = regretRows.reduce((sum, r) => sum + r.total, 0);
  const regretCount = regretRows.reduce((sum, r) => sum + r.count, 0);

  const rows = useMemo(() => categorySpend(spendQuery.data ?? []), [spendQuery.data]);
  const total = rows.reduce((sum, r) => sum + r.spend_eur, 0);
  const prevTotal = categorySpend(prevSpendQuery.data ?? []).reduce((s, r) => s + r.spend_eur, 0);
  const change = prevSpendQuery.data ? spendChange(total, prevTotal) : null;

  const monthLabel = month.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const prevMonthName = prevMonth.toLocaleDateString("en-GB", { month: "long" });
  const goToPrevMonth = () => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));

  const canGoNext =
    startOfMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)) <=
    startOfMonth(new Date());

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      {/* One header: the month and its arrows; the figure below is the page's answer */}
      <h1 className="sr-only">Spending by category</h1>

      {spendQuery.isError && (
        <Alert className="mb-6">Couldn't load spending data: {spendQuery.error.message}</Alert>
      )}

      {regretQuery.isError && (
        <Alert className="mb-6">
          Couldn't load your "worth it?" answers: {regretQuery.error.message}
        </Alert>
      )}

      <MonthSwitcher
        className="mb-6"
        label={monthLabel}
        onPrev={goToPrevMonth}
        onNext={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        canGoNext={canGoNext}
      />

      {spendQuery.isPending ? (
        <Skeleton className="h-80" />
      ) : rows.length === 0 ? (
        <EmptyState
          title={`No spending recorded for ${monthLabel}.`}
          action={
            <Button variant="quiet" onClick={goToPrevMonth} className="bg-muted">
              Previous month
            </Button>
          }
        />
      ) : (
        <>
          {/* Headline: the month's spend, then how it splits by category */}
          <section aria-label={`Spent in ${monthLabel}`} className="mb-8">
            <p className="text-[0.9375rem] font-medium text-muted-foreground">Spent</p>
            <div className="mt-1">
              <HeadlineFigure value={total} currency="EUR" />
            </div>
            {change && (
              <SpendChangeLine delta={change.delta} tone={change.tone} versus={prevMonthName} />
            )}
            {/* The stripes show the split at a glance; each row below names its own share */}
            <div className="mt-5 max-w-2xl">
              <Stripes
                label={shareSummary(
                  "Spend by category",
                  rows.map((r) => ({ label: r.category, value: r.spend_eur })),
                )}
                shares={rows.map((r) => ({
                  label: r.category,
                  value: r.spend_eur,
                  color: categoryColor(r.category),
                }))}
              />
            </div>
          </section>

          {/* Breakdown list */}
          <GroupedList>
            <ul className="divide-y divide-hairline">
              {rows.map((row) => (
                <CategoryRow
                  key={row.category}
                  category={row.category}
                  total={row.spend_eur}
                  share={sharePercent(row.spend_eur, total)}
                  month={month}
                />
              ))}
            </ul>
          </GroupedList>
        </>
      )}

      {regretCount > 0 && (
        <section className="mt-6">
          <SectionTitle>
            Not worth it — {formatEur(regretTotal)} across {regretCount} purchase
            {regretCount === 1 ? "" : "s"}
          </SectionTitle>
          <GroupedList>
            <ul className="divide-y divide-hairline">
              {regretRows.map((row) => (
                <li
                  key={row.category}
                  className="flex items-center justify-between px-4 py-3 text-sm sm:px-5"
                >
                  <span className="font-medium text-foreground">
                    {row.category}{" "}
                    <span className="text-xs text-muted-foreground">({row.count})</span>
                  </span>
                  <span className="font-figure text-foreground">{formatEur(row.total)}</span>
                </li>
              ))}
            </ul>
          </GroupedList>
        </section>
      )}
    </div>
  );
}

// "Is that normal?": one plain line against the previous month, coloured by meaning (less is good).
function SpendChangeLine({ delta, tone, versus }: { delta: number; tone: Tone; versus: string }) {
  return (
    <p className={`mt-1.5 text-sm ${TONE_TEXT[tone]}`}>
      {tone === "neutral" ? (
        <>About the same as {versus}</>
      ) : (
        <>
          <span className="font-figure">{formatEur(Math.abs(delta))}</span>{" "}
          {delta < 0 ? "less" : "more"} than {versus}
        </>
      )}
    </p>
  );
}
