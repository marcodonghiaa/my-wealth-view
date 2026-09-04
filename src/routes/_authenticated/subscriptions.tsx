import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ArrowDownLeft, Repeat, Wallet } from "lucide-react";
import { getSupabase } from "@/integrations/supabase/client";

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
  last_charged: string | null;
  charge_count: number | null;
}

async function fetchSubscriptions(): Promise<Array<SubscriptionRow>> {
  const { data, error } = await getSupabase()
    .from("v_subscriptions")
    .select(
      "creditor_name,category,currency,amount,signed_amount_eur,last_charged,charge_count",
    )
    .neq("amount", 0)
    .order("signed_amount_eur", { ascending: true });
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
  const query = useQuery({
    queryKey: ["subscriptions"],
    queryFn: fetchSubscriptions,
  });

  const subscriptions = query.data ?? [];

  const sorted = useMemo(
    () =>
      [...subscriptions].sort(
        (a, b) =>
          Math.abs(b.signed_amount_eur ?? 0) -
          Math.abs(a.signed_amount_eur ?? 0),
      ),
    [subscriptions],
  );

  const estimatedMonthlyEur = useMemo(
    () =>
      subscriptions.reduce(
        (sum, sub) => sum + Math.abs(sub.signed_amount_eur ?? 0),
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
          Recurring charges grouped by merchant, newest charge first.
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
          Based on the most recent charge per subscription. Actual billing may
          differ.
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
          : sorted.map((sub) => <SubscriptionCard key={sub.creditor_name} sub={sub} />)}
      </section>

      {!query.isPending && sorted.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed bg-card/50 p-12 text-center text-sm text-muted-foreground">
          No subscription charges found yet.
        </div>
      )}
    </div>
  );
}

function SubscriptionCard({ sub }: { sub: SubscriptionRow }) {
  const native = signedNativeAmount(sub);
  const currency = sub.currency ?? "EUR";
  const eur = sub.signed_amount_eur;
  const showEur = currency !== "EUR" && eur != null;
  const positive = (native ?? 0) >= 0;
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

      <div className="mt-4 font-figure text-2xl font-semibold tracking-tight">
        {native == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span
            className={`inline-flex items-center gap-1.5 ${
              positive ? "text-positive" : "text-negative"
            }`}
          >
            {!positive && <ArrowDownLeft className="size-5" />}
            {formatMoney(native, currency)}
            {showEur && (
              <span className="text-lg text-foreground/80">
                ({formatMoney(eur, "EUR")})
              </span>
            )}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Repeat className="size-3.5" />
          billed {sub.charge_count ?? 0}x
        </span>
        <span>·</span>
        <span>Last charged {lastCharged}</span>
      </div>
    </div>
  );
}
