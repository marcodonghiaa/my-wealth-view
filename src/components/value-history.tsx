import { SegmentedControl } from "@/components/segmented-control";
import { ValueChart } from "@/components/value-chart";
import { trendSummary } from "@/lib/chart-summary";
import { formatDay } from "@/lib/date";
import { HOLDING_RANGES, HOLDING_RANGE_LABEL } from "@/lib/performance";
import type { NetWorthRow } from "@/lib/net-worth";
import type { ValueHistory } from "@/lib/use-value-history";
import { TONE_TEXT, toneOf } from "@/lib/tone";
import { formatEur } from "@/lib/transactions";

// Moves under half a percent are noise: show them without alarm colour.
const NOISE_BAND = 0.005;

// "+€1,234.00 Value change · Past year", or the scrubbed span while hovering the chart. A value
// change counts purchases and sales, so no percent here: the price return is shown separately.
export function RangeChangeLine({ history }: { history: ValueHistory }) {
  const { delta, change, scrubbed, first, range } = history;
  if (delta == null || change == null) return null;
  return (
    <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-[0.9375rem]">
      <span className={`font-figure font-medium ${TONE_TEXT[toneOf(change, NOISE_BAND)]}`}>
        {delta >= 0 ? "+" : "−"}
        {formatEur(Math.abs(delta))}
      </span>
      <span className="text-muted-foreground">
        Value change ·{" "}
        {scrubbed && first
          ? `${formatDay(first.snapshot_date)} – ${formatDay(scrubbed.snapshot_date)}`
          : range === "1D"
            ? "Past week" // the 1D chart window is a week (a day is two points); its return line says "Past day"
            : HOLDING_RANGE_LABEL[range]}
        {!scrubbed && " (includes purchases)"}
      </span>
    </p>
  );
}

export function ValueHistoryChart({ history, title }: { history: ValueHistory; title: string }) {
  const { chartData, key, range, setRange, setScrubIndex } = history;
  if (chartData.length < 2) return null;
  const valueOf = (row: NetWorthRow) => row[key];
  return (
    <section aria-label={title} className="mb-8">
      <div
        className="-mx-1 h-64 sm:h-72"
        role="img"
        aria-label={trendSummary(
          title,
          valueOf(chartData[0]!),
          valueOf(chartData.at(-1)!),
          formatEur,
        )}
      >
        <ValueChart data={chartData} dataKey={key} name={title} onScrub={setScrubIndex} />
      </div>
      <div className="mt-4 flex">
        <SegmentedControl
          label="Chart range"
          options={HOLDING_RANGES.map((r) => ({ value: r, label: r }))}
          value={range}
          onChange={setRange}
        />
      </div>
    </section>
  );
}
