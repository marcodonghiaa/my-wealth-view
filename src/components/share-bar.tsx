import { formatPercent } from "@/lib/locale";
import { shareSummary } from "@/lib/chart-summary";
import { categoryTone } from "@/lib/categories";

export interface Share {
  label: string;
  value: number;
  /** The segment's own colour (a category, a coin); without one it is toned by rank. */
  color?: string;
  /** Two-letter code shown before the label in the legend. */
  code?: string;
}

/** Shares sorted largest first, each keeping its own colour or toned by rank. */
export function rankShares<T extends { value: number; color?: string }>(
  shares: Array<T>,
): Array<T & { tone: string }> {
  return [...shares]
    .sort((a, b) => b.value - a.value)
    .map((s, rank) => ({ ...s, tone: s.color ?? categoryTone(rank) }));
}

// "Ledger stripes": one 8px bar of segments split by 1px gaps of background, no radius.
export function Stripes({ shares, label }: { shares: Array<Share>; label: string }) {
  const total = shares.reduce((sum, s) => sum + s.value, 0);
  return (
    <div role="img" aria-label={label} className="flex h-2 w-full gap-px bg-background">
      {rankShares(shares).map((s) => (
        <span
          key={s.label}
          className="h-full"
          style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.tone }}
        />
      ))}
    </div>
  );
}

// How a total splits, as ledger stripes with a legend of labels and percentages under it.
export function ShareBar({ title, shares }: { title: string; shares: Array<Share> }) {
  const total = shares.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;
  return (
    <div className="max-w-2xl">
      <Stripes
        shares={shares}
        label={shareSummary(
          title,
          shares.map((s) => ({ label: s.label, value: s.value })),
        )}
      />
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 font-figure text-xs">
        {rankShares(shares).map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-2" style={{ backgroundColor: s.tone }} />
            {s.code && <span className="text-muted-foreground">{s.code} ·</span>}
            <span className="text-foreground">{s.label}</span>
            <span className="text-muted-foreground">{formatPercent((s.value / total) * 100)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
