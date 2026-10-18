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
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { trendSummary } from "@/lib/chart-summary";
import { supabase } from "@/integrations/supabase/client";
import { WelcomeCard } from "@/components/import/welcome-card";
import { AllocationChart } from "@/components/allocation-chart";
import { SegmentedControl } from "@/components/segmented-control";
import { axisDateFormatter, formatISODate } from "@/lib/date";
import {
  changeOver,
  chartPoints,
  monthAgo,
  withHistory,
  yearStart,
  type HistoryRow,
} from "@/lib/net-worth";
import { FriendsCreditLine } from "@/components/splitwise/balances-view";
import { friendsCreditEur as friendsCreditEurOf } from "@/lib/import/splitwise-balances";
import { useSplitwiseBalances } from "@/lib/use-splitwise-balances";
import { TONE_PILL, toneOf } from "@/lib/tone";

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

function withTrend<T extends NetWorthSnapshot>(
  snapshots: Array<T>,
): Array<T & { trend_eur: number | null }> {
  const window = Math.min(TREND_WINDOW_DAYS, Math.max(1, Math.floor(snapshots.length / 3)));
  return snapshots.map((row, i) => {
    const slice = snapshots.slice(Math.max(0, i + 1 - window), i + 1);
    const avg = slice.reduce((sum, r) => sum + r.total_eur, 0) / slice.length;
    return { ...row, trend_eur: avg };
  });
}

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Net Worth — MyFinances" },
      {
        name: "description",
        content: "Track your net worth over time with daily snapshots and currency conversion.",
      },
      { property: "og:title", content: "Net Worth — MyFinances" },
      {
        property: "og:description",
        content: "Track your net worth over time with daily snapshots and currency conversion.",
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
  const { data, error } = await supabase
    .from("v_net_worth_daily")
    .select("snapshot_date,total_eur,bank_total_eur,portfolio_total_eur,crypto_total_eur")
    .order("snapshot_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<NetWorthSnapshot>;
}

async function fetchHistory(): Promise<Array<HistoryRow>> {
  const { data, error } = await supabase
    .from("net_worth_history")
    .select(
      "snapshot_date,stocks_eur,bonds_eur,crypto_eur,cash_eur,other_eur,liabilities_eur,total_eur",
    )
    .order("snapshot_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<HistoryRow>;
}

async function fetchLatestFxRates(): Promise<Record<string, FxRate>> {
  // Latest fx_rates row per non-EUR currency.
  const { data, error } = await supabase
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

export function NetWorthPage() {
  const [currency, setCurrency] = useState<Currency>("EUR");

  const netWorthQuery = useQuery({
    queryKey: ["net-worth-daily"],
    queryFn: fetchNetWorth,
  });
  // Optional extra: absent table or empty history just means no pre-snapshot data.
  const historyQuery = useQuery({ queryKey: ["net-worth-history"], queryFn: fetchHistory });
  const fxQuery = useQuery({
    queryKey: ["fx-rates-latest"],
    queryFn: fetchLatestFxRates,
    staleTime: 5 * 60_000,
  });

  const snapshots = useMemo(() => netWorthQuery.data ?? [], [netWorthQuery.data]);
  const chartData = useMemo(
    () => withTrend(chartPoints(withHistory(historyQuery.data ?? [], snapshots))),
    [historyQuery.data, snapshots],
  );
  const chartFirst = chartData.at(0);
  const latest = snapshots.at(-1);
  const previous = snapshots.at(-2);

  const friends = useSplitwiseBalances();

  const rateToEur = useMemo(() => {
    if (currency === "EUR") return 1;
    return fxQuery.data?.[currency]?.rate_to_eur ?? null;
  }, [currency, fxQuery.data]);

  // Conversion: value in target currency = total_eur / rate_to_eur(target).
  const headline = latest != null && rateToEur != null ? latest.total_eur / rateToEur : null;

  const friendsCreditEur = useMemo(
    () => friendsCreditEurOf(friends.rows, friends.rate),
    [friends.rows, friends.rate],
  );

  const dayChange =
    latest != null && previous != null && previous.total_eur !== 0
      ? (latest.total_eur - previous.total_eur) / previous.total_eur
      : null;

  // Monthly and YTD read from the merged series so they reach back into imported history.
  const series = useMemo(
    () => withHistory(historyQuery.data ?? [], snapshots),
    [historyQuery.data, snapshots],
  );
  const latestIso = series.at(-1)?.snapshot_date;
  const monthChange = latestIso ? changeOver(series, monthAgo(latestIso)) : null;
  const ytdChange = latestIso ? changeOver(series, yearStart(latestIso)) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      {/* Header */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="ios-large-title">Net Worth</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Daily snapshot of everything you own, minus what you owe.
          </p>
        </div>

        <div className="w-full sm:w-auto">
          <SegmentedControl
            label="Display currency"
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            value={currency}
            onChange={setCurrency}
          />
        </div>
      </header>

      {netWorthQuery.isSuccess && historyQuery.isSuccess && (
        <WelcomeCard snapshots={snapshots.length} history={historyQuery.data.length} />
      )}

      {netWorthQuery.isError && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load your net worth data: {netWorthQuery.error.message}
        </div>
      )}

      {/* Headline card */}
      <section className="mb-6 rounded-2xl bg-card p-5 card-ring sm:p-7">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted-foreground">
          Total net worth
          {latest && (
            <span className="ml-1">
              · as of{" "}
              {new Date(`${latest.snapshot_date}T00:00:00`).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          )}
        </div>

        <div className="mt-3 min-h-16">
          {netWorthQuery.isPending ? (
            <div className="h-14 w-64 animate-pulse rounded-lg bg-muted" />
          ) : latest == null ? (
            <p className="text-sm text-muted-foreground">No snapshots available yet.</p>
          ) : headline != null ? (
            <p className="font-figure text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
              {formatMoney(headline, currency)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No {currency} exchange rate available yet.
            </p>
          )}
          {currency !== "EUR" && headline != null && rateToEur != null && (
            <p className="mt-2 text-xs text-muted-foreground">
              Converted at 1 {currency} = {rateToEur} EUR ({fxQuery.data?.[currency]?.date})
            </p>
          )}
        </div>

        {rateToEur != null && (
          <FriendsCreditLine
            creditEur={friendsCreditEur}
            netWorthEur={latest?.total_eur ?? null}
            format={(eur) => formatMoney(eur / rateToEur, currency)}
          />
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <ChangePill label="daily" value={dayChange} />
          <ChangePill label="monthly" value={monthChange} />
          <ChangePill label="YTD" value={ytdChange} />
        </div>
      </section>

      {/* Chart card */}
      <section className="rounded-2xl bg-card p-4 card-ring sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-2">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Net worth over time</h2>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <LegendDot color="var(--color-chart-1)" label="Bank" />
            <LegendDot color="var(--color-chart-2)" label="Portfolio" />
            <LegendDot color="var(--color-chart-3)" label="Crypto" />
            <LegendDot color="var(--color-foreground)" label="Trend" dashed />
            {chartData.some((p) => p.estimated_eur != null) && (
              <LegendDot
                color="var(--color-muted-foreground)"
                label="No data (straight line)"
                dashed
              />
            )}
          </div>
        </div>
        <div
          className="h-80 w-full"
          role="img"
          aria-label={
            chartFirst && latest
              ? trendSummary("Net worth over time", chartFirst.total_eur, latest.total_eur, (v) =>
                  formatMoney(v, "EUR"),
                )
              : "Net worth over time"
          }
        >
          {netWorthQuery.isPending ? (
            <div className="h-full w-full animate-pulse rounded-xl bg-muted/50" />
          ) : snapshots.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No data to chart yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid
                  strokeDasharray="3 6"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(ts: number) =>
                    axisDateFormatter(
                      chartFirst?.snapshot_date,
                      latest?.snapshot_date,
                    )(formatISODate(new Date(ts)))
                  }
                  tick={{
                    fill: "var(--color-muted-foreground)",
                    fontSize: 11,
                  }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={40}
                  interval="preserveStartEnd"
                />
                <YAxis
                  width={70}
                  tickFormatter={(v: number) => (v >= 1000 ? `€${Math.round(v / 1000)}k` : `€${v}`)}
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
                  type="linear"
                  dataKey="estimated_eur"
                  name="Estimate"
                  stroke="var(--color-muted-foreground)"
                  strokeWidth={1.5}
                  strokeDasharray="2 4"
                  dot={false}
                  activeDot={false}
                  connectNulls
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

      <AllocationChart history={historyQuery.data ?? []} />
    </div>
  );
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
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

// Moves under half a percent are noise: show them without alarm colour.
const NOISE_BAND = 0.005;

function ChangePill({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
        TONE_PILL[toneOf(value, NOISE_BAND)]
      }`}
    >
      <Icon className="size-3.5" />
      <span className="font-figure">
        {value >= 0 ? "+" : ""}
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
  label?: number;
}) {
  if (!active || !payload?.length || label == null) return null;
  const point = payload.at(0)?.payload;
  if (!point) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground">
        {new Date(label).toLocaleDateString("en-GB", {
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
        <TooltipRow
          color="var(--color-chart-2)"
          label="Portfolio"
          value={point.portfolio_total_eur}
        />
        <TooltipRow color="var(--color-chart-3)" label="Crypto" value={point.crypto_total_eur} />
        {point.trend_eur != null && (
          <TooltipRow color="var(--color-foreground)" label="Trend" value={point.trend_eur} />
        )}
      </div>
    </div>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="inline-block size-1.5 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="font-figure text-foreground">{formatMoney(value, "EUR")}</span>
    </div>
  );
}
