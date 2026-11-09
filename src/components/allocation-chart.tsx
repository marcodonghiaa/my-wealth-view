import { Stripes, rankShares } from "@/components/share-bar";
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
  { key: "stocks_eur", label: "Stocks", code: "ST" },
  { key: "bonds_eur", label: "Bonds", code: "BO" },
  { key: "crypto_eur", label: "Crypto", code: "CR" },
  { key: "cash_eur", label: "Cash", code: "CA" },
  { key: "other_eur", label: "Unallocated", code: "UN" },
] as const;

// What net worth is made of: ledger stripes of the mix, largest share darkest, with each class's
// code, name, share and value in rows below, for today or for `asOf` (the day being scrubbed on
// the chart above).
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
    <section aria-labelledby="allocation-title" className="rounded-lg bg-card p-5 sm:p-6">
      <h2 id="allocation-title" className="text-lg font-semibold text-foreground">
        Breakdown
      </h2>
      <p className="text-xs text-muted-foreground">As of {formatDay(row.snapshot_date)}</p>

      <div className="mt-4">
        <Stripes
          shares={slices}
          label={shareSummary(
            "Breakdown",
            slices.map((s) => ({ label: s.label, value: s.value })),
          )}
        />
      </div>

      <ul className="mt-3 divide-y divide-hairline font-figure">
        {rankShares(slices).map(({ key, label, code, tone, value }) => (
          <li key={key} className="flex min-h-11 items-center gap-3 py-2 text-sm">
            <span
              aria-hidden
              className="inline-block size-2 shrink-0"
              style={{ backgroundColor: tone }}
            />
            <span className="w-6 text-[11px] text-muted-foreground">{code}</span>
            <span className="text-muted-foreground">·</span>
            <span className="min-w-0 flex-1 truncate text-foreground">{label}</span>
            <span className="text-muted-foreground">·</span>
            <span className="w-14 text-right text-xs text-muted-foreground">
              {((value / gross) * 100).toFixed(1)}%
            </span>
            <span className="w-28 text-right text-foreground">{format(value)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
