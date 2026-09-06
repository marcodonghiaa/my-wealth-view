import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  Check,
  ChevronDown,
  Pencil,
  Repeat,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export const Route = createFileRoute("/_authenticated/subscriptions")({
  head: () => ({
    meta: [
      { title: "Subscriptions — Finance Dashboard" },
      {
        name: "description",
        content:
          "Track recurring subscription charges and estimated monthly spend.",
      },
      { property: "og:title", content: "Subscriptions — Finance Dashboard" },
      {
        property: "og:description",
        content:
          "Track recurring subscription charges and estimated monthly spend.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SubscriptionsPage,
});

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
}

const BILLING_FREQUENCIES = ["Weekly", "Monthly", "Quarterly", "Yearly"];

async function fetchSubscriptions(): Promise<Array<SubscriptionRow>> {
  const { data, error } = await getSupabase()
    .from("v_subscriptions")
    .select(
      "creditor_name,category,currency,amount,signed_amount_eur,monthly_equivalent_eur,last_charged,charge_count,billing_frequency,billing_frequency_is_manual",
    )
    .neq("amount", 0)
    .order("monthly_equivalent_eur", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<SubscriptionRow>;
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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

  const frequencyMutation = useMutation({
    mutationFn: async ({
      creditorName,
      frequency,
    }: {
      creditorName: string;
      frequency: string;
    }) => {
      const supabase = getSupabase();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw userError ?? new Error("Not signed in");
      const { error } = await supabase
        .from("subscription_billing_overrides")
        .upsert(
          {
            user_id: user.id,
            creditor_name: creditorName,
            billing_frequency: frequency,
          },
          { onConflict: "user_id,creditor_name" },
        );
      if (error) throw error;
    },
    onMutate: async ({ creditorName, frequency }) => {
      await queryClient.cancelQueries({ queryKey: ["subscriptions"] });
      const previous =
        queryClient.getQueryData<Array<SubscriptionRow>>(["subscriptions"]);
      queryClient.setQueryData<Array<SubscriptionRow>>(
        ["subscriptions"],
        (old) =>
          old?.map((sub) =>
            sub.creditor_name === creditorName
              ? {
                  ...sub,
                  billing_frequency: frequency,
                  billing_frequency_is_manual: true,
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
    onSuccess: (_data, { frequency }) => {
      toast.success(`Billing frequency set to ${frequency}`);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });

  const subscriptions = query.data ?? [];

  const sorted = useMemo(
    () =>
      [...subscriptions].sort(
        (a, b) =>
          Math.abs(b.monthly_equivalent_eur ?? 0) -
          Math.abs(a.monthly_equivalent_eur ?? 0),
      ),
    [subscriptions],
  );

  const estimatedMonthlyEur = useMemo(
    () =>
      subscriptions.reduce(
        (sum, sub) => sum + Math.abs(sub.monthly_equivalent_eur ?? 0),
        0,
      ),
    [subscriptions],
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Subscriptions
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Recurring charges grouped by merchant, with auto-detected billing
          frequency.
        </p>
      </header>

      {query.isError && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load subscriptions: {query.error.message}
        </div>
      )}

      {/* Estimated monthly cost */}
      <section className="mb-6 rounded-2xl border bg-card p-6 card-ring surface-glow sm:p-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wallet className="size-4 text-primary" />
          Estimated monthly recurring cost
        </div>

        <div className="mt-3 min-h-16">
          {query.isPending ? (
            <div className="h-14 w-64 animate-pulse rounded-lg bg-muted" />
          ) : (
            <p className="font-figure text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
              ~{formatMoney(estimatedMonthlyEur, "EUR")}
              <span className="text-foreground/60">/month</span>
            </p>
          )}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Based on each subscription's monthly equivalent — yearly charges
          count as 1/12, quarterly as 1/3. Actual billing may differ.
        </p>
      </section>

      {/* Subscription cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {query.isPending
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border bg-card p-5 card-ring"
              >
                <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                <div className="mt-4 h-8 w-1/2 animate-pulse rounded bg-muted" />
                <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-muted" />
              </div>
            ))
          : sorted.map((sub) => (
              <SubscriptionCard
                key={sub.creditor_name}
                sub={sub}
                onSelectFrequency={(frequency) => {
                  if (!sub.creditor_name) return;
                  frequencyMutation.mutate({
                    creditorName: sub.creditor_name,
                    frequency,
                  });
                }}
              />
            ))}
      </section>

      {!query.isPending && sorted.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed bg-card/50 p-12 text-center text-sm text-muted-foreground">
          No subscription charges found yet.
        </div>
      )}
    </div>
  );
}

function SubscriptionCard({
  sub,
  onSelectFrequency,
}: {
  sub: SubscriptionRow;
  onSelectFrequency: (frequency: string) => void;
}) {
  const native = signedNativeAmount(sub);
  const currency = sub.currency ?? "EUR";
  const eur = sub.signed_amount_eur;
  const showEur = currency !== "EUR" && eur != null;
  const positive = (native ?? 0) >= 0;
  const monthly = sub.monthly_equivalent_eur;
  const lastCharged = sub.last_charged
    ? new Date(`${sub.last_charged}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

  return (
    <div className="rounded-2xl border bg-card p-5 card-ring">
      <div className="flex items-start justify-between gap-3">
        <h2 className="truncate font-medium text-foreground">
          {sub.creditor_name ?? "—"}
        </h2>
        {sub.category ? (
          <span className="inline-flex shrink-0 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {sub.category}
          </span>
        ) : null}
      </div>

      {/* Monthly equivalent — the headline figure per card */}
      <div className="mt-4 font-figure text-2xl font-semibold tracking-tight">
        {monthly == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span
            className={`inline-flex items-center gap-1.5 ${
              monthly >= 0 ? "text-positive" : "text-negative"
            }`}
          >
            {monthly < 0 && <ArrowDownLeft className="size-5" />}
            {formatMoney(monthly, "EUR")}
            <span className="text-sm font-normal text-foreground/60">
              /month
            </span>
          </span>
        )}
      </div>

      {/* Last actual charge */}
      <p className="mt-1.5 text-xs text-muted-foreground">
        Last charged {lastCharged}
        {native != null && (
          <>
            {" · "}
            <span className={positive ? "text-positive" : "text-negative"}>
              {formatMoney(native, currency)}
            </span>
            {showEur && (
              <span className="text-foreground/70">
                {" "}
                ({formatMoney(eur, "EUR")})
              </span>
            )}
          </>
        )}
      </p>

      <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
        <FrequencyPicker
          frequency={sub.billing_frequency}
          isManual={sub.billing_frequency_is_manual === true}
          onSelect={onSelectFrequency}
        />
        <span>·</span>
        <span className="inline-flex items-center gap-1">
          <Repeat className="size-3.5" />
          billed {sub.charge_count ?? 0}x
        </span>
      </div>
    </div>
  );
}

function FrequencyPicker({
  frequency,
  isManual,
  onSelect,
}: {
  frequency: string | null;
  isManual: boolean;
  onSelect: (frequency: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={
            frequency
              ? isManual
                ? `${frequency} — manually set`
                : `${frequency} — auto-detected`
              : "Not enough history to detect — click to set manually"
          }
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            frequency
              ? "border border-border text-foreground/80 hover:border-primary/50 hover:text-foreground"
              : "border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary/50 hover:text-foreground"
          }`}
        >
          {frequency ?? "Unconfirmed"}
          {isManual && frequency ? (
            <Pencil className="size-3 text-primary" aria-label="manually set" />
          ) : (
            <ChevronDown className="size-3 opacity-60" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1">
        {BILLING_FREQUENCIES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              onSelect(option);
              setOpen(false);
            }}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm text-foreground hover:bg-accent"
          >
            {option}
            {frequency === option && (
              <Check className="size-4 text-primary" />
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
