import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowDownLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatISODate } from "@/lib/date";
import { formatEur, formatMoney, incomeTitle } from "@/lib/transactions";
import { MonthSwitcher } from "@/components/month-switcher";
import { HeadlineFigure } from "@/components/headline-figure";

export const Route = createFileRoute("/_authenticated/income")({
  head: () => ({
    meta: [
      { title: "Income — MyFinances" },
      {
        name: "description",
        content: "Real income for the month, separate from spending and transfers.",
      },
      { property: "og:title", content: "Income — MyFinances" },
      {
        property: "og:description",
        content: "Real income for the month, separate from spending and transfers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IncomePage,
});

interface IncomeRow {
  entry_reference: string;
  booking_date: string | null;
  category: string | null;
  creditor_name: string | null;
  currency: string | null;
  amount: number | null;
  signed_amount_eur: number | null;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

async function fetchIncomeForMonth(month: Date): Promise<Array<IncomeRow>> {
  const start = formatISODate(startOfMonth(month));
  const end = formatISODate(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const { data, error } = await supabase
    .from("v_transactions_eur")
    .select("entry_reference,booking_date,category,creditor_name,currency,amount,signed_amount_eur")
    .eq("flow_type", "income")
    .gte("booking_date", start)
    .lt("booking_date", end)
    .order("booking_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<IncomeRow>;
}

function IncomePage() {
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));

  const incomeQuery = useQuery({
    queryKey: ["income", formatISODate(month)],
    queryFn: () => fetchIncomeForMonth(month),
  });
  const rows = incomeQuery.data ?? [];
  const total = rows.reduce((sum, r) => sum + Math.abs(r.signed_amount_eur ?? 0), 0);

  const monthLabel = month.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const canGoNext =
    startOfMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)) <=
    startOfMonth(new Date());

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-8">
        <h1 className="ios-large-title">Income</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Real income only — currency exchanges and wallet top-ups don't count.
        </p>
      </header>

      {incomeQuery.isError && (
        <div
          role="alert"
          className="mb-6 rounded-2xl bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load income: {incomeQuery.error.message}
        </div>
      )}

      <MonthSwitcher
        className="mb-6"
        label={monthLabel}
        onPrev={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        onNext={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        canGoNext={canGoNext}
      />

      <section aria-label="Total income" className="mb-8">
        <p className="text-[0.9375rem] font-medium text-muted-foreground">Total income</p>
        <div className="mt-1">
          <HeadlineFigure value={total} currency="EUR" />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl bg-card">
        {incomeQuery.isPending ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No income recorded for {monthLabel}.
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li
                key={r.entry_reference}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{incomeTitle(r)}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    {r.booking_date
                      ? new Date(`${r.booking_date}T00:00:00`).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })
                      : "—"}
                    {r.category && (
                      <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-primary">
                        {r.category}
                      </span>
                    )}
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 font-figure font-medium text-positive">
                  <ArrowDownLeft className="size-3.5" />
                  {formatMoney(Math.abs(r.amount ?? 0), r.currency ?? "EUR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
