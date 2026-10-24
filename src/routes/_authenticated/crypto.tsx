import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Bitcoin } from "lucide-react";
import { shareSummary } from "@/lib/chart-summary";
import { colorsForAssets } from "@/lib/crypto-colors";
import { supabase } from "@/integrations/supabase/client";
import { currentValueEur, isEditableCryptoSource } from "@/lib/holdings";
import { AddHoldingPanel } from "@/components/holdings/add-holding-panel";
import { EditHolding } from "@/components/holdings/edit-holding";
import { formatEur, formatUsd } from "@/lib/transactions";

export const Route = createFileRoute("/_authenticated/crypto")({
  head: () => ({
    meta: [
      { title: "Crypto — MyFinances" },
      {
        name: "description",
        content: "Track your cryptocurrency holdings and allocation.",
      },
      { property: "og:title", content: "Crypto — MyFinances" },
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
}

interface AssetGroup {
  symbol: string;
  name: string;
  amount: number;
  priceUsd: number | null;
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
      existing.bySource.push({ source: row.source ?? "—", amount, valueEur });
    } else {
      bySymbol.set(symbol, {
        symbol,
        name: row.name ?? symbol,
        amount,
        priceUsd: row.price_usd,
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
        .map((row) =>
          row.amount == null
            ? row
            : {
                ...row,
                value_eur: currentValueEur({
                  quantity: row.amount,
                  price: row.price_usd,
                  valueAtPrice: row.value_usd,
                  valueEur: row.value_eur,
                }),
              },
        ),
    [query.data],
  );
  const assets = useMemo(() => groupBySymbol(rows), [rows]);
  const assetColors = useMemo(() => colorsForAssets(assets.map((a) => a.symbol)), [assets]);

  const totalEur = useMemo(() => assets.reduce((sum, a) => sum + a.valueEur, 0), [assets]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-8">
        <h1 className="ios-large-title">Crypto</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Your cryptocurrency holdings and allocation.
        </p>
      </header>

      {query.isError && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load crypto data: {query.error.message}
        </div>
      )}

      {/* Headline + allocation side by side */}
      <section className="mb-6 grid items-center gap-6 rounded-2xl border bg-card p-6 card-ring sm:p-8 md:grid-cols-2">
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <Bitcoin className="size-4 text-primary" />
            Total crypto value
          </div>

          <div className="mt-3 min-h-16">
            {query.isPending ? (
              <div className="h-14 w-64 animate-pulse rounded-lg bg-muted" />
            ) : (
              <p className="font-figure text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
                {formatEur(totalEur)}
              </p>
            )}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Coins you add here are priced every day; Coinbase syncs automatically. The same asset
            held in multiple places is combined into one line below.
          </p>
        </div>
        {!query.isPending && assets.length > 0 && (
          <div
            className="h-56 w-full md:h-64"
            role="img"
            aria-label={shareSummary(
              "Allocation by holding",
              assets.map((a) => ({ label: a.symbol, value: a.valueEur })),
            )}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={assets}
                  dataKey="valueEur"
                  nameKey="symbol"
                  innerRadius="55%"
                  outerRadius="80%"
                  paddingAngle={2}
                  cornerRadius={6}
                >
                  {assets.map((asset, i) => (
                    <Cell
                      key={i}
                      fill={assetColors[i]}
                      stroke="var(--color-card)"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CryptoTooltip totalEur={totalEur} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {!query.isPending && <AddHoldingPanel kind="crypto" defaultOpen={assets.length === 0} />}

      {query.isPending ? (
        <>
          <div className="mb-6 h-80 animate-pulse rounded-2xl bg-muted/50" />
          <div className="h-64 animate-pulse rounded-2xl bg-muted/50" />
        </>
      ) : assets.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border bg-card text-sm text-muted-foreground card-ring">
          No coins yet. Search for your first one above.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <section className="hidden overflow-hidden rounded-2xl border bg-card card-ring md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium sm:px-5">Holding</th>
                    <th className="px-4 py-3 font-medium sm:px-5">Amount</th>
                    <th className="px-4 py-3 font-medium sm:px-5">Price</th>
                    <th className="px-4 py-3 text-right font-medium sm:px-5">Value</th>
                    <th className="px-4 py-3 text-right font-medium sm:px-5">% of total</th>
                    <th className="w-14 px-2 py-3">
                      <span className="sr-only">Edit</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {assets.map((asset, i) => {
                    const percent = totalEur > 0 ? (asset.valueEur / totalEur) * 100 : 0;
                    return (
                      <tr key={asset.symbol}>
                        <td className="px-4 py-3 sm:px-5">
                          <div className="flex items-center gap-2 font-medium text-foreground">
                            <ColorDot color={assetColors[i]} />
                            {asset.name}
                          </div>
                          <div className="mt-0.5 pl-[1.125rem] text-xs text-muted-foreground">
                            {asset.symbol}
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
                                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                                >
                                  {s.source}: {formatAmount(s.amount)}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-figure text-foreground sm:px-5">
                          {asset.priceUsd != null ? formatUsd(asset.priceUsd) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-figure font-medium text-foreground sm:px-5">
                          {formatEur(asset.valueEur)}
                        </td>
                        <td className="px-4 py-3 text-right font-figure text-foreground sm:px-5">
                          {percent.toFixed(1)}%
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

          {/* Mobile cards */}
          <section className="space-y-3 md:hidden">
            {assets.map((asset, i) => {
              const percent = totalEur > 0 ? (asset.valueEur / totalEur) * 100 : 0;
              return (
                <div key={asset.symbol} className="rounded-2xl border bg-card p-4 card-ring">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <ColorDot color={assetColors[i]} />
                        {asset.name}
                      </div>
                      <div className="mt-0.5 pl-[1.125rem] text-xs text-muted-foreground">
                        {asset.symbol}
                      </div>
                    </div>
                    <AssetEdits asset={asset} />
                  </div>

                  {asset.bySource.length > 1 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {asset.bySource.map((s) => (
                        <span
                          key={s.source}
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {s.source}: {formatAmount(s.amount)}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Amount</div>
                      <div className="font-figure text-foreground">
                        {formatAmount(asset.amount)} {asset.symbol}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Price</div>
                      <div className="font-figure text-foreground">
                        {asset.priceUsd != null ? formatUsd(asset.priceUsd) : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Value</div>
                      <div className="font-figure font-medium text-foreground">
                        {formatEur(asset.valueEur)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">% of total</div>
                      <div className="font-figure text-foreground">{percent.toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        </>
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

function ColorDot({ color }: { color: string | undefined }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

interface TooltipPayloadItem {
  payload?: AssetGroup;
}

function CryptoTooltip({
  active,
  payload,
  totalEur,
}: {
  active?: boolean;
  payload?: Array<TooltipPayloadItem>;
  totalEur: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const asset = payload[0]?.payload;
  if (!asset) return null;
  const percent = totalEur > 0 ? ((asset.valueEur / totalEur) * 100).toFixed(1) : "0.0";
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-lg">
      <p className="max-w-xs truncate text-xs text-muted-foreground">{asset.name}</p>
      <p className="font-figure mt-0.5 text-sm font-semibold text-foreground">
        {formatEur(asset.valueEur)}
      </p>
      <p className="text-xs text-muted-foreground">{percent}% of crypto</p>
    </div>
  );
}
