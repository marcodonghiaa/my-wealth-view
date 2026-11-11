import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDownLeft, Check, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatISODate } from "@/lib/date";
import { dateLocale } from "@/lib/locale";
import { formatMoney, startOfMonth } from "@/lib/transactions";
import { REGULAR_RULE, regularSources } from "@/lib/regular-income";
import { useIncomeRules, useIncomeWindow } from "@/lib/income-kind-query";
import {
  billEntries,
  byDay,
  incomeEntries,
  monthBounds,
  monthGrid,
  type CalendarEntry,
  type ChargeTx,
} from "@/lib/recurring-calendar";
import { MonthSwitcher } from "@/components/month-switcher";
import { Alert } from "@/components/ui/alert";
import { GroupedList } from "@/components/ui/grouped-list";
import { Skeleton } from "@/components/ui/skeleton";

type Stream = Tables<"recurring_streams">;

// How far ahead the calendar goes: a yearly charge shows up within it.
export const MONTHS_AHEAD = 12;
const CHIPS_PER_DAY = 3;

/** This month's charges from the streams' names, from `transactions` (spend only). */
async function fetchCharges(month: Date, keys: Array<string>): Promise<Array<ChargeTx>> {
  if (keys.length === 0) return [];
  const { start, end } = monthBounds(month);
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "account_uid,entry_reference,booking_date,merchant_key,amount,currency,transaction_type",
    )
    .eq("credit_debit_indicator", "DBIT")
    .eq("flow_type", "spend")
    .is("deleted_at", null)
    .in("merchant_key", keys)
    .gte("booking_date", start)
    .lt("booking_date", end);
  if (error) throw error;
  return (data ?? []) as Array<ChargeTx>;
}

const statusLabel = (e: CalendarEntry) =>
  e.status === "done"
    ? e.kind === "income"
      ? "received"
      : "paid"
    : e.status === "late"
      ? "not seen yet"
      : "expected";

function StatusIcon({ entry }: { entry: CalendarEntry }) {
  if (entry.status === "done")
    return <Check aria-hidden className="size-3 shrink-0 text-positive" />;
  if (entry.status === "late")
    return <Clock aria-hidden className="size-3 shrink-0 text-warning" />;
  return entry.kind === "income" ? (
    <ArrowDownLeft aria-hidden className="size-3 shrink-0 text-muted-foreground" />
  ) : (
    <span aria-hidden className="size-3 shrink-0 rounded-full border border-muted-foreground/60" />
  );
}

const money = (e: CalendarEntry) =>
  `${e.kind === "income" ? "+" : ""}${formatMoney(e.amount, e.currency)}`;

export function RecurringCalendar({
  streams,
  today,
}: {
  /** The active streams (Subscriptions' main list). */
  streams: ReadonlyArray<Stream>;
  today: Date;
}) {
  const thisMonth = startOfMonth(today);
  const [month, setMonth] = useState<Date>(thisMonth);
  const isPast = month < thisMonth;
  // Regular income is judged on the six months up to now: a future month has no income yet.
  const windowMonth = isPast ? month : thisMonth;

  const keys = useMemo(() => [...new Set(streams.map((s) => s.merchant_key))].sort(), [streams]);
  const { start } = monthBounds(month);
  const isFuture = month > thisMonth;
  const chargesQuery = useQuery({
    queryKey: ["calendar-charges", start, keys],
    queryFn: () => fetchCharges(month, keys),
    enabled: !isFuture,
  });
  const windowQuery = useIncomeWindow(windowMonth);
  const rulesQuery = useIncomeRules();

  const entries = useMemo(() => {
    const bills = billEntries(streams, isFuture ? [] : (chargesQuery.data ?? []), month, today);
    const sources =
      windowQuery.data && rulesQuery.data ? regularSources(windowQuery.data, rulesQuery.data) : [];
    return [...bills, ...incomeEntries(sources, month, today)];
  }, [streams, chargesQuery.data, windowQuery.data, rulesQuery.data, month, today, isFuture]);
  const days = useMemo(() => byDay(entries), [entries]);

  const pending = (!isFuture && chargesQuery.isPending) || windowQuery.isPending;
  const failed = chargesQuery.error ?? windowQuery.error ?? rulesQuery.error;
  const bills = entries.filter((e) => e.kind === "bill");
  const income = entries.filter((e) => e.kind === "income");
  const todayIso = formatISODate(today);
  const label = month.toLocaleDateString(dateLocale(), { month: "long", year: "numeric" });
  const lastMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth() + MONTHS_AHEAD, 1);
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    // 2 Nov 2026 is a Monday.
    new Date(2026, 10, 2 + i).toLocaleDateString(dateLocale(), { weekday: "short" }),
  );

  return (
    <section aria-label="Recurring calendar">
      <MonthSwitcher
        className="mb-3"
        label={label}
        onPrev={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        onNext={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        canGoNext={month < lastMonth}
      />

      {failed && <Alert className="mb-4">Couldn't load the calendar: {failed.message}</Alert>}

      <div className="mb-4 min-h-5 text-[0.8125rem] text-muted-foreground">
        {pending ? (
          <Skeleton className="h-4 w-64" />
        ) : (
          <>
            Bills {bills.filter((e) => e.status === "done").length} of {bills.length} paid
            {" · "}
            Income {income.filter((e) => e.status === "done").length} of {income.length} in
          </>
        )}
      </div>

      <GroupedList>
        <div role="grid" aria-label={label} className="p-2 sm:p-3">
          <div role="row" className="grid grid-cols-7 gap-1 pb-1">
            {weekdays.map((d) => (
              <div
                key={d}
                role="columnheader"
                className="text-center text-[0.6875rem] font-medium text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>
          {monthGrid(month).map((week, w) => (
            <div key={w} role="row" className="grid grid-cols-7 gap-1">
              {week.map((day, i) => {
                if (!day) return <div key={i} role="gridcell" aria-hidden className="min-h-12" />;
                const iso = formatISODate(day);
                const list = days.get(iso) ?? [];
                const isToday = iso === todayIso;
                return (
                  <div
                    key={i}
                    role="gridcell"
                    aria-label={`${day.toLocaleDateString(dateLocale(), { day: "numeric", month: "long" })}${
                      list.length
                        ? `: ${list.map((e) => `${e.name} ${money(e)} ${statusLabel(e)}`).join(", ")}`
                        : ""
                    }`}
                    className={`min-h-12 rounded-sm p-1 md:min-h-24 ${list.length ? "bg-muted/60" : ""}`}
                  >
                    <div
                      className={`font-figure text-[0.6875rem] leading-5 ${
                        isToday
                          ? "inline-flex size-5 items-center justify-center rounded-full bg-foreground text-background"
                          : "text-muted-foreground"
                      }`}
                    >
                      {day.getDate()}
                    </div>
                    {/* Phones: one dot per entry; the list below has the details. */}
                    <div aria-hidden className="mt-0.5 flex flex-wrap gap-0.5 md:hidden">
                      {list.slice(0, 4).map((e) => (
                        <span
                          key={e.id}
                          className={`size-1.5 rounded-full ${
                            e.kind === "income"
                              ? "bg-positive"
                              : e.status === "late"
                                ? "bg-warning"
                                : e.status === "done"
                                  ? "bg-foreground"
                                  : "bg-muted-foreground/50"
                          }`}
                        />
                      ))}
                    </div>
                    <ul aria-hidden className="mt-0.5 hidden space-y-0.5 md:block">
                      {list.slice(0, CHIPS_PER_DAY).map((e) => (
                        <li
                          key={e.id}
                          title={`${e.name} ${money(e)} (${statusLabel(e)})`}
                          className="flex items-center gap-1 text-[0.6875rem] leading-4"
                        >
                          <StatusIcon entry={e} />
                          <span
                            className={`min-w-0 flex-1 truncate ${e.status === "done" ? "text-muted-foreground" : "text-foreground"}`}
                          >
                            {e.name}
                          </span>
                          <span
                            className={`shrink-0 font-figure ${e.kind === "income" ? "text-positive" : "text-foreground"}`}
                          >
                            {money(e)}
                          </span>
                        </li>
                      ))}
                      {list.length > CHIPS_PER_DAY && (
                        <li className="text-[0.6875rem] text-muted-foreground">
                          +{list.length - CHIPS_PER_DAY} more
                        </li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </GroupedList>

      {/* The month as a list: the details on phones, and every entry beyond a day's three. */}
      <div className="mt-6">
        {!pending && entries.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing recurring {isPast ? "happened" : "expected"} in {label}.
          </p>
        ) : (
          <GroupedList>
            <ul className="divide-y divide-hairline">
              {[...days].map(([iso, list]) =>
                list.map((e, i) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-12 shrink-0 font-figure text-xs text-muted-foreground">
                      {i === 0
                        ? new Date(`${iso}T00:00:00`).toLocaleDateString(dateLocale(), {
                            day: "numeric",
                            month: "short",
                          })
                        : ""}
                    </span>
                    <StatusIcon entry={e} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{e.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {e.kind === "income" ? "Income" : "Bill"} · {statusLabel(e)}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 font-figure ${e.kind === "income" ? "text-positive" : "text-foreground"}`}
                    >
                      {money(e)}
                    </span>
                  </li>
                )),
              )}
            </ul>
          </GroupedList>
        )}
      </div>
      <p className="mt-3 px-4 text-xs text-muted-foreground">
        Bills come from your active subscriptions. Income is any sender that {REGULAR_RULE}; change
        that on the Income page.
      </p>
    </section>
  );
}
