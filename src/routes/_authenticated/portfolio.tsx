import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Briefcase } from "lucide-react";
import { getSupabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio — Finance Dashboard" },
      {
        name: "description",
        content: "Track your investment holdings and allocation.",
      },
      { property: "og:title", content: "Portfolio — Finance Dashboard" },
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
  return TYPE_COLORS[type] ?? TYPE_COLORS[UNCLASSIFIED];
}

async function fetchPortfolio(): Promise<Array<PortfolioRow>> {
  const { data, error } = await getSupabase()
    .from("v_portfolio_latest")
    .select(
      "isin,name,shares,broker_label,snapshot_date,price,currency,value_native,value_eur,asset_type",
    )
    .order("value_eur", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<PortfolioRow>;
}

function formatEur(value: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatShares(value: number): string {
  return new Intl.NumberFormat("en-IE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

interface TypeGroup {
  type: string;
  totalEur: number;
  holdings: Array<PortfolioRow>;
}

export function PortfolioPage() {
  const query = useQuery({
    queryKey: ["portfolio-latest"],
    queryFn: fetchPortfolio,
  });

  const holdings = useMemo(() => query.data ?? [], [query.data]);

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

  const asOf = holdings[0]?.snapshot_date ?? null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Portfolio
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Your investment holdings and allocation.
        </p>
      </header>

      {query.isError && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load portfolio data: {query.error.message}
        </div>
      )}

      {/* Headline */}
      <section className="mb-6 rounded-2xl border bg-card p-6 card-ring surface-glow sm:p-8">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <Briefcase className="size-4 text-primary" />
          Total portfolio value
          {asOf && <span className="ml-1">· as of {formatDate(asOf)}</span>}
        </div>

        <div className="mt-3 min-h-16">
          {query.isPending ? (
            <div className="h-14 w-64 animate-pulse rounded-lg bg-muted" />
          ) : (
            <p className="font-figure text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
              {formatEur(totalEur)}
            </p>
          )}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Holdings are updated manually in the database — not live market data.
        </p>
      </section>

      {query.isPending ? (
        <>
          <div className="mb-6 h-80 animate-pulse rounded-2xl bg-muted/50" />
          <div className="h-64 animate-pulse rounded-2xl bg-muted/50" />
        </>
      ) : holdings.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border bg-card text-sm text-muted-foreground card-ring">
          No holdings found yet.
        </div>
      ) : (
        <>
          {/* Allocation by type */}
          <section className="mb-6 rounded-2xl border bg-card p-4 card-ring sm:p-6">
            <div className="mb-4 px-2">
              <h2 className="text-sm font-semibold text-foreground">
                Allocation by type
              </h2>
            </div>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={groups}
                    dataKey="totalEur"
                    nameKey="type"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={2}
                    cornerRadius={6}
                  >
                    {groups.map((g) => (
                      <Cell
                        key={g.type}
                        fill={colorForType(g.type)}
                        stroke="var(--color-card)"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<TypeTooltip totalEur={totalEur} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Holdings grouped by type */}
          <div className="space-y-4">
            {groups.map((group) => {
              const percent =
                totalEur > 0 ? (group.totalEur / totalEur) * 100 : 0;
              const color = colorForType(group.type);
              return (
                <section
                  key={group.type}
                  className="overflow-hidden rounded-2xl border bg-card card-ring"
                >
                  <div
                    className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-sm font-semibold text-foreground">
                        {group.type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {group.holdings.length} holding
                        {group.holdings.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-figure text-sm font-semibold text-foreground">
                        {formatEur(group.totalEur)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {percent.toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  {/* Desktop table */}
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2.5 font-medium sm:px-5">
                            Holding
                          </th>
                          <th className="px-4 py-2.5 font-medium sm:px-5">
                            Shares
                          </th>
                          <th className="px-4 py-2.5 font-medium sm:px-5">
                            Price
                          </th>
                          <th className="px-4 py-2.5 text-right font-medium sm:px-5">
                            Value
                          </th>
                          <th className="px-4 py-2.5 text-right font-medium sm:px-5">
                            % of total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {group.holdings.map((row) => {
                          const valueEur = row.value_eur ?? 0;
                          const rowPercent =
                            totalEur > 0 ? (valueEur / totalEur) * 100 : 0;
                          return (
                            <tr key={row.isin ?? row.name}>
                              <td className="px-4 py-3 sm:px-5">
                                <div className="font-medium text-foreground">
                                  {row.name ?? "—"}
                                </div>
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                  {row.broker_label ?? "—"}
                                </div>
                              </td>
                              <td className="px-4 py-3 font-figure text-foreground sm:px-5">
                                {row.shares != null
                                  ? formatShares(row.shares)
                                  : "—"}
                              </td>
                              <td className="px-4 py-3 font-figure text-foreground sm:px-5">
                                {row.price != null && row.currency
                                  ? formatMoney(row.price, row.currency)
                                  : "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-figure font-medium text-foreground sm:px-5">
                                {formatEur(valueEur)}
                              </td>
                              <td className="px-4 py-3 text-right font-figure text-foreground sm:px-5">
                                {rowPercent.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="space-y-3 p-4 md:hidden">
                    {group.holdings.map((row) => {
                      const valueEur = row.value_eur ?? 0;
                      const rowPercent =
                        totalEur > 0 ? (valueEur / totalEur) * 100 : 0;
                      return (
                        <div
                          key={row.isin ?? row.name}
                          className="rounded-xl border bg-background/40 p-3"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">
                              {row.name ?? "—"}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {row.broker_label ?? "—"}
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <div className="text-xs text-muted-foreground">
                                Shares
                              </div>
                              <div className="font-figure text-foreground">
                                {row.shares != null
                                  ? formatShares(row.shares)
                                  : "—"}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">
                                Price
                              </div>
                              <div className="font-figure text-foreground">
                                {row.price != null && row.currency
                                  ? formatMoney(row.price, row.currency)
                                  : "—"}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">
                                Value
                              </div>
                              <div className="font-figure font-medium text-foreground">
                                {formatEur(valueEur)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">
                                % of total
                              </div>
                              <div className="font-figure text-foreground">
                                {rowPercent.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

interface TooltipPayloadItem {
  payload?: TypeGroup;
}

function TypeTooltip({
  active,
  payload,
  totalEur,
}: {
  active?: boolean;
  payload?: Array<TooltipPayloadItem>;
  totalEur: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const group = payload[0]?.payload;
  if (!group) return null;
  const percent =
    totalEur > 0 ? ((group.totalEur / totalEur) * 100).toFixed(1) : "0.0";
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground">{group.type}</p>
      <p className="font-figure mt-0.5 text-sm font-semibold text-foreground">
        {formatEur(group.totalEur)}
      </p>
      <p className="text-xs text-muted-foreground">{percent}% of portfolio</p>
    </div>
  );
}
