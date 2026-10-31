import { formatDay } from "@/lib/date";
import { shortHoldingName } from "@/lib/holding-name";
import { HOLDING_RANGE_LABEL, RETURN_NOISE_BAND, formatReturn, rowReturn } from "@/lib/performance";
import type { HoldingRange, PerformanceRow, Ranked } from "@/lib/performance";
import type { usePerformance } from "@/lib/use-performance";
import { TONE_TEXT, toneOf } from "@/lib/tone";

type Performance = ReturnType<typeof usePerformance>;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Change({ change }: { change: number | null }) {
  if (change == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={`font-figure ${TONE_TEXT[toneOf(change, RETURN_NOISE_BAND)]}`}>
      {formatReturn(change)}
    </span>
  );
}

/** A holding's price return for the range, or a dash with the reason in the tooltip. */
export function ReturnCell({
  row,
  pending = false,
}: {
  row: PerformanceRow | undefined;
  pending?: boolean;
}) {
  const change = row ? rowReturn(row) : null;
  if (pending) return <span className="text-muted-foreground">…</span>;
  if (!row || change == null) {
    return (
      <span className="text-muted-foreground" title="No price for this range">
        —
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end">
      <Change change={change} />
      {row.status === "since" && row.start_date && (
        <span className="text-xs text-muted-foreground">since {formatDay(row.start_date)}</span>
      )}
    </span>
  );
}

function Movers({ title, items }: { title: string; items: Array<Ranked> }) {
  if (items.length === 0) return null;
  return (
    <div className="min-w-0 flex-1">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <ul className="mt-1 space-y-0.5 text-sm">
        {items.map((item) => (
          <li key={item.key} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-foreground">
              {shortHoldingName(item.name ?? item.key)}
            </span>
            <Change change={item.change} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Price return for the chosen range, best and worst holdings, and what the number leaves out.
 * `note` says what moves the EUR figure besides the price (currency).
 */
export function PerformanceSummary({
  perf,
  range,
  note,
}: {
  perf: Performance;
  range: HoldingRange;
  note: string;
}) {
  if (perf.error) {
    return (
      <div role="alert" className="mt-3 rounded-2xl bg-negative/10 px-4 py-3 text-sm text-negative">
        Couldn't load returns: {perf.error.message}
      </div>
    );
  }
  if (perf.isPending) {
    return <div className="mt-3 h-5 w-56 animate-pulse rounded-lg bg-muted" />;
  }
  if (perf.unavailable) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Returns appear once your database has the latest update (see UPGRADING.md).
      </p>
    );
  }

  const { summary } = perf;
  const label = summary.since ? `since ${formatDay(summary.since)}` : HOLDING_RANGE_LABEL[range];
  return (
    <section aria-label="Price return" className="mt-3">
      <p className="flex flex-wrap items-baseline gap-x-2 text-[0.9375rem]" aria-live="polite">
        <span className="font-medium">
          <Change change={summary.change} />
        </span>
        <span className="text-muted-foreground">Return · {label}</span>
      </p>
      <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
        {note}
        {summary.partial > 0 &&
          summary.since == null &&
          ` ${plural(summary.partial, "holding")} measured from the first price we have.`}
        {summary.excluded > 0 &&
          ` ${plural(summary.excluded, "holding")} without a price for this range left out.`}
      </p>
      {summary.best.length > 0 && (
        <div className="mt-3 flex gap-6 sm:max-w-md">
          <Movers title="Best" items={summary.best} />
          <Movers title="Worst" items={summary.worst} />
        </div>
      )}
    </section>
  );
}
