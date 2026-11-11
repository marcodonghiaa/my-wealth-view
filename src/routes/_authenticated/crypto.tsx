import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Bitcoin, Coins } from "lucide-react";
import { colorsForAssets } from "@/lib/crypto-colors";
import { supabase } from "@/integrations/supabase/client";
import { currentValueEur, isEditableCryptoSource, priceEur } from "@/lib/holdings";
import { AddHoldingPanel } from "@/components/holdings/add-holding-panel";
import { SoldHoldings } from "@/components/holdings/sold-holdings";
import { EditHolding } from "@/components/holdings/edit-holding";
import { HeadlineFigure } from "@/components/headline-figure";
import { ShareBar } from "@/components/share-bar";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { GroupedList } from "@/components/ui/grouped-list";
import { RangeChange, ValueHistoryChart } from "@/components/value-history";
import { DetailRow, HoldingRow } from "@/components/holdings/holding-row";
import { InvestingSwitch } from "@/components/investing-switch";
import { EmptyState } from "@/components/empty-state";
import { useValueHistory } from "@/lib/use-value-history";
import { usePerformance } from "@/lib/use-performance";
import {
  PerformanceNotice,
  ReturnCell,
  ReturnText,
  TradesImport,
} from "@/components/performance/performance-section";
import { formatDay } from "@/lib/date";
import { formatEur, formatUsd } from "@/lib/transactions";

export const Route = createFileRoute("/_authenticated/crypto")({
  head: () => ({
    meta: [
      { title: "Crypto — Alopex" },
      {
        name: "description",
        content: "Track your cryptocurrency holdings and allocation.",
      },
      { property: "og:title", content: "Crypto — Alopex" },
      {
        property: "og:description",
        content: "Track your cryptocurrency holdings and allocation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CryptoPage,
});

interface CryptoRow {
  asset_symbol: string | null;
  name: string | null;
  amount: number | null;
  source: string | null;
  snapshot_date: string | null;
  price_usd: number | null;
  value_usd: number | null;
  value_eur: number | null;
  price_eur?: number | null;
}

interface AssetGroup {
  symbol: string;
  name: string;
  amount: number;
  priceUsd: number | null;
  priceEur: number | null;
  valueEur: number;
  bySource: Array<{ source: string; amount: number; valueEur: number }>;
}

async function fetchCrypto(): Promise<Array<CryptoRow>> {
  const { data, error } = await supabase
    .from("v_crypto_latest")
    .select("asset_symbol,name,amount,source,snapshot_date,price_usd,value_usd,value_eur")
    .order("value_eur", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<CryptoRow>;
}

// EUR like every other figure on the page; USD only when the snapshot has no rate to convert with.
function formatPrice(asset: AssetGroup): string {
  if (asset.priceEur != null) return formatEur(asset.priceEur);
  return asset.priceUsd != null ? formatUsd(asset.priceUsd) : "—";
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-IE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(value);
}

/** Merge per-source rows for the same asset into one line, keeping the
 * per-source split for display (e.g. BTC held in both Ledger and Coinbase). */
function groupBySymbol(rows: Array<CryptoRow>): Array<AssetGroup> {
  const bySymbol = new Map<string, AssetGroup>();
  for (const row of rows) {
    const symbol = row.asset_symbol ?? "—";
    const existing = bySymbol.get(symbol);
    const amount = row.amount ?? 0;
    const valueEur = row.value_eur ?? 0;
    if (existing) {
      existing.amount += amount;
      existing.valueEur += valueEur;
      existing.priceEur ??= row.price_eur ?? null; // first source that has a rate
      existing.bySource.push({ source: row.source ?? "—", amount, valueEur });
    } else {
      bySymbol.set(symbol, {
        symbol,
        name: row.name ?? symbol,
        amount,
        priceUsd: row.price_usd,
        priceEur: row.price_eur ?? null,
        valueEur,
        bySource: [{ source: row.source ?? "—", amount, valueEur }],
      });
    }
  }
  return Array.from(bySymbol.values()).sort((a, b) => b.valueEur - a.valueEur);
}

function CryptoPage() {
  const query = useQuery({
    queryKey: ["crypto-latest"],
    queryFn: fetchCrypto,
  });

  // Sold coins (amount 0) drop out; values follow an amount edited since the last price sync.
  const rows = useMemo(
    () =>
      (query.data ?? [])
        .filter((row) => row.amount !== 0)
        .map((row) => {
          // price_eur uses the snapshot's own value_eur/value_usd rate, before the rescale below.
          const snapshot = {
            price: row.price_usd,
            valueAtPrice: row.value_usd,
            valueEur: row.value_eur,
          };
          return {
            ...row,
            price_eur: priceEur(snapshot),
            value_eur:
              row.amount == null
                ? row.value_eur
                : currentValueEur({ ...snapshot, quantity: row.amount }),
          };
        }),
    [query.data],
  );
  const assets = useMemo(() => groupBySymbol(rows), [rows]);
  const assetColors = useMemo(() => colorsForAssets(assets.map((a) => a.symbol)), [assets]);

  const totalEur = useMemo(() => assets.reduce((sum, a) => sum + a.valueEur, 0), [assets]);

  // Scrubbing shows that day's value; otherwise today's, from the coins below.
  const history = useValueHistory("crypto_total_eur", totalEur);
  const { scrubbed } = history;
  const perf = usePerformance(history.chartData.at(-1)?.snapshot_date, "crypto");

  return (
    <div className="mx-auto max-w-5xl px-4 pt-4 pb-8 sm:px-8 md:py-12">
      <InvestingSwitch current="/crypto" />
      <header className="mb-3 text-[0.9375rem] font-medium text-muted-foreground">
        <h1 className="inline">Crypto</h1>
        {scrubbed && <span> · {formatDay(scrubbed.snapshot_date)}</span>}
      </header>

      {query.isError && (
        <Alert className="mb-6">Couldn't load crypto data: {query.error.message}</Alert>
      )}

      {history.error && (
        <Alert className="mb-6">Couldn't load your crypto history: {history.error.message}</Alert>
      )}

      {/* Headline: total value, its change over the chart range, then notices about returns */}
      <section aria-label="Total crypto value" className="mb-6">
        <div className="min-h-16" aria-live="polite">
          {query.isPending ? (
            <Skeleton className="h-16 w-72" />
          ) : (
            <HeadlineFigure value={history.shownEur} currency="EUR" />
          )}
        </div>
        {!query.isPending && <RangeChange {...history} />}
        {!query.isPending && <PerformanceNotice perf={perf} />}
      </section>

      {/* Chart: crypto value over time; scrub it to read any day */}
      <ValueHistoryChart history={history} title="Crypto value over time" />

      {/* How it splits by coin */}
      <section aria-label="Allocation by holding" className="mb-6">
        {!query.isPending && assets.length > 0 && (
          <div>
            <ShareBar
              title="Allocation by holding"
              shares={assets.map((a, i) => ({
                label: a.symbol,
                value: a.valueEur,
                color: assetColors[i] ?? "var(--color-muted-foreground)",
              }))}
            />
          </div>
        )}
        <p className="mt-4 max-w-2xl text-sm text-muted-foreground">Coinbase syncs daily.</p>
      </section>

      {query.isPending ? (
        <>
          <Skeleton className="mb-6 h-80" />
          <Skeleton className="h-64" />
        </>
      ) : assets.length === 0 ? (
        <EmptyState
          className="rounded-lg bg-card"
          title="No coins yet."
          hint="Search for your first one below."
        />
      ) : (
        <>
          {/* Desktop table */}
          <section className="hidden overflow-hidden rounded-lg bg-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium sm:px-5">Holding</th>
                    <th className="px-4 py-3 font-medium sm:px-5">Amount</th>
                    <th className="px-4 py-3 font-medium sm:px-5">Price</th>
                    <th className="px-4 py-3 text-right font-medium sm:px-5">Return</th>
                    <th className="px-4 py-3 text-right font-medium sm:px-5">Value</th>
                    <th className="w-14 px-2 py-3">
                      <span className="sr-only">Edit</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {assets.map((asset, i) => {
                    return (
                      <tr key={asset.symbol}>
                        <td className="px-4 py-3 sm:px-5">
                          <div className="flex items-center gap-3">
                            <CoinAvatar symbol={asset.symbol} color={assetColors[i]} />
                            <div className="min-w-0">
                              <div className="font-medium text-foreground">{asset.name}</div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {asset.symbol}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 sm:px-5">
                          <div className="font-figure text-foreground">
                            {formatAmount(asset.amount)} {asset.symbol}
                          </div>
                          {asset.bySource.length > 1 && (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {asset.bySource.map((s) => (
                                <span
                                  key={s.source}
                                  className="inline-flex items-center rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                                >
                                  {s.source}: {formatAmount(s.amount)}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-figure text-foreground sm:px-5">
                          {formatPrice(asset)}
                        </td>
                        <td className="px-4 py-3 text-right sm:px-5">
                          <ReturnCell
                            perf={perf}
                            holdingKey={asset.symbol}
                            name={asset.name}
                            quantity={asset.amount}
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-figure text-foreground sm:px-5">
                          {formatEur(asset.valueEur)}
                        </td>
                        <td className="px-2 py-1 text-right">
                          <AssetEdits asset={asset} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Mobile rows: coin and amount left, value and return right; tap for price and edit */}
          <GroupedList className="md:hidden">
            {assets.map((asset, i) => (
              <HoldingRow
                key={asset.symbol}
                avatar={<CoinAvatar symbol={asset.symbol} color={assetColors[i]} />}
                name={asset.name}
                amount={
                  <span className="font-figure">
                    {formatAmount(asset.amount)} {asset.symbol}
                  </span>
                }
                value={formatEur(asset.valueEur)}
                returnText={<ReturnText perf={perf} holdingKey={asset.symbol} />}
              >
                <DetailRow label="Price">
                  <span className="font-figure">{formatPrice(asset)}</span>
                </DetailRow>
                <DetailRow label="Return">
                  <ReturnCell
                    perf={perf}
                    holdingKey={asset.symbol}
                    name={asset.name}
                    quantity={asset.amount}
                  />
                </DetailRow>
                {/* One line per source; the ones you entered yourself can be edited. */}
                {asset.bySource.map((s) => (
                  <DetailRow key={s.source} label={s.source}>
                    <span className="font-figure">
                      {formatAmount(s.amount)} {asset.symbol}
                    </span>
                    {isEditableCryptoSource(s.source) && (
                      <EditHolding
                        target={{ kind: "crypto", symbol: asset.symbol, source: s.source }}
                        name={
                          asset.bySource.length > 1 ? `${asset.name} (${s.source})` : asset.name
                        }
                        quantity={s.amount}
                      />
                    )}
                  </DetailRow>
                ))}
              </HoldingRow>
            ))}
          </GroupedList>
        </>
      )}

      {!query.isPending && <TradesImport perf={perf} />}

      {/* Coinbase coins come back on their own when the sync sees them again. */}
      <SoldHoldings
        items={(query.data ?? []).flatMap((row) =>
          row.amount === 0 && row.asset_symbol && row.source && isEditableCryptoSource(row.source)
            ? [
                {
                  key: `${row.asset_symbol}:${row.source}`,
                  name: `${row.name ?? row.asset_symbol} (${row.source})`,
                  target: { kind: "crypto" as const, symbol: row.asset_symbol, source: row.source },
                },
              ]
            : [],
        )}
      />

      {!query.isPending && (
        <div className="mt-6">
          <AddHoldingPanel kind="crypto" defaultOpen={assets.length === 0} />
        </div>
      )}
    </div>
  );
}

// One edit control per source you entered yourself; Coinbase amounts come from the sync.
function AssetEdits({ asset }: { asset: AssetGroup }) {
  const editable = asset.bySource.filter((s) => isEditableCryptoSource(s.source));
  return (
    <>
      {editable.map((s) => (
        <EditHolding
          key={s.source}
          target={{ kind: "crypto", symbol: asset.symbol, source: s.source }}
          name={asset.bySource.length > 1 ? `${asset.name} (${s.source})` : asset.name}
          quantity={s.amount}
        />
      ))}
    </>
  );
}

// Round coin icon tinted in the coin's allocation colour; no third-party logos, so holdings stay private.
function CoinAvatar({ symbol, color }: { symbol: string; color: string | undefined }) {
  const Icon = symbol === "BTC" ? Bitcoin : Coins;
  const tint = color ?? "var(--color-muted-foreground)";
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-full"
      style={{
        color: tint,
        backgroundColor: `color-mix(in oklab, ${tint} 16%, var(--color-card))`,
      }}
    >
      <Icon className="size-[1.125rem]" strokeWidth={2} />
    </span>
  );
}
