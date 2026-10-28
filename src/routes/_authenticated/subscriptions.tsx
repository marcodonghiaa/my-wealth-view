import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { estimatedMonthlyEur, splitSubscriptions } from "@/lib/subscriptions";
import { formatMoney } from "@/lib/transactions";
import { CategoryAvatar } from "@/components/category-avatar";

export const Route = createFileRoute("/_authenticated/subscriptions")({
  head: () => ({
    meta: [
      { title: "Subscriptions — MyFinances" },
      {
        name: "description",
        content: "Track recurring subscription charges and estimated monthly spend.",
      },
      { property: "og:title", content: "Subscriptions — MyFinances" },
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

type IntervalUnit = "days" | "weeks" | "months" | "years";

interface SubscriptionRow {
  creditor_name: string | null;
  category: string | null;
  currency: string | null;
  amount: number | null;
  signed_amount_eur: number | null;
  monthly_equivalent_eur: number | null;
  last_charged: string | null;
  charge_count: number | null;
  billing_frequency: string | null;
  billing_frequency_is_manual: boolean | null;
  custom_interval_value: number | null;
  custom_interval_unit: IntervalUnit | null;
}

const BILLING_FREQUENCIES = ["Weekly", "Monthly", "Quarterly", "Yearly"];
const INTERVAL_UNITS: Array<IntervalUnit> = ["days", "weeks", "months", "years"];

async function fetchSubscriptions(): Promise<Array<SubscriptionRow>> {
  const { data, error } = await supabase
    .from("v_subscriptions")
    .select(
      "creditor_name,category,currency,amount,signed_amount_eur,monthly_equivalent_eur,last_charged,charge_count,billing_frequency,billing_frequency_is_manual,custom_interval_value,custom_interval_unit",
    )
    .neq("amount", 0)
    .order("monthly_equivalent_eur", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<SubscriptionRow>;
}

function customIntervalLabel(value: number, unit: IntervalUnit): string {
  const unitLabel = value === 1 ? unit.slice(0, -1) : unit;
  return `Every ${value} ${unitLabel}`;
}

function signedNativeAmount(sub: SubscriptionRow): number | null {
  if (sub.amount == null || sub.signed_amount_eur == null) return null;
  const sign = sub.signed_amount_eur < 0 ? -1 : 1;
  return sign * Math.abs(sub.amount);
}

function SubscriptionsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["subscriptions"],
    queryFn: fetchSubscriptions,
  });

  type OverrideInput =
    | { creditorName: string; frequency: string; custom?: undefined }
    | {
        creditorName: string;
        frequency?: undefined;
        custom: { value: number; unit: IntervalUnit };
      };

  const frequencyMutation = useMutation({
    mutationFn: async (vars: OverrideInput) => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw userError ?? new Error("Not signed in");
      const { error } = await supabase.from("subscription_billing_overrides").upsert(
        {
          user_id: user.id,
          creditor_name: vars.creditorName,
          billing_frequency: vars.custom ? null : vars.frequency,
          custom_interval_value: vars.custom?.value ?? null,
          custom_interval_unit: vars.custom?.unit ?? null,
        },
        { onConflict: "user_id,creditor_name" },
      );
      if (error) throw error;
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["subscriptions"] });
      const previous = queryClient.getQueryData<Array<SubscriptionRow>>(["subscriptions"]);
      queryClient.setQueryData<Array<SubscriptionRow>>(["subscriptions"], (old) =>
        old?.map((sub) =>
          sub.creditor_name === vars.creditorName
            ? {
                ...sub,
                billing_frequency: vars.custom ? "Custom" : vars.frequency,
                billing_frequency_is_manual: true,
                custom_interval_value: vars.custom?.value ?? null,
                custom_interval_unit: vars.custom?.unit ?? null,
              }
            : sub,
        ),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["subscriptions"], context.previous);
      }
      toast.error("Couldn't save billing frequency", {
        description: error.message,
      });
    },
    onSuccess: (_data, vars) => {
      toast.success(
        `Billing frequency set to ${
          vars.custom ? customIntervalLabel(vars.custom.value, vars.custom.unit) : vars.frequency
        }`,
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });

  // Hides a merchant from this page without touching its transactions.
  const dismissMutation = useMutation({
    mutationFn: async ({
      creditorName,
      dismissed,
    }: {
      creditorName: string;
      dismissed: boolean;
    }) => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw userError ?? new Error("Not signed in");
      const { error } = await supabase
        .from("subscription_billing_overrides")
        .upsert(
          { user_id: user.id, creditor_name: creditorName, dismissed },
          { onConflict: "user_id,creditor_name" },
        );
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      if (!vars.dismissed) return;
      toast.success(`Removed ${vars.creditorName}`, {
        action: {
          label: "Undo",
          onClick: () =>
            dismissMutation.mutate({ creditorName: vars.creditorName, dismissed: false }),
        },
      });
    },
    onError: (error) => {
      toast.error("Couldn't update subscription", { description: error.message });
    },
  });

  const subscriptions = useMemo(() => query.data ?? [], [query.data]);

  const { recurring, oneOff } = useMemo(() => {
    const byCost = (a: SubscriptionRow, b: SubscriptionRow) =>
      Math.abs(b.monthly_equivalent_eur ?? 0) - Math.abs(a.monthly_equivalent_eur ?? 0);
    const split = splitSubscriptions(subscriptions);
    return { recurring: split.recurring.sort(byCost), oneOff: split.oneOff.sort(byCost) };
  }, [subscriptions]);

  const monthlyTotal = useMemo(() => estimatedMonthlyEur(recurring), [recurring]);

  const renderCard = (sub: SubscriptionRow) => (
    <SubscriptionCard
      key={sub.creditor_name}
      sub={sub}
      onDismiss={() => {
        if (!sub.creditor_name) return;
        dismissMutation.mutate({ creditorName: sub.creditor_name, dismissed: true });
      }}
      onSelectFrequency={(frequency) => {
        if (!sub.creditor_name) return;
        frequencyMutation.mutate({ creditorName: sub.creditor_name, frequency });
      }}
      onSelectCustom={(value, unit) => {
        if (!sub.creditor_name) return;
        frequencyMutation.mutate({ creditorName: sub.creditor_name, custom: { value, unit } });
      }}
    />
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
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
              ~{formatMoney(monthlyTotal, "EUR")}
              <span className="text-[0.4em] font-medium tracking-normal text-muted-foreground">
                {" "}
                /month
              </span>
            </p>
          )}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Yearly and quarterly charges count pro rata. One-off charges are not included.
        </p>
      </section>

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
        recurring.length > 0 && (
          <ul className="divide-y overflow-hidden rounded-2xl bg-card">
            {recurring.map(renderCard)}
          </ul>
        )
      )}

      {!query.isPending && recurring.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed bg-card/50 p-12 text-center text-sm text-muted-foreground">
          {oneOff.length === 0
            ? "No subscription charges found yet."
            : "No recurring charges yet. Set a billing frequency on a charge below to count it."}
        </div>
      )}

      {oneOff.length > 0 && (
        <details className="group mt-8">
          <summary className="ios-section-title flex min-h-11 cursor-pointer list-none items-center gap-2">
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            One-off charges ({oneOff.length})
          </summary>
          <p className="mb-3 px-4 text-[0.8125rem] text-muted-foreground">
            Charged once so far, so not counted in the monthly total. Set a frequency to count one.
          </p>
          <ul className="divide-y overflow-hidden rounded-2xl bg-card">{oneOff.map(renderCard)}</ul>
        </details>
      )}
    </div>
  );
}

function SubscriptionCard({
  sub,
  onDismiss,
  onSelectFrequency,
  onSelectCustom,
}: {
  sub: SubscriptionRow;
  onDismiss: () => void;
  onSelectFrequency: (frequency: string) => void;
  onSelectCustom: (value: number, unit: IntervalUnit) => void;
}) {
  const native = signedNativeAmount(sub);
  const currency = sub.currency ?? "EUR";
  const monthly = sub.monthly_equivalent_eur;
  const name = sub.creditor_name ?? "—";
  const lastCharged = sub.last_charged
    ? new Date(`${sub.last_charged}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })
    : null;
  const details = [
    sub.category,
    native != null && currency !== "EUR" ? formatMoney(Math.abs(native), currency) : null,
  ].filter(Boolean);

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <CategoryAvatar category={sub.category} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[0.9375rem] font-medium text-foreground">{name}</h2>
          <p className="truncate text-[0.8125rem] text-muted-foreground">{details.join(" · ")}</p>
        </div>
        <div className="shrink-0 text-right font-figure text-[0.9375rem] font-semibold">
          {monthly == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className={monthly > 0 ? "text-positive" : "text-foreground"}>
              {monthly > 0 ? "+" : ""}
              {formatMoney(Math.abs(monthly), "EUR")}
              <span className="text-[0.8125rem] font-normal text-muted-foreground"> /mo</span>
            </span>
          )}
        </div>
      </div>
      <div className="mt-1 grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-3 pl-[3.25rem]">
        <FrequencyPicker
          frequency={sub.billing_frequency}
          isManual={sub.billing_frequency_is_manual === true}
          customValue={sub.custom_interval_value}
          customUnit={sub.custom_interval_unit}
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
          className="-my-2 -mr-3 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-negative focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
    const value = parseInt(draftValue, 10);
    if (!Number.isFinite(value) || value <= 0) return;
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
          className={`inline-flex min-h-11 w-full items-center justify-between gap-1 rounded-full px-3 py-0.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
                className="h-8 w-14 rounded-md border bg-background px-2 text-base text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
                autoFocus
              />
              <select
                value={draftUnit}
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
                className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                Back
              </button>
              <button
                type="button"
                onClick={submitCustom}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
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
