import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Bitcoin, Building2, Landmark, ScrollText, Shapes } from "lucide-react";
import { shareSummary } from "@/lib/chart-summary";
import { formatDay } from "@/lib/date";
import {
  allocationHistory,
  type HistoryRow,
  type NetWorthRow,
  type ReconstructedRow,
} from "@/lib/net-worth";
import { formatEur } from "@/lib/transactions";

const CLASSES = [
  { key: "stocks_eur", label: "Stocks", color: "var(--color-chart-2)", icon: Building2 },
  { key: "bonds_eur", label: "Bonds", color: "var(--color-chart-4)", icon: ScrollText },
  { key: "crypto_eur", label: "Crypto", color: "var(--color-chart-3)", icon: Bitcoin },
  { key: "cash_eur", label: "Cash", color: "var(--color-chart-1)", icon: Landmark },
  {
    key: "other_eur",
    label: "Unallocated",
    color: "var(--color-muted-foreground)",
    icon: Shapes,
  },
] as const;

// What net worth is made of: a donut of the mix with each class's share and value beside it,
// for today or for `asOf` (the day being scrubbed on the chart above).
// Liabilities (tax reserve) are left out so the mix describes what you hold, not what you owe.
export function AllocationChart({
  history,
  snapshots,
  reconstructed = [],
  asOf,
  format = formatEur,
}: {
  history: Array<HistoryRow>;
  snapshots: Array<NetWorthRow>;
  reconstructed?: Array<ReconstructedRow>;
  asOf?: string | undefined;
  format?: (eur: number) => string;
}) {
  const rows = allocationHistory(history, snapshots, undefined, reconstructed);
  const row = asOf
    ? (rows.filter((r) => r.snapshot_date <= asOf).at(-1) ?? rows.at(-1))
    : rows.at(-1);
  if (!row) return null;
  const slices = CLASSES.map((c) => ({ ...c, value: row[c.key] ?? 0 })).filter((s) => s.value > 0);
  const gross = slices.reduce((sum, s) => sum + s.value, 0);
  if (gross <= 0) return null;

  return (
    <section aria-labelledby="allocation-title" className="rounded-2xl bg-card p-5 sm:p-6">
      <h2 id="allocation-title" className="text-lg font-semibold text-foreground">
        Breakdown
      </h2>
      <p className="text-xs text-muted-foreground">As of {formatDay(row.snapshot_date)}</p>

      <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:gap-10">
        <div
          className="size-48 shrink-0"
          role="img"
          aria-label={shareSummary(
            "Breakdown",
            slices.map((s) => ({ label: s.label, value: s.value })),
          )}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="label"
                innerRadius="62%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
                stroke="var(--color-card)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {slices.map((s) => (
                  <Cell key={s.key} fill={s.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <ul className="w-full flex-1 divide-y">
          {slices.map(({ key, label, color, icon: Icon, value }) => (
            <li key={key} className="flex min-h-16 items-center gap-3 py-2.5">
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-full"
                style={{
                  color,
                  backgroundColor: `color-mix(in oklab, ${color} 16%, var(--color-card))`,
                }}
              >
                <Icon className="size-[1.125rem]" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.9375rem] font-medium text-foreground">{label}</p>
                <p className="font-figure text-xs text-muted-foreground">
                  {((value / gross) * 100).toFixed(1)}% of total
                </p>
              </div>
              <p className="font-figure text-[0.9375rem] font-semibold text-foreground">
                {format(value)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
