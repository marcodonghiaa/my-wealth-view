import { dateLocale } from "@/lib/locale";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDownLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatISODate } from "@/lib/date";
import {
  categoryRepeatsTitle,
  formatMoney,
  formatSignedEur,
  incomeTitle,
  startOfMonth,
} from "@/lib/transactions";
import { fetchIncomeExpenses, incomeExpensesKey, netAfterSpending } from "@/lib/income-expenses";
import { TONE_TEXT, toneOf } from "@/lib/tone";
import { MonthSwitcher } from "@/components/month-switcher";
import { HeadlineFigure } from "@/components/headline-figure";
import { CategoryPicker } from "@/components/transactions/pickers";
import { useIncomeCategoryMutation } from "@/components/transactions/mutations";
import { Alert } from "@/components/ui/alert";
import { GroupedList, SectionTitle } from "@/components/ui/grouped-list";
import { Skeleton } from "@/components/ui/skeleton";
import {
  REGULAR_RULE,
  classifyIncome,
  txKey,
  type IncomeKind,
  type IncomeTx,
} from "@/lib/regular-income";
import { useIncomeRules, useIncomeWindow, useMarkIncomeKind } from "@/lib/income-kind-query";

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
  component: IncomePage,
});

interface IncomeRow {
  entry_reference: string;
  account_uid: string | null;
  booking_date: string | null;
  category: string | null;
  creditor_name: string | null;
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
      "entry_reference,account_uid,booking_date,category,creditor_name,currency,amount,signed_amount_eur",
    )
    .eq("flow_type", "income")
    .gte("booking_date", start)
    .lt("booking_date", end)
    .order("booking_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<IncomeRow>;
}

interface MarkProps {
  /** The kind a row moves to. */
  to: IncomeKind;
  bank: Map<string, IncomeTx>;
  saving: boolean;
  onMark: (tx: IncomeTx, to: IncomeKind) => void;
}

function IncomeList({ rows, mark }: { rows: Array<IncomeRow>; mark?: MarkProps }) {
  const updateCategory = useIncomeCategoryMutation(useQueryClient());
  return (
    <ul className="divide-y divide-hairline">
      {rows.map((r) => {
        const bankRow = mark?.bank.get(txKey(r));
        return (
          <li
            key={`${r.account_uid}:${r.entry_reference}`}
            className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5"
          >
            <div className="min-w-0">
              <div className="truncate font-medium text-foreground">{incomeTitle(r)}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
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
                {mark && bankRow?.creditor_name && (
                  <button
                    type="button"
                    disabled={mark.saving}
                    onClick={() => mark.onMark(bankRow, mark.to)}
                    className="-my-3 inline-flex min-h-11 items-center rounded-sm px-1 font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                  >
                    {mark.to === "regular" ? "Mark regular" : "Mark one-off"}
                  </button>
                )}
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 font-figure text-foreground">
              <ArrowDownLeft className="size-3.5" />
              {formatMoney(Math.abs(r.amount ?? 0), r.currency ?? "EUR")}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function IncomePage() {
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const incomeQuery = useQuery({
    queryKey: ["income", formatISODate(month)],
    queryFn: () => fetchIncomeForMonth(month),
  });
  const flowQuery = useQuery({
    queryKey: incomeExpensesKey(formatISODate(month)),
    queryFn: () => fetchIncomeExpenses(formatISODate(month)),
  });
  const windowQuery = useIncomeWindow(month);
  const rulesQuery = useIncomeRules();
  const markKind = useMarkIncomeKind();
  const net = netAfterSpending(flowQuery.data);
  const rows = useMemo(() => incomeQuery.data ?? [], [incomeQuery.data]);
  const total = rows.reduce((sum, r) => sum + Math.abs(r.signed_amount_eur ?? 0), 0);

  // Each row's kind and its bank row (original name, for a rule), once the six months are in.
  // Until then (or if that read fails) the list stays one list, as before.
  const split = useMemo(() => {
    if (!windowQuery.data || !rulesQuery.data) return null;
    const kinds = classifyIncome(windowQuery.data, rulesQuery.data);
    const bank = new Map(windowQuery.data.map((t) => [txKey(t), t]));
    const kindOf = (r: IncomeRow): IncomeKind => kinds.get(txKey(r)) ?? "one_off";
    const sum = (list: Array<IncomeRow>) =>
      list.reduce((acc, r) => acc + Math.abs(r.signed_amount_eur ?? 0), 0);
    const regular = rows.filter((r) => kindOf(r) === "regular");
    const oneOff = rows.filter((r) => kindOf(r) === "one_off");
    return { regular, oneOff, regularTotal: sum(regular), oneOffTotal: sum(oneOff), bank };
  }, [windowQuery.data, rulesQuery.data, rows]);

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
        {split && rows.length > 0 && (
          <p className="mt-1.5 text-sm text-muted-foreground">
            Regular{" "}
            <span className="font-figure text-foreground">
              {formatMoney(split.regularTotal, "EUR")}
            </span>
            {" · "}
            One-off{" "}
            <span className="font-figure text-foreground">
              {formatMoney(split.oneOffTotal, "EUR")}
            </span>
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Excludes transfers. Regular: {REGULAR_RULE}.
        </p>
      </section>

      {incomeQuery.isPending ? (
        <GroupedList>
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        </GroupedList>
      ) : incomeQuery.isError ? null : rows.length === 0 ? (
        <GroupedList>
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No income recorded for {monthLabel}.
          </div>
        </GroupedList>
      ) : !split ? (
        <GroupedList>
          <IncomeList rows={rows} />
        </GroupedList>
      ) : (
        (
          [
            ["regular", "Regular", split.regular, split.regularTotal],
            ["one_off", "One-off", split.oneOff, split.oneOffTotal],
          ] as const
        ).map(
          ([kind, title, list, sum]) =>
            list.length > 0 && (
              <section key={kind} aria-label={title} className="mb-8">
                <SectionTitle
                  action={
                    <span className="font-figure text-sm text-muted-foreground">
                      {formatMoney(sum, "EUR")}
                    </span>
                  }
                >
                  {title}
                </SectionTitle>
                <GroupedList>
                  <IncomeList
                    rows={list}
                    mark={{
                      to: kind === "regular" ? "one_off" : "regular",
                      bank: split.bank,
                      saving: markKind.isPending,
                      onMark: (tx, to) =>
                        markKind.mutate({ tx, kind: to, rules: rulesQuery.data ?? [] }),
                    }}
                  />
                </GroupedList>
              </section>
            ),
        )
      )}
    </div>
  );
}
