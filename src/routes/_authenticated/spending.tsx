import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CategoryRow } from "@/components/spending/category-row";
import { supabase } from "@/integrations/supabase/client";
import { formatISODate } from "@/lib/date";
import { categoryColor } from "@/lib/categories";
import { formatEur, personalAmountEur } from "@/lib/transactions";
import { MonthSwitcher } from "@/components/month-switcher";
import { HeadlineFigure } from "@/components/headline-figure";
import { ShareBar } from "@/components/share-bar";

export const Route = createFileRoute("/_authenticated/spending")({
  head: () => ({
    meta: [
      { title: "Spend by Category — MyFinances" },
      {
        name: "description",
        content: "See how much you spent per category, month by month.",
      },
      { property: "og:title", content: "Spend by Category — MyFinances" },
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

interface SpendRow {
  month: string | null;
  category: string | null;
  spend_eur: number | null;
}

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

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

async function fetchSpendForMonth(month: Date): Promise<Array<SpendRow>> {
  const { data, error } = await supabase
    .from("v_spend_by_category_monthly")
    .select("month,category,spend_eur")
    .eq("month", formatISODate(startOfMonth(month)));
  if (error) throw error;
  return (data ?? []) as Array<SpendRow>;
}

// Scoped to the selected month, like the rest of the page.
async function fetchRegretSpend(month: Date): Promise<Array<RegretGroup>> {
  const start = formatISODate(startOfMonth(month));
  const end = formatISODate(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const { data, error } = await supabase
    .from("v_transactions_eur")
    .select("category,personal_signed_amount_eur,signed_amount_eur")
    .eq("worth_it", "no")
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

  const regretQuery = useQuery({
    queryKey: ["worth-it-regret", formatISODate(month)],
    queryFn: () => fetchRegretSpend(month),
  });
  const regretRows = regretQuery.data ?? [];
  const regretTotal = regretRows.reduce((sum, r) => sum + r.total, 0);
  const regretCount = regretRows.reduce((sum, r) => sum + r.count, 0);

  const rows = useMemo(
    () =>
      (spendQuery.data ?? [])
        .filter((r) => r.spend_eur != null && r.spend_eur > 0)
        .map((r) => ({
          category: r.category ?? "Uncategorized",
          spend_eur: r.spend_eur as number,
        }))
        .sort((a, b) => b.spend_eur - a.spend_eur),
    [spendQuery.data],
  );

  const total = rows.reduce((sum, r) => sum + r.spend_eur, 0);

  const monthLabel = month.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const canGoNext =
    startOfMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)) <=
    startOfMonth(new Date());

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      {/* One header: the month and its arrows; the figure below is the page's answer */}
      <h1 className="sr-only">Spending by category</h1>

      {spendQuery.isError && (
        <div
          role="alert"
          className="mb-6 rounded-2xl bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load spending data: {spendQuery.error.message}
        </div>
      )}

      {regretQuery.isError && (
        <div
          role="alert"
          className="mb-6 rounded-2xl bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load your "worth it?" answers: {regretQuery.error.message}
        </div>
      )}

      <MonthSwitcher
        className="mb-6"
        label={monthLabel}
        onPrev={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        onNext={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        canGoNext={canGoNext}
      />

      {spendQuery.isPending ? (
        <div className="h-80 animate-pulse rounded-2xl bg-muted/50" />
      ) : rows.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-2xl bg-card text-sm text-muted-foreground">
          No spending recorded for {monthLabel}.
        </div>
      ) : (
        <>
          {/* Headline: the month's spend, then how it splits by category */}
          <section aria-label={`Spent in ${monthLabel}`} className="mb-8">
            <p className="text-[0.9375rem] font-medium text-muted-foreground">Spent</p>
            <div className="mt-1">
              <HeadlineFigure value={total} currency="EUR" />
            </div>
            <div className="mt-5">
              <ShareBar
                title="Spend by category"
                shares={rows.map((r) => ({
                  label: r.category,
                  value: r.spend_eur,
                  color: categoryColor(r.category),
                }))}
              />
            </div>
          </section>

          {/* Breakdown list */}
          <section className="overflow-hidden rounded-2xl bg-card">
            <ul className="divide-y">
              {rows.map((row) => (
                <CategoryRow
                  key={row.category}
                  category={row.category}
                  total={row.spend_eur}
                  month={month}
                />
              ))}
              <li className="flex items-center justify-between border-t px-4 py-3 text-sm font-semibold sm:px-5">
                <span className="text-foreground">Total</span>
                <span className="font-figure text-foreground">{formatEur(total)}</span>
              </li>
            </ul>
          </section>
        </>
      )}

      {regretCount > 0 && (
        <section className="mt-6 overflow-hidden rounded-2xl bg-card">
          <div className="border-b px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-foreground">
              Not worth it — {formatEur(regretTotal)} across {regretCount} purchase
              {regretCount === 1 ? "" : "s"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              From your "worth it?" check-ins this month.
            </p>
          </div>
          <ul className="divide-y">
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
        </section>
      )}
    </div>
  );
}
