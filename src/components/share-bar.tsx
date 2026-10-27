import { shareSummary } from "@/lib/chart-summary";

export interface Share {
  label: string;
  value: number;
  color: string;
}

// How a total splits, as one rounded bar with a legend of labels and percentages under it.
export function ShareBar({ title, shares }: { title: string; shares: Array<Share> }) {
  const total = shares.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;
  return (
    <div className="max-w-2xl">
      <div
        role="img"
        aria-label={shareSummary(
          title,
          shares.map((s) => ({ label: s.label, value: s.value })),
        )}
        className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
      >
        {shares.map((s) => (
          <span
            key={s.label}
            className="h-full"
            style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {shares.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-foreground">{s.label}</span>
            <span className="font-figure text-muted-foreground">
              {((s.value / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
