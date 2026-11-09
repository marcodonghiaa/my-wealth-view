import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/empty-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Tables } from "@/integrations/supabase/types";
import {
  effectiveCadence,
  groupStreams,
  monthlyEur,
  monthlyTotal,
  romeToday,
} from "@/lib/recurring";
import { RECURRING_KEY, useRecurringStreams } from "@/lib/use-recurring-streams";
import { formatBookingDateShort, formatMoney } from "@/lib/transactions";
import { CategoryAvatar } from "@/components/category-avatar";
import { RevealDialog } from "@/components/subscriptions/reveal-dialog";

export const Route = createFileRoute("/_authenticated/subscriptions")({
  head: () => ({
    meta: [
      { title: "Subscriptions — Alopex" },
      {
        name: "description",
        content: "Track recurring subscription charges and estimated monthly spend.",
      },
      { property: "og:title", content: "Subscriptions — Alopex" },
      {
        property: "og:description",
        content: "Track recurring subscription charges and estimated monthly spend.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SubscriptionsPage,
});

type Stream = Tables<"recurring_streams">;
type IntervalUnit = "days" | "weeks" | "months" | "years";

const MUTATION_KEY = ["stream_action"];
const BILLING_FREQUENCIES = ["Weekly", "Monthly", "Quarterly", "Yearly"];
const INTERVAL_UNITS: Array<IntervalUnit> = ["days", "weeks", "months", "years"];

interface StreamAction {
  id: string;
  action: "confirm" | "dismiss" | "undismiss" | "set_cadence";
  args?: { cadence?: string; custom_value?: number; custom_unit?: IntervalUnit };
}

// What stream_action does server-side, applied to the cached row for an instant UI update.
function applyAction(s: Stream, { action, args }: StreamAction): Stream {
  if (action === "dismiss") return { ...s, user_status: "dismissed" };
  if (action === "undismiss")
    return { ...s, user_status: s.detected_status == null ? "confirmed" : null };
  if (action === "confirm") return { ...s, user_status: "confirmed" };
  return {
    ...s,
    user_status: "confirmed",
    user_cadence: args?.cadence ?? "custom",
    custom_interval_value: args?.custom_value ?? null,
    custom_interval_unit: args?.custom_unit ?? null,
  };
}

function customIntervalLabel(value: number, unit: IntervalUnit): string {
  const unitLabel = value === 1 ? unit.slice(0, -1) : unit;
  return `Every ${value} ${unitLabel}`;
}

function SubscriptionsPage() {
  const queryClient = useQueryClient();
  const query = useRecurringStreams();

  const actionMutation = useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: async ({ id, action, args }: StreamAction) => {
      const { error } = await supabase.rpc("stream_action", {
        p_stream: id,
        p_action: action,
        p_args: args ?? {},
      });
      if (error) throw error;
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: RECURRING_KEY });
      const previous = queryClient.getQueryData<Array<Stream>>(RECURRING_KEY);
      queryClient.setQueryData<Array<Stream>>(RECURRING_KEY, (old) =>
        old?.map((s) => (s.id === vars.id ? applyAction(s, vars) : s)),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(RECURRING_KEY, context.previous);
      toast.error("Couldn't update subscription", { description: error.message });
    },
    onSuccess: (_data, vars, context) => {
      if (vars.action === "set_cadence") toast.success("Billing frequency saved");
      if (vars.action !== "dismiss") return;
      const name = context.previous?.find((s) => s.id === vars.id)?.display_name ?? "subscription";
      toast.success(`Removed ${name}`, {
        action: {
          label: "Undo",
          onClick: () => actionMutation.mutate({ id: vars.id, action: "undismiss" }),
        },
      });
    },
    onSettled: () => {
      // Only the last in-flight action refetches, so a slow earlier one can't overwrite a newer optimistic state.
      if (queryClient.isMutating({ mutationKey: MUTATION_KEY }) !== 1) return;
      void queryClient.invalidateQueries({ queryKey: RECURRING_KEY });
    },
  });

  const { toReview, active, stopped, dismissed } = useMemo(() => {
    const g = groupStreams(query.data ?? [], romeToday());
    const byCost = (a: Stream, b: Stream) =>
      Math.abs(monthlyEur(b) ?? 0) - Math.abs(monthlyEur(a) ?? 0);
    return {
      toReview: g.toReview.sort(byCost),
      active: g.active.sort(byCost),
      stopped: g.stopped.sort(byCost),
      dismissed: g.dismissed.sort((a, b) =>
        (a.display_name ?? "").localeCompare(b.display_name ?? ""),
      ),
    };
  }, [query.data]);

  const total = useMemo(() => monthlyTotal(active), [active]);

  const renderCard = (s: Stream) => (
    <SubscriptionCard
      key={s.id}
      sub={s}
      onDismiss={() => actionMutation.mutate({ id: s.id, action: "dismiss" })}
      onSelectFrequency={(frequency) =>
        actionMutation.mutate({
          id: s.id,
          action: "set_cadence",
          args: { cadence: frequency.toLowerCase() },
        })
      }
      onSelectCustom={(value, unit) =>
        actionMutation.mutate({
          id: s.id,
          action: "set_cadence",
          args: { custom_value: value, custom_unit: unit },
        })
      }
    />
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <RevealDialog />
      <header className="mb-3">
        <h1 className="text-[0.9375rem] font-medium text-muted-foreground">Subscriptions</h1>
      </header>

      {query.isError && (
        <div
          role="alert"
          className="mb-6 rounded-2xl bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load subscriptions: {query.error.message}
        </div>
      )}

      {/* Estimated monthly cost */}
      <section aria-label="Estimated monthly cost" className="mb-8">
        <div className="min-h-16">
          {query.isPending ? (
            <div className="h-16 w-72 animate-pulse rounded-2xl bg-muted" />
          ) : (
            <p className="figure-display">
              {total.known === 0 ? "—" : `~${formatMoney(total.sum, "EUR")}`}
              {total.known > 0 && (
                <span className="text-[0.4em] font-medium tracking-normal text-muted-foreground">
                  {" "}
                  /month
                </span>
              )}
            </p>
          )}
        </div>
        {!query.isPending && total.known > 0 && total.unknown > 0 && (
          <p className="text-[0.8125rem] text-muted-foreground">
            + {total.unknown} without a frequency
          </p>
        )}
      </section>

      {toReview.length > 0 && (
        <section aria-label="To review" className="mb-8">
          <h2 className="ios-section-title">To review ({toReview.length})</h2>
          <ul className="divide-y overflow-hidden rounded-2xl bg-card">
            {toReview.map((s) => (
              <ReviewRow
                key={s.id}
                stream={s}
                onConfirm={() => actionMutation.mutate({ id: s.id, action: "confirm" })}
                onDismiss={() => actionMutation.mutate({ id: s.id, action: "dismiss" })}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Recurring subscriptions: one grouped list */}
      {query.isPending ? (
        <ul className="divide-y overflow-hidden rounded-2xl bg-card">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="size-10 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        active.length > 0 && (
          <ul className="divide-y overflow-hidden rounded-2xl bg-card">{active.map(renderCard)}</ul>
        )
      )}

      {!query.isPending && active.length === 0 && (
        <EmptyState
          className="mt-8 rounded-lg bg-card"
          title="No subscription charges found yet."
          hint="Recurring charges show up here once a few months of transactions are in."
        />
      )}

      {stopped.length > 0 && (
        <details className="group mt-8">
          <summary className="ios-section-title flex min-h-11 cursor-pointer list-none items-center gap-2">
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            Stopped ({stopped.length})
          </summary>
          <p className="mb-3 px-4 text-[0.8125rem] text-muted-foreground">
            No recent charge. Not counted.
          </p>
          <ul className="divide-y overflow-hidden rounded-2xl bg-card">
            {stopped.map(renderCard)}
          </ul>
        </details>
      )}

      {dismissed.length > 0 && (
        <details className="group mt-8">
          <summary className="ios-section-title flex min-h-11 cursor-pointer list-none items-center gap-2">
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            Dismissed ({dismissed.length})
          </summary>
          <p className="mb-3 px-4 text-[0.8125rem] text-muted-foreground">
            Hidden and not counted. Restore to bring one back.
          </p>
          <ul className="divide-y overflow-hidden rounded-2xl bg-card">
            {dismissed.map((s) => (
              <DismissedRow
                key={s.id}
                stream={s}
                onRestore={() => actionMutation.mutate({ id: s.id, action: "undismiss" })}
              />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function DismissedRow({ stream, onRestore }: { stream: Stream; onRestore: () => void }) {
  const name = stream.display_name ?? "—";
  const cadence = effectiveCadence(stream);
  const monthly = monthlyEur(stream);
  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <CategoryAvatar category={stream.category} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[0.9375rem] font-medium text-foreground">{name}</h3>
          <p className="truncate text-[0.8125rem] text-muted-foreground">
            {[stream.category, cadence].filter(Boolean).join(" · ")}
          </p>
        </div>
        {monthly != null && Math.abs(monthly) > 0 && <MonthlyAmount stream={stream} />}
      </div>
      <div className="mt-1 flex items-center gap-2 pl-[3.25rem]">
        <button
          type="button"
          onClick={onRestore}
          aria-label={`Restore ${name}`}
          className="inline-flex min-h-11 items-center rounded-sm border border-border px-4 text-sm font-medium text-foreground/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Restore
        </button>
      </div>
    </li>
  );
}

function MonthlyAmount({ stream }: { stream: Stream }) {
  const monthly = monthlyEur(stream);
  return (
    <div className="shrink-0 text-right font-figure text-[0.9375rem] font-semibold">
      {monthly == null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="text-foreground">
          {formatMoney(Math.abs(monthly), "EUR")}
          <span className="text-[0.8125rem] font-normal text-muted-foreground"> /mo</span>
        </span>
      )}
    </div>
  );
}

function ReviewRow({
  stream,
  onConfirm,
  onDismiss,
}: {
  stream: Stream;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const name = stream.display_name ?? "—";
  const details = [effectiveCadence(stream), `${stream.charge_count ?? 0} charges`].filter(Boolean);
  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <CategoryAvatar category={stream.category} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[0.9375rem] font-medium text-foreground">{name}</h3>
          <p className="truncate text-[0.8125rem] text-muted-foreground">{details.join(" · ")}</p>
        </div>
        <MonthlyAmount stream={stream} />
      </div>
      <div className="mt-1 flex gap-2 pl-[3.25rem]">
        <button
          type="button"
          onClick={onConfirm}
          aria-label={`Confirm ${name}`}
          className="inline-flex min-h-11 items-center rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`${name} is not a subscription`}
          className="inline-flex min-h-11 items-center rounded-sm border border-border px-4 text-sm font-medium text-foreground/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Not a subscription
        </button>
      </div>
    </li>
  );
}

function SubscriptionCard({
  sub,
  onDismiss,
  onSelectFrequency,
  onSelectCustom,
}: {
  sub: Stream;
  onDismiss: () => void;
  onSelectFrequency: (frequency: string) => void;
  onSelectCustom: (value: number, unit: IntervalUnit) => void;
}) {
  const name = sub.display_name ?? "—";
  // With the year when it isn't this year, so a charge from last year doesn't read as recent.
  const lastCharged = sub.last_charged ? formatBookingDateShort(sub.last_charged) : null;
  const details = [
    sub.category,
    sub.typical_amount != null && sub.currency !== "EUR"
      ? formatMoney(Math.abs(sub.typical_amount), sub.currency)
      : null,
  ].filter(Boolean);

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <CategoryAvatar category={sub.category} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[0.9375rem] font-medium text-foreground">{name}</h2>
          <p className="truncate text-[0.8125rem] text-muted-foreground">{details.join(" · ")}</p>
        </div>
        <MonthlyAmount stream={sub} />
      </div>
      <div className="mt-1 grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-3 pl-[3.25rem]">
        <FrequencyPicker
          frequency={effectiveCadence(sub)}
          isManual={sub.user_cadence != null}
          customValue={sub.custom_interval_value}
          customUnit={sub.custom_interval_unit as IntervalUnit | null}
          onSelect={onSelectFrequency}
          onSelectCustom={onSelectCustom}
        />
        <span className="truncate text-[0.8125rem] text-muted-foreground">
          {lastCharged ? `Last ${lastCharged}` : ""}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Remove ${name}`}
          className="-my-2 -mr-3 inline-flex size-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-negative focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </li>
  );
}

function FrequencyPicker({
  frequency,
  isManual,
  customValue,
  customUnit,
  onSelect,
  onSelectCustom,
}: {
  frequency: string | null;
  isManual: boolean;
  customValue: number | null;
  customUnit: IntervalUnit | null;
  onSelect: (frequency: string) => void;
  onSelectCustom: (value: number, unit: IntervalUnit) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [draftValue, setDraftValue] = useState(customValue != null ? String(customValue) : "3");
  const [draftUnit, setDraftUnit] = useState<IntervalUnit>(customUnit ?? "months");

  const isCustom = frequency === "Custom";
  const label =
    isCustom && customValue != null && customUnit
      ? customIntervalLabel(customValue, customUnit)
      : (frequency ?? "Set frequency");

  function openCustomForm() {
    setDraftValue(customValue != null ? String(customValue) : "3");
    setDraftUnit(customUnit ?? "months");
    setCustomOpen(true);
  }

  function submitCustom() {
    const value = Number(draftValue);
    if (!Number.isInteger(value) || value < 1 || value > 999) return;
    onSelectCustom(value, draftUnit);
    setCustomOpen(false);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setCustomOpen(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title={
            frequency
              ? isManual
                ? `${label} — manually set`
                : `${label} — auto-detected`
              : "Not enough history to detect — set the billing frequency"
          }
          className={`inline-flex min-h-11 w-full items-center justify-between gap-1 rounded-sm px-3 py-0.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            frequency
              ? "border border-border text-foreground/80 hover:border-primary/50 hover:text-foreground"
              : "border border-warning/60 bg-warning/10 text-warning hover:bg-warning/20"
          }`}
        >
          <span className="truncate">{label}</span>
          {isManual && frequency ? (
            <Pencil className="size-3 shrink-0 text-primary" aria-label="manually set" />
          ) : (
            <ChevronDown className="size-3 shrink-0 opacity-60" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        {customOpen ? (
          <div className="p-2">
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">Every</span>
              <input
                type="number"
                min={1}
                max={999}
                step={1}
                aria-label="Interval"
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
                className="h-8 w-14 rounded-md border bg-background px-2 text-base text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
                autoFocus
              />
              <select
                value={draftUnit}
                aria-label="Unit"
                onChange={(e) => setDraftUnit(e.target.value as IntervalUnit)}
                className="h-8 flex-1 rounded-md border bg-background px-1.5 text-base text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
              >
                {INTERVAL_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCustomOpen(false)}
                className="min-h-11 rounded-md px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                Back
              </button>
              <button
                type="button"
                onClick={submitCustom}
                className="min-h-11 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <>
            {BILLING_FREQUENCIES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onSelect(option);
                  setOpen(false);
                }}
                className="flex min-h-11 w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm text-foreground hover:bg-accent"
              >
                {option}
                {frequency === option && <Check className="size-4 text-primary" />}
              </button>
            ))}
            <button
              type="button"
              onClick={openCustomForm}
              className="flex min-h-11 w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm text-foreground hover:bg-accent"
            >
              Custom…
              {isCustom && <Check className="size-4 text-primary" />}
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
