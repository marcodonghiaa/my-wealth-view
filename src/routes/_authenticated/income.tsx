import { dateLocale } from "@/lib/locale";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowDownLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatISODate } from "@/lib/date";
import {
  categoryRepeatsTitle,
  formatMoney,
  formatSignedEur,
  incomeTitle,
  monthFromParam,
  parseTransactionsSearch,
  startOfMonth,
} from "@/lib/transactions";
import { fetchIncomeExpenses, incomeExpensesKey, netAfterSpending } from "@/lib/income-expenses";
import { TONE_TEXT, toneOf } from "@/lib/tone";
import { MonthSwitcher } from "@/components/month-switcher";
import { HeadlineFigure } from "@/components/headline-figure";
import { CategoryPicker } from "@/components/transactions/pickers";
import { useIncomeCategoryMutation } from "@/components/transactions/mutations";
import { Alert } from "@/components/ui/alert";
import { GroupedList } from "@/components/ui/grouped-list";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/income")({
  head: () => ({
    meta: [
      { title: "Income — Alopex" },
      {
        name: "description",
        content: "Real income for the month, separate from spending and transfers.",
      },
      { property: "og:title", content: "Income — Alopex" },
      {
        property: "og:description",
        content: "Real income for the month, separate from spending and transfers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // ?month=YYYY-MM: the month to open on (Cash flow's rows link here with the month they show).
  validateSearch: (s: Record<string, unknown>): { month?: string } => {
    const { month } = parseTransactionsSearch(s);
    return month ? { month } : {};
  },
  component: IncomePage,
});

interface IncomeRow {
  entry_reference: string;
  account_uid: string | null;
  booking_date: string | null;
  category: string | null;
  creditor_name: string | null;
  payer_name: string | null;
  currency: string | null;
  amount: number | null;
  signed_amount_eur: number | null;
}

async function fetchIncomeForMonth(month: Date): Promise<Array<IncomeRow>> {
  const start = formatISODate(startOfMonth(month));
  const end = formatISODate(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const { data, error } = await supabase
    .from("v_transactions_eur")
    .select(
      "entry_reference,account_uid,booking_date,category,creditor_name,payer_name,currency,amount,signed_amount_eur",
    )
    .eq("flow_type", "income")
    .gte("booking_date", start)
    .lt("booking_date", end)
    .order("booking_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<IncomeRow>;
}

function IncomePage() {
  const search = Route.useSearch();
  const [month, setMonth] = useState<Date>(() => monthFromParam(search.month));
  const updateCategory = useIncomeCategoryMutation(useQueryClient());

  const incomeQuery = useQuery({
    queryKey: ["income", formatISODate(month)],
    queryFn: () => fetchIncomeForMonth(month),
  });
  const flowQuery = useQuery({
    queryKey: incomeExpensesKey(formatISODate(month)),
    queryFn: () => fetchIncomeExpenses(formatISODate(month)),
  });
  const net = netAfterSpending(flowQuery.data);
  const rows = incomeQuery.data ?? [];
  const total = rows.reduce((sum, r) => sum + Math.abs(r.signed_amount_eur ?? 0), 0);

  const monthLabel = month.toLocaleDateString(dateLocale(), { month: "long", year: "numeric" });
  const canGoNext =
    startOfMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)) <=
    startOfMonth(new Date());

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      {/* One header, as on Spending: the month and its arrows; the figure below is the answer */}
      <h1 className="sr-only">Income</h1>

      {incomeQuery.isError && (
        <Alert className="mb-6">Couldn't load income: {incomeQuery.error.message}</Alert>
      )}

      <MonthSwitcher
        className="mb-6"
        label={monthLabel}
        onPrev={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        onNext={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        canGoNext={canGoNext}
      />

      <section aria-label={`Received in ${monthLabel}`} className="mb-8">
        <p className="text-[0.9375rem] font-medium text-muted-foreground">Received</p>
        <div className="mt-1">
          {incomeQuery.isError ? (
            <p className="figure-display text-muted-foreground">—</p>
          ) : (
            <HeadlineFigure value={total} currency="EUR" />
          )}
        </div>
        {net != null && (
          <p className="mt-1.5 text-sm text-muted-foreground">
            Net after spending{" "}
            <span className={`font-figure ${TONE_TEXT[toneOf(net)]}`}>{formatSignedEur(net)}</span>
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">Excludes transfers.</p>
      </section>

      <GroupedList>
        {incomeQuery.isPending ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : incomeQuery.isError ? null : rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No income recorded for {monthLabel}.
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {rows.map((r) => (
              <li
                key={`${r.account_uid}:${r.entry_reference}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{incomeTitle(r)}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    {r.booking_date
                      ? new Date(`${r.booking_date}T00:00:00`).toLocaleDateString(dateLocale(), {
                          day: "numeric",
                          month: "short",
                        })
                      : "—"}
                    {!categoryRepeatsTitle(r) && (
                      <CategoryPicker
                        tx={r}
                        saving={
                          updateCategory.isPending &&
                          updateCategory.variables?.tx.entry_reference === r.entry_reference &&
                          updateCategory.variables.tx.account_uid === r.account_uid
                        }
                        onSelect={(category) => updateCategory.mutate({ tx: r, category })}
                      />
                    )}
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 font-figure text-foreground">
                  <ArrowDownLeft className="size-3.5" />
                  {formatMoney(Math.abs(r.amount ?? 0), r.currency ?? "EUR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </GroupedList>
    </div>
  );
}
