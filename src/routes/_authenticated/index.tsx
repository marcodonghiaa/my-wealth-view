import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
import { getSupabase } from "@/integrations/supabase/client";

export type NetWorthSnapshot = {
  snapshot_date: string;
  total_eur: number;
  bank_total_eur: number;
  portfolio_total_eur: number;
  crypto_total_eur: number;
};
export type FxRate = { date: string; currency: string; rate_to_eur: number };

// Trailing simple moving average, capped at 365 days but shrinking to a
// fraction of however much history actually exists so the trend line is
// still visible while the dataset is young (rather than a strict 12-month
// window that would stay empty for the first year of usage).
const TREND_WINDOW_DAYS = 365;

function withTrend(
  snapshots: Array<NetWorthSnapshot>,
): Array<NetWorthSnapshot & { trend_eur: number | null }> {
  const window = Math.min(
    TREND_WINDOW_DAYS,
    Math.max(1, Math.floor(snapshots.length / 3)),
  );
  return snapshots.map((row, i) => {
    const slice = snapshots.slice(Math.max(0, i + 1 - window), i + 1);
    const avg =
      slice.reduce((sum, r) => sum + r.total_eur, 0) / slice.length;
    return { ...row, trend_eur: avg };
  });
}


export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Net Worth — Finance Dashboard" },
      {
        name: "description",
        content:
          "Track your net worth over time with daily snapshots and currency conversion.",
      },
      { property: "og:title", content: "Net Worth — Finance Dashboard" },
      {
        property: "og:description",
        content:
          "Track your net worth over time with daily snapshots and currency conversion.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NetWorthPage,
});

type Currency = "EUR" | "USD" | "GBP";
const CURRENCIES: Array<Currency> = ["EUR", "USD", "GBP"];

async function fetchNetWorth(): Promise<Array<NetWorthSnapshot>> {
  const { data, error } = await getSupabase()
    .from("v_net_worth_daily")
    .select(
      "snapshot_date,total_eur,bank_total_eur,portfolio_total_eur,crypto_total_eur",
    )
    .order("snapshot_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<NetWorthSnapshot>;
}

async function fetchLatestFxRates(): Promise<Record<string, FxRate>> {
  // Latest fx_rates row per non-EUR currency.
  const { data, error } = await getSupabase()
    .from("fx_rates")
    .select("date,currency,rate_to_eur")
    .order("date", { ascending: false })
    .limit(500);
  if (error) throw error;
  const latest: Record<string, FxRate> = {};
  for (const row of (data ?? []) as Array<FxRate>) {
    if (!(row.currency in latest)) latest[row.currency] = row;
  }
  return latest;
}

function formatMoney(value: number, currency: Currency): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatAxisDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

export function NetWorthPage() {
  const [currency, setCurrency] = useState<Currency>("EUR");

  const netWorthQuery = useQuery({
    queryKey: ["net-worth-daily"],
    queryFn: fetchNetWorth,
  });
  const fxQuery = useQuery({
    queryKey: ["fx-rates-latest"],
    queryFn: fetchLatestFxRates,
    staleTime: 5 * 60_000,
  });

  const snapshots = netWorthQuery.data ?? [];
  const chartData = useMemo(() => withTrend(snapshots), [snapshots]);
  const latest = snapshots.at(-1);
  const previous = snapshots.at(-2);

  const rateToEur = useMemo(() => {
    if (currency === "EUR") return 1;
    return fxQuery.data?.[currency]?.rate_to_eur ?? null;
  }, [currency, fxQuery.data]);

  // Conversion: value in target currency = total_eur / rate_to_eur(target).
  const headline =
    latest != null && rateToEur != null ? latest.total_eur / rateToEur : null;

  const dayChange =
    latest != null && previous != null && previous.total_eur !== 0
      ? (latest.total_eur - previous.total_eur) / previous.total_eur
      : null;

  const first = snapshots.at(0);
  const periodChange =
    latest != null && first != null && first.total_eur !== 0
      ? (latest.total_eur - first.total_eur) / first.total_eur
      : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      {/* Header */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Net Worth
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Daily snapshot of everything you own, minus what you owe.
          </p>
        </div>

        {/* Currency toggle */}
        <div
          role="group"
          aria-label="Display currency"
          className="flex rounded-lg border bg-card p-1"
        >
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              aria-pressed={currency === c}
              className={`min-h-11 rounded-md px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-colors ${
                currency === c
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </header>

      {netWorthQuery.isError && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load your net worth data: {netWorthQuery.error.message}
        </div>
      )}

      {/* Headline card */}
      <section className="mb-6 rounded-2xl border bg-card p-6 card-ring sm:p-8">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <Wallet className="size-4 text-primary" />
          Total net worth
          {latest && (
            <span className="ml-1">
              · as of{" "}
              {new Date(`${latest.snapshot_date}T00:00:00`).toLocaleDateString(
                "en-GB",
                { day: "numeric", month: "long", year: "numeric" },
              )}
            </span>
          )}
        </div>

        <div className="mt-3 min-h-16">
          {netWorthQuery.isPending ? (
            <div className="h-14 w-64 animate-pulse rounded-lg bg-muted" />
          ) : latest == null ? (
            <p className="text-sm text-muted-foreground">
              No snapshots available yet.
            </p>
          ) : headline != null ? (
            <p className="font-figure text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
              {formatMoney(headline, currency)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No {currency} exchange rate available yet.
            </p>
          )}
          {currency !== "EUR" && headline != null && rateToEur != null && (
            <p className="mt-2 text-xs text-muted-foreground">
              Converted at 1 {currency} = {rateToEur} EUR (
              {fxQuery.data?.[currency]?.date})
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <ChangePill label="vs previous day" value={dayChange} />
          <ChangePill label="all time" value={periodChange} />
        </div>
      </section>

      {/* Chart card */}
      <section className="rounded-2xl border bg-card p-4 card-ring sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-2">
          <h2 className="text-sm font-semibold text-foreground">
            Net worth over time
          </h2>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <LegendDot color="var(--color-chart-1)" label="Bank" />
            <LegendDot color="var(--color-chart-2)" label="Portfolio" />
            <LegendDot color="var(--color-chart-3)" label="Crypto" />
            <LegendDot color="var(--color-foreground)" label="Trend" dashed />
          </div>
        </div>
        <div className="h-80 w-full">
          {netWorthQuery.isPending ? (
            <div className="h-full w-full animate-pulse rounded-xl bg-muted/50" />
          ) : snapshots.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No data to chart yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 6"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="snapshot_date"
                  tickFormatter={formatAxisDate}
                  tick={{
                    fill: "var(--color-muted-foreground)",
                    fontSize: 11,
                  }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={40}
                />
                <YAxis
                  width={70}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `€${Math.round(v / 1000)}k` : `€${v}`
                  }
                  tick={{
                    fill: "var(--color-muted-foreground)",
                    fontSize: 11,
                  }}
                  tickLine={false}
                  axisLine={false}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  content={<NetWorthTooltip />}
                  cursor={{
                    stroke: "var(--color-primary)",
                    strokeOpacity: 0.3,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="bank_total_eur"
                  name="Bank"
                  stackId="networth"
                  stroke="var(--color-chart-1)"
                  strokeWidth={1.5}
                  fill="var(--color-chart-1)"
                  fillOpacity={0.55}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="portfolio_total_eur"
                  name="Portfolio"
                  stackId="networth"
                  stroke="var(--color-chart-2)"
                  strokeWidth={1.5}
                  fill="var(--color-chart-2)"
                  fillOpacity={0.55}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="crypto_total_eur"
                  name="Crypto"
                  stackId="networth"
                  stroke="var(--color-chart-3)"
                  strokeWidth={1.5}
                  fill="var(--color-chart-3)"
                  fillOpacity={0.55}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="trend_eur"
                  name="Trend"
                  stroke="var(--color-foreground)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={false}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  );
}

function LegendDot({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block size-2 rounded-full"
        style={
          dashed
            ? {
                background: "transparent",
                border: `1.5px dashed ${color}`,
              }
            : { backgroundColor: color }
        }
      />
      {label}
    </span>
  );
}

function ChangePill({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  if (value == null) return null;
  const positive = value >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
        positive
          ? "border-positive/30 bg-positive/10 text-positive"
          : "border-negative/30 bg-negative/10 text-negative"
      }`}
    >
      <Icon className="size-3.5" />
      <span className="font-figure">
        {positive ? "+" : ""}
        {(value * 100).toFixed(2)}%
      </span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

interface TooltipEntry {
  payload?: NetWorthSnapshot & { trend_eur: number | null };
}

function NetWorthTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<TooltipEntry>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  const point = payload.at(0)?.payload;
  if (!point) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground">
        {new Date(`${label}T00:00:00`).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </p>
      <p className="font-figure mt-0.5 text-sm font-semibold text-foreground">
        {formatMoney(point.total_eur, "EUR")}
      </p>
      <div className="mt-2 space-y-0.5 text-xs">
        <TooltipRow color="var(--color-chart-1)" label="Bank" value={point.bank_total_eur} />
        <TooltipRow color="var(--color-chart-2)" label="Portfolio" value={point.portfolio_total_eur} />
        <TooltipRow color="var(--color-chart-3)" label="Crypto" value={point.crypto_total_eur} />
        {point.trend_eur != null && (
          <TooltipRow color="var(--color-foreground)" label="Trend" value={point.trend_eur} />
        )}
      </div>
    </div>
  );
}

function TooltipRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span
          className="inline-block size-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        {label}
      </span>
      <span className="font-figure text-foreground">
        {formatMoney(value, "EUR")}
      </span>
    </div>
  );
}
