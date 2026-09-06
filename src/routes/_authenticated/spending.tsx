import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getSupabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/spending")({
  head: () => ({
    meta: [
      { title: "Spend by Category — Finance Dashboard" },
      {
        name: "description",
        content: "See how much you spent per category, month by month.",
      },
      { property: "og:title", content: "Spend by Category — Finance Dashboard" },
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

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function fetchSpendForMonth(month: Date): Promise<Array<SpendRow>> {
  const { data, error } = await getSupabase()
    .from("v_spend_by_category_monthly")
    .select("month,category,spend_eur")
    .eq("month", formatISODate(startOfMonth(month)));
  if (error) throw error;
  return (data ?? []) as Array<SpendRow>;
}

function formatEur(value: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function SpendingPage() {
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));

  const spendQuery = useQuery({
    queryKey: ["spend-by-category", formatISODate(month)],
    queryFn: () => fetchSpendForMonth(month),
  });

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
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Spend by Category
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Where your money went, broken down per category.
        </p>
      </header>

      {spendQuery.isError && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load spending data: {spendQuery.error.message}
        </div>
      )}

      {/* Month selector */}
      <div className="mb-6 flex items-center justify-between rounded-xl border bg-card p-2 card-ring">
        <button
          type="button"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
          }
          aria-label="Previous month"
          className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="text-sm font-medium text-foreground">{monthLabel}</span>
        <button
          type="button"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
          }
          disabled={!canGoNext}
          aria-label="Next month"
          className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {spendQuery.isPending ? (
        <div className="h-80 animate-pulse rounded-2xl bg-muted/50" />
      ) : rows.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border bg-card text-sm text-muted-foreground card-ring">
          No spending recorded for {monthLabel}.
        </div>
      ) : (
        <>
          {/* Chart card */}
          <section className="mb-6 rounded-2xl border bg-card p-4 card-ring sm:p-6">
            <div className="mb-4 flex items-center justify-between px-2">
              <h2 className="text-sm font-semibold text-foreground">
                {monthLabel} — total {formatEur(total)}
              </h2>
              <span className="text-xs text-muted-foreground">EUR</span>
            </div>
            <div
              className="w-full"
              style={{ height: Math.max(220, rows.length * 44) }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rows}
                  layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 6"
                    stroke="var(--color-border)"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `€${Math.round(v / 1000)}k` : `€${v}`
                    }
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={110}
                    tick={{ fill: "var(--color-foreground)", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<SpendTooltip />} cursor={{ fill: "var(--color-muted)", fillOpacity: 0.3 }} />
                  <Bar dataKey="spend_eur" radius={[0, 6, 6, 0]} maxBarSize={26}>
                    {rows.map((row) => (
                      <Cell key={row.category} fill="var(--color-primary)" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Breakdown list */}
          <section className="overflow-hidden rounded-2xl border bg-card card-ring">
            <ul className="divide-y">
              {rows.map((row) => (
                <li
                  key={row.category}
                  className="flex items-center justify-between px-4 py-3 text-sm sm:px-5"
                >
                  <span className="font-medium text-foreground">
                    {row.category}
                  </span>
                  <span className="font-figure text-foreground">
                    {formatEur(row.spend_eur)}
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between border-t px-4 py-3 text-sm font-semibold sm:px-5">
                <span className="text-foreground">Total</span>
                <span className="font-figure text-foreground">
                  {formatEur(total)}
                </span>
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

interface TooltipEntry {
  payload?: { category: string; spend_eur: number };
}

function SpendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<TooltipEntry>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload.at(0)?.payload;
  if (!point) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground">{point.category}</p>
      <p className="font-figure mt-0.5 text-sm font-semibold text-foreground">
        {formatEur(point.spend_eur)}
      </p>
    </div>
  );
}
