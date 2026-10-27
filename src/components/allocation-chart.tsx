import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
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
  { key: "stocks_eur", label: "Stocks", color: "var(--color-chart-2)" },
  { key: "bonds_eur", label: "Bonds", color: "var(--color-chart-4)" },
  { key: "crypto_eur", label: "Crypto", color: "var(--color-chart-3)" },
  { key: "cash_eur", label: "Cash", color: "var(--color-chart-1)" },
  { key: "other_eur", label: "Unallocated", color: "var(--color-muted-foreground)" },
] as const;

// Today's mix of gross assets as a donut, with the exact euros and shares beside it.
// Liabilities (tax reserve) are left out so the mix describes what you hold, not what you owe.
export function AllocationChart({
  history,
  snapshots,
  reconstructed = [],
}: {
  history: Array<HistoryRow>;
  snapshots: Array<NetWorthRow>;
  reconstructed?: Array<ReconstructedRow>;
}) {
  const latest = allocationHistory(history, snapshots, undefined, reconstructed).at(-1);
  if (!latest) return null;
  const slices = CLASSES.map((c) => ({ ...c, value: latest[c.key] ?? 0 })).filter(
    (s) => s.value > 0,
  );
  const gross = slices.reduce((sum, s) => sum + s.value, 0);
  if (gross <= 0) return null;

  return (
    <section aria-labelledby="allocation-title" className="mt-6 rounded-2xl bg-card p-5 sm:p-6">
      <h2 id="allocation-title" className="text-lg font-semibold text-foreground">
        Asset allocation
      </h2>
      <p className="text-xs text-muted-foreground">As of {formatDay(latest.snapshot_date)}</p>

      <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:gap-10">
        <div
          className="size-48 shrink-0"
          role="img"
          aria-label={shareSummary(
            "Asset allocation",
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
          {slices.map((s) => (
            <li key={s.key} className="flex items-center gap-3 py-2.5 text-[0.9375rem]">
              <span
                aria-hidden
                className="inline-block size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="flex-1 text-foreground">{s.label}</span>
              <span className="font-figure text-muted-foreground">
                {((s.value / gross) * 100).toFixed(1)}%
              </span>
              <span className="w-28 text-right font-figure font-medium text-foreground">
                {formatEur(s.value)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
