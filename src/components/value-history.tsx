import { SegmentedControl } from "@/components/segmented-control";
import { ValueChart } from "@/components/value-chart";
import { trendSummary } from "@/lib/chart-summary";
import { formatDay } from "@/lib/date";
import { CHART_RANGES, RANGE_LABEL } from "@/lib/net-worth";
import type { NetWorthRow } from "@/lib/net-worth";
import { RETURN_NOISE_BAND, formatReturn } from "@/lib/performance";
import { TONE_TEXT, toneOf } from "@/lib/tone";
import type { ValueHistory } from "@/lib/use-value-history";
import { formatEur } from "@/lib/transactions";

type RangeChangeProps = Pick<ValueHistory, "delta" | "change" | "range"> &
  Partial<Pick<ValueHistory, "first" | "scrubbed">>;

/**
 * The hero's change line, as on Net Worth: the value's move over the selected range, or from the
 * range start to the scrubbed day. A value move counts purchases and sales; the price return is
 * the quieter line under it (performance section).
 */
export function RangeChange({ delta, change, first, scrubbed, range }: RangeChangeProps) {
  if (delta == null || change == null || first == null) return null;
  return (
    <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-[0.9375rem]">
      <span className={`font-figure ${TONE_TEXT[toneOf(change, RETURN_NOISE_BAND)]}`}>
        {delta >= 0 ? "+" : "−"}
        {formatEur(Math.abs(delta))} ({formatReturn(change)})
      </span>
      <span className="text-muted-foreground">
        {scrubbed
          ? `${formatDay(first.snapshot_date)} – ${formatDay(scrubbed.snapshot_date)}`
          : RANGE_LABEL[range]}
      </span>
    </p>
  );
}

// The holding's value over the chosen range. A value change counts purchases and sales, so the
// price return is shown separately (performance section), not here.
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
          options={CHART_RANGES.map((r) => ({ value: r, label: r }))}
          value={range}
          onChange={setRange}
        />
      </div>
    </section>
  );
}
