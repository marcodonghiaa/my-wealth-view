import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChartPie,
  Layers,
  ScrollText,
  Shapes,
  type LucideIcon,
} from "lucide-react";
import { shortHoldingName } from "@/lib/holding-name";
import { supabase } from "@/integrations/supabase/client";
import { formatEur } from "@/lib/transactions";
import { currentValueEur } from "@/lib/holdings";
import { AddHoldingPanel } from "@/components/holdings/add-holding-panel";
import { EditHolding } from "@/components/holdings/edit-holding";
import { HeadlineFigure } from "@/components/headline-figure";
import { ShareBar } from "@/components/share-bar";
import { ValueHistoryChart } from "@/components/value-history";
import { useValueHistory } from "@/lib/use-value-history";
import { usePerformance } from "@/lib/use-performance";
import { PerformanceSummary, ReturnCell } from "@/components/performance/performance-section";
import { formatDay } from "@/lib/date";

export const Route = createFileRoute("/_authenticated/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio — MyFinances" },
      {
        name: "description",
        content: "Track your investment holdings and allocation.",
      },
      { property: "og:title", content: "Portfolio — MyFinances" },
      {
        property: "og:description",
        content: "Track your investment holdings and allocation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PortfolioPage,
});

interface PortfolioRow {
  isin: string | null;
  name: string | null;
  shares: number | null;
  broker_label: string | null;
  snapshot_date: string | null;
  price: number | null;
  currency: string | null;
  value_native: number | null;
  value_eur: number | null;
  asset_type: string | null;
}

const UNCLASSIFIED = "Other";

// Fixed per-type color so a type keeps its color as holdings change,
// rather than reassigning colors by array position like the old per-holding pie.
const TYPE_COLORS: Record<string, string> = {
  Stock: "var(--color-chart-1)",
  ETF: "var(--color-chart-2)",
  Fund: "var(--color-chart-3)",
  Bond: "var(--color-chart-4)",
  [UNCLASSIFIED]: "var(--color-chart-5)",
};

function colorForType(type: string): string {
  // UNCLASSIFIED is always a key in TYPE_COLORS -- defined right above.
  return TYPE_COLORS[type] ?? TYPE_COLORS[UNCLASSIFIED]!;
}

const TYPE_ICONS: Record<string, LucideIcon> = {
  Stock: Building2,
  ETF: Layers,
  Fund: ChartPie,
  Bond: ScrollText,
};

async function fetchPortfolio(): Promise<Array<PortfolioRow>> {
  const { data, error } = await supabase
    .from("v_portfolio_latest")
    .select(
      "isin,name,shares,broker_label,snapshot_date,price,currency,value_native,value_eur,asset_type",
    )
    .order("value_eur", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<PortfolioRow>;
}

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Intl.NumberFormat throws on a malformed ISO 4217 code -- fall back to
    // a plain number rather than crashing the whole page during render.
    return `${new Intl.NumberFormat("en-IE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)} ${currency}`;
  }
}

function formatShares(value: number): string {
  return new Intl.NumberFormat("en-IE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

interface TypeGroup {
  type: string;
  totalEur: number;
  holdings: Array<PortfolioRow>;
}

function PortfolioPage() {
  const query = useQuery({
    queryKey: ["portfolio-latest"],
    queryFn: fetchPortfolio,
  });

  // Sold holdings (0 shares) drop out; values follow a quantity edited since the last price sync.
  const holdings = useMemo(
    () =>
      (query.data ?? [])
        .filter((row) => row.shares !== 0)
        .map((row) =>
          row.shares == null
            ? row
            : {
                ...row,
                value_eur: currentValueEur({
                  quantity: row.shares,
                  price: row.price,
                  valueAtPrice: row.value_native,
                  valueEur: row.value_eur,
                }),
              },
        ),
    [query.data],
  );

  // Groups start collapsed: the header already carries the count, total and share.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleGroup = (type: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(type)) next.add(type);
      return next;
    });

  const totalEur = useMemo(
    () => holdings.reduce((sum, row) => sum + (row.value_eur ?? 0), 0),
    [holdings],
  );

  const groups = useMemo<Array<TypeGroup>>(() => {
    const byType = new Map<string, Array<PortfolioRow>>();
    for (const row of holdings) {
      const type = row.asset_type ?? UNCLASSIFIED;
      const list = byType.get(type) ?? [];
      list.push(row);
      byType.set(type, list);
    }
    return Array.from(byType.entries())
      .map(([type, rows]) => ({
        type,
        totalEur: rows.reduce((sum, r) => sum + (r.value_eur ?? 0), 0),
        holdings: rows,
      }))
      .sort((a, b) => b.totalEur - a.totalEur);
  }, [holdings]);

  // Scrubbing shows that day's value; otherwise today's, from the holdings below.
  const history = useValueHistory("portfolio_total_eur", totalEur);
  const { scrubbed } = history;
  const perf = usePerformance(history.chartData.at(-1)?.snapshot_date, "stock");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-3 text-[0.9375rem] font-medium text-muted-foreground">
        <h1 className="inline">Portfolio</h1>
        {scrubbed && <span> · {formatDay(scrubbed.snapshot_date)}</span>}
      </header>

      {query.isError && (
        <div
          role="alert"
          className="mb-6 rounded-2xl bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load portfolio data: {query.error.message}
        </div>
      )}

      {history.error && (
        <div
          role="alert"
          className="mb-6 rounded-2xl bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load your portfolio history: {history.error.message}
        </div>
      )}

      {/* Headline: total value and its change over the chart range */}
      <section aria-label="Total portfolio value" className="mb-6">
        <div className="min-h-16" aria-live="polite">
          {query.isPending ? (
            <div className="h-16 w-72 animate-pulse rounded-2xl bg-muted" />
          ) : (
            <HeadlineFigure value={history.shownEur} currency="EUR" />
          )}
        </div>
        {!query.isPending && <PerformanceSummary perf={perf} />}
      </section>

      {/* Chart: portfolio value over time; scrub it to read any day */}
      <ValueHistoryChart history={history} title="Portfolio value over time" />

      {/* How it splits by type */}
      {!query.isPending && holdings.length > 0 && totalEur > 0 && (
        <div className="mb-6">
          <ShareBar
            title="Allocation by type"
            shares={groups.map((g) => ({
              label: g.type,
              value: g.totalEur,
              color: colorForType(g.type),
            }))}
          />
        </div>
      )}

      {query.isPending ? (
        <>
          <div className="mb-6 h-80 animate-pulse rounded-2xl bg-muted/50" />
          <div className="h-64 animate-pulse rounded-2xl bg-muted/50" />
        </>
      ) : holdings.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-2xl bg-card text-sm text-muted-foreground">
          No investments yet. Search for your first one below.
        </div>
      ) : (
        <>
          {/* Holdings grouped by type */}
          <div className="divide-y overflow-hidden rounded-2xl bg-card">
            {groups.map((group) => {
              const percent = totalEur > 0 ? (group.totalEur / totalEur) * 100 : 0;
              const color = colorForType(group.type);
              const TypeIcon = TYPE_ICONS[group.type] ?? Shapes;
              const isOpen = expanded.has(group.type);
              return (
                <section key={group.type}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.type)}
                    aria-expanded={isOpen}
                    className={`flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent sm:px-5 ${isOpen ? "border-b" : ""}`}
                  >
                    <span
                      aria-hidden
                      className="flex size-10 shrink-0 items-center justify-center rounded-full"
                      style={{
                        color,
                        backgroundColor: `color-mix(in oklab, ${color} 16%, var(--color-card))`,
                      }}
                    >
                      <TypeIcon className="size-[1.125rem]" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.9375rem] font-medium text-foreground">
                        {group.type}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {group.holdings.length} holding
                        {group.holdings.length === 1 ? "" : "s"} · {percent.toFixed(1)}%
                      </span>
                    </span>
                    <span className="font-figure text-[0.9375rem] font-semibold text-foreground">
                      {formatEur(group.totalEur)}
                    </span>
                    <ChevronDown
                      aria-hidden
                      className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isOpen && (
                    <>
                      {/* Desktop table */}
                      <div className="hidden overflow-x-auto md:block">
                        <table className="w-full text-sm">
                          <thead className="border-y text-left text-xs font-medium text-muted-foreground">
                            <tr>
                              <th className="px-4 py-2.5 font-medium sm:px-5">Holding</th>
                              <th className="px-4 py-2.5 font-medium sm:px-5">Shares</th>
                              <th className="px-4 py-2.5 font-medium sm:px-5">Price</th>
                              <th className="px-4 py-2.5 text-right font-medium sm:px-5">Return</th>
                              <th className="px-4 py-2.5 text-right font-medium sm:px-5">Value</th>
                              <th className="px-4 py-2.5 text-right font-medium sm:px-5">
                                % of total
                              </th>
                              <th className="w-14 px-2 py-2.5">
                                <span className="sr-only">Edit</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {group.holdings.map((row, i) => {
                              const valueEur = row.value_eur ?? 0;
                              const rowPercent = totalEur > 0 ? (valueEur / totalEur) * 100 : 0;
                              return (
                                <tr key={row.isin ?? `${row.name ?? "row"}-${i}`}>
                                  <td className="px-4 py-3 sm:px-5">
                                    <div
                                      className="font-medium text-foreground"
                                      title={row.name ?? undefined}
                                    >
                                      {row.name ? shortHoldingName(row.name) : "—"}
                                    </div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">
                                      {row.broker_label ?? "—"}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 font-figure text-foreground sm:px-5">
                                    {row.shares != null ? formatShares(row.shares) : "—"}
                                  </td>
                                  <td className="px-4 py-3 font-figure text-foreground sm:px-5">
                                    {row.price != null && row.currency
                                      ? formatMoney(row.price, row.currency)
                                      : "—"}
                                  </td>
                                  <td className="px-4 py-3 text-right sm:px-5">
                                    <ReturnCell
                                      perf={perf}
                                      holdingKey={row.isin}
                                      name={row.name ?? row.isin ?? ""}
                                      quantity={row.shares ?? 0}
                                    />
                                  </td>
                                  <td className="px-4 py-3 text-right font-figure font-medium text-foreground sm:px-5">
                                    {formatEur(valueEur)}
                                  </td>
                                  <td className="px-4 py-3 text-right font-figure text-foreground sm:px-5">
                                    {rowPercent.toFixed(1)}%
                                  </td>
                                  <td className="px-2 py-1 text-right">
                                    {row.isin && (
                                      <EditHolding
                                        target={{ kind: "stock", isin: row.isin }}
                                        name={row.name ?? row.isin}
                                        quantity={row.shares ?? 0}
                                      />
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile rows -- divided list, not nested cards */}
                      <div className="divide-y md:hidden">
                        {group.holdings.map((row, i) => {
                          const valueEur = row.value_eur ?? 0;
                          const rowPercent = totalEur > 0 ? (valueEur / totalEur) * 100 : 0;
                          return (
                            <div key={row.isin ?? `${row.name ?? "row"}-${i}`} className="p-4">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div
                                    className="line-clamp-2 font-medium text-foreground"
                                    title={row.name ?? undefined}
                                  >
                                    {row.name ? shortHoldingName(row.name) : "—"}
                                  </div>
                                  <div className="mt-0.5 text-xs text-muted-foreground">
                                    {row.broker_label ?? "—"}
                                  </div>
                                </div>
                                {row.isin && (
                                  <EditHolding
                                    target={{ kind: "stock", isin: row.isin }}
                                    name={row.name ?? row.isin}
                                    quantity={row.shares ?? 0}
                                  />
                                )}
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                                <div>
                                  <div className="text-xs text-muted-foreground">Shares</div>
                                  <div className="font-figure text-foreground">
                                    {row.shares != null ? formatShares(row.shares) : "—"}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Price</div>
                                  <div className="font-figure text-foreground">
                                    {row.price != null && row.currency
                                      ? formatMoney(row.price, row.currency)
                                      : "—"}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Return</div>
                                  <div>
                                    <ReturnCell
                                      perf={perf}
                                      holdingKey={row.isin}
                                      name={row.name ?? row.isin ?? ""}
                                      quantity={row.shares ?? 0}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Value</div>
                                  <div className="font-figure font-medium text-foreground">
                                    {formatEur(valueEur)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">% of total</div>
                                  <div className="font-figure text-foreground">
                                    {rowPercent.toFixed(1)}%
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {!query.isPending && (
        <div className="mt-6">
          <AddHoldingPanel kind="stock" defaultOpen={holdings.length === 0} />
        </div>
      )}
    </div>
  );
}
