import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { trendSummary } from "@/lib/chart-summary";
import { supabase } from "@/integrations/supabase/client";
import { WelcomeCard } from "@/components/import/welcome-card";
import { Activity } from "lucide-react";
import { AllocationChart } from "@/components/allocation-chart";
import { HeadlineFigure } from "@/components/headline-figure";
import { formatDay } from "@/lib/date";
import { ValueChart } from "@/components/value-chart";
import { SegmentedControl } from "@/components/segmented-control";
import {
  CHART_RANGES,
  RANGE_LABEL,
  chartPoints,
  inRange,
  withHistory,
  type ChartRange,
} from "@/lib/net-worth";
import { fetchHistory, fetchNetWorth, fetchReconstructed } from "@/lib/net-worth-queries";
import { TONE_TEXT, toneOf } from "@/lib/tone";

export type NetWorthSnapshot = {
  snapshot_date: string;
  total_eur: number;
  bank_total_eur: number;
  portfolio_total_eur: number;
  crypto_total_eur: number;
};
export type FxRate = { date: string; currency: string; rate_to_eur: number };

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

function formatFxDate(iso: string | undefined): string {
  if (!iso) return "latest";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function formatMoney(value: number, currency: Currency): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function NetWorthPage() {
  const [currency, setCurrency] = useState<Currency>("EUR");
  const [range, setRange] = useState<ChartRange>("YTD");

  const netWorthQuery = useQuery({
    queryKey: ["net-worth-daily"],
    queryFn: fetchNetWorth,
  });
  // Optional extra: absent table or empty history just means no pre-snapshot data.
  const historyQuery = useQuery({ queryKey: ["net-worth-history"], queryFn: fetchHistory });
  const reconstructedQuery = useQuery({
    queryKey: ["net-worth-reconstructed"],
    queryFn: fetchReconstructed,
  });
  const fxQuery = useQuery({
    queryKey: ["fx-rates-latest"],
    queryFn: fetchLatestFxRates,
    staleTime: 5 * 60_000,
  });

  const snapshots = useMemo(() => netWorthQuery.data ?? [], [netWorthQuery.data]);
  const chartData = useMemo(
    () =>
      inRange(
        chartPoints(
          withHistory(historyQuery.data ?? [], snapshots, undefined, reconstructedQuery.data ?? []),
        ),
        range,
      ),
    [historyQuery.data, snapshots, reconstructedQuery.data, range],
  );
  const chartFirst = chartData.at(0);
  const latest = snapshots.at(-1);
  const previous = snapshots.at(-2);
  const dayChange =
    latest != null && previous != null && previous.total_eur !== 0
      ? (latest.total_eur - previous.total_eur) / previous.total_eur
      : null;

  // These feed the chart history and other currencies; say so when one fails.
  const extraError = [historyQuery, reconstructedQuery, fxQuery].find((q) => q.isError)?.error;

  const rateToEur = useMemo(() => {
    if (currency === "EUR") return 1;
    return fxQuery.data?.[currency]?.rate_to_eur ?? null;
  }, [currency, fxQuery.data]);

  // Conversion: value in target currency = total_eur / rate_to_eur(target).
  const headline = latest != null && rateToEur != null ? latest.total_eur / rateToEur : null;

  // Scrubbing the chart rewrites the headline to that day; leaving it shows today again.
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const scrubbed = scrubIndex != null ? chartData.at(scrubIndex) : undefined;

  const shownEur = scrubbed?.total_eur ?? latest?.total_eur ?? null;
  const shownValue = shownEur != null && rateToEur != null ? shownEur / rateToEur : null;
  const rangeDeltaEur = chartFirst && shownEur != null ? shownEur - chartFirst.total_eur : null;
  const rangeChange =
    rangeDeltaEur != null && chartFirst && chartFirst.total_eur !== 0
      ? rangeDeltaEur / Math.abs(chartFirst.total_eur)
      : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-3 flex items-center justify-between gap-4">
        <div className="text-[0.9375rem] font-medium text-muted-foreground">
          <h1 className="inline">Net worth</h1>
          {scrubbed && <span> · {formatDay(scrubbed.snapshot_date)}</span>}
        </div>
        <div className="shrink-0">
          <SegmentedControl
            label="Display currency"
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            value={currency}
            onChange={setCurrency}
          />
        </div>
      </header>

      {netWorthQuery.isSuccess && historyQuery.isSuccess && (
        <WelcomeCard history={historyQuery.data.length} />
      )}

      {netWorthQuery.isError && (
        <div
          role="alert"
          className="mb-6 rounded-2xl bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load your net worth data: {netWorthQuery.error.message}
        </div>
      )}

      {extraError && (
        <div
          role="alert"
          className="mb-6 rounded-2xl bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Some data couldn't load, so charts and totals may be incomplete: {extraError.message}
        </div>
      )}

      {/* Headline: the number is the screen */}
      <section aria-label="Net worth today" className="mb-6">
        <div className="min-h-16" aria-live="polite">
          {netWorthQuery.isPending || (currency !== "EUR" && fxQuery.isPending) ? (
            <div className="h-16 w-72 animate-pulse rounded-2xl bg-muted" />
          ) : latest == null ? (
            <p className="text-sm text-muted-foreground">
              No balances yet: connect a bank or add an investment.
            </p>
          ) : headline != null && shownValue != null ? (
            <HeadlineFigure value={shownValue} currency={currency} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No {currency} exchange rate available yet.
            </p>
          )}
        </div>

        {rangeDeltaEur != null && rangeChange != null && rateToEur != null && (
          <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-[0.9375rem]">
            <span
              className={`font-figure font-medium ${TONE_TEXT[toneOf(rangeChange, NOISE_BAND)]}`}
            >
              {rangeDeltaEur >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(rangeDeltaEur) / rateToEur, currency)} (
              {formatPercent(rangeChange)})
            </span>
            <span className="text-muted-foreground">
              {scrubbed && chartFirst
                ? `${formatDay(chartFirst.snapshot_date)} – ${formatDay(scrubbed.snapshot_date)}`
                : RANGE_LABEL[range]}
            </span>
          </p>
        )}

        {/* Today's context: hidden (space kept) while scrubbing a past day */}
        <div className={scrubbed ? "invisible" : undefined}>
          {dayChange != null && (
            <p className="mt-2 flex items-baseline gap-1.5 text-sm">
              <span className="text-muted-foreground">Today</span>
              <span
                className={`font-figure font-medium ${TONE_TEXT[toneOf(dayChange, NOISE_BAND)]}`}
              >
                {formatPercent(dayChange)}
              </span>
            </p>
          )}
          {currency !== "EUR" && headline != null && rateToEur != null && (
            <p className="mt-2 text-xs text-muted-foreground">
              Rate: 1 {currency} = {rateToEur.toFixed(4)} EUR · ECB,{" "}
              {formatFxDate(fxQuery.data?.[currency]?.date)}
            </p>
          )}
        </div>
      </section>

      {/* Chart: one line, no grid; scrub it to read any day */}
      <section aria-label="Net worth over time" className="mb-8">
        <div
          className="-mx-1 h-72 sm:h-80"
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
            <div className="h-full w-full animate-pulse rounded-2xl bg-muted/60" />
          ) : chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No data to chart yet.
            </div>
          ) : (
            <ValueChart
              data={chartData}
              dataKey="total_eur"
              name="Net worth"
              estimateKey="estimated_eur"
              onScrub={setScrubIndex}
            />
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            label="Chart range"
            options={CHART_RANGES.map((r) => ({ value: r, label: r }))}
            value={range}
            onChange={setRange}
          />
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {chartData.some((p) => p.estimated_eur != null) && (
              <LegendDot
                color="var(--color-muted-foreground)"
                label="No data (straight line)"
                dashed
              />
            )}
          </div>
        </div>
      </section>

      <AllocationChart
        history={historyQuery.data ?? []}
        snapshots={snapshots}
        reconstructed={reconstructedQuery.data ?? []}
        asOf={scrubbed?.snapshot_date}
        format={(eur) =>
          rateToEur != null ? formatMoney(eur / rateToEur, currency) : formatMoney(eur, "EUR")
        }
      />

      <Link
        to="/settings"
        hash="health"
        className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border px-5 text-[0.9375rem] font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Activity className="size-4 text-primary" />
        Health
      </Link>
    </div>
  );
}

function formatPercent(value: number, signed = true): string {
  const sign = signed ? (value > 0 ? "+" : value < 0 ? "−" : "") : "";
  return `${sign}${Math.abs(value * 100).toFixed(2)}%`;
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
