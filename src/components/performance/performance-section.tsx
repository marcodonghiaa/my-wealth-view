import { TradesDialog } from "@/components/holdings/trades-dialog";
import { ImportTrades } from "@/components/holdings/import-trades";
import { formatDay } from "@/lib/date";
import { shortHoldingName } from "@/lib/holding-name";
import { HOLDING_RANGE_LABEL, RETURN_NOISE_BAND, formatReturn } from "@/lib/performance";
import type { HoldingRange } from "@/lib/performance";
import type { Ranked } from "@/lib/trades";
import { formatEur } from "@/lib/transactions";
import type { usePerformance } from "@/lib/use-performance";
import { TONE_TEXT, toneOf } from "@/lib/tone";

type Performance = ReturnType<typeof usePerformance>;

function Change({ change }: { change: number | null }) {
  if (change == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={`font-figure ${TONE_TEXT[toneOf(change, RETURN_NOISE_BAND)]}`}>
      {formatReturn(change)}
    </span>
  );
}

const formatGain = (gain: number) => `${gain >= 0 ? "+" : "−"}${formatEur(Math.abs(gain))}`;

/** A holding's return for the range, what's stopping it, and the way to its trades. */
export function ReturnCell({
  perf,
  holdingKey,
  name,
  quantity,
}: {
  perf: Performance;
  holdingKey: string | null;
  name: string;
  quantity: number;
}) {
  if (perf.isPending) return <span className="text-muted-foreground">…</span>;
  if (perf.unavailable || perf.error || holdingKey == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const measured = perf.measuredByKey.get(holdingKey);
  const trades = perf.tradesByKey.get(holdingKey) ?? [];
  // One tree whether or not there are trades yet, so adding the first keeps the dialog open.
  return (
    <span className="inline-flex flex-col items-end">
      {trades.length > 0 &&
        (measured?.state === "ok" ? (
          <>
            <Change change={measured.change} />
            <span className="text-xs text-muted-foreground">{formatGain(measured.gain)}</span>
            {measured.since && (
              <span className="text-xs text-muted-foreground">
                since {formatDay(measured.since)}
              </span>
            )}
          </>
        ) : measured?.state === "mismatch" ? (
          <span className="text-xs text-negative">Trades don't match</span>
        ) : (
          <span className="text-muted-foreground" title="No price for this range">
            —
          </span>
        ))}
      <TradesDialog
        kind={perf.kind}
        holdingKey={holdingKey}
        name={name}
        quantity={quantity}
        trades={trades}
        label={trades.length > 0 ? "Trades" : "Add purchases"}
      />
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

/** Your return for the chosen range, from your trades; best and worst; what's left out. */
export function PerformanceSummary({ perf, range }: { perf: Performance; range: HoldingRange }) {
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
  const saved = [...perf.tradesByKey.values()].flat();
  return (
    <section aria-label="Return" className="mt-3">
      {summary.counted > 0 ? (
        <p className="flex flex-wrap items-baseline gap-x-2 text-[0.9375rem]" aria-live="polite">
          <span className="font-medium">
            <Change change={summary.change} />
          </span>
          <span className="font-figure text-foreground">{formatGain(summary.gain)}</span>
          <span className="text-muted-foreground">Return · {label}</span>
        </p>
      ) : (
        <p className="text-[0.9375rem] text-muted-foreground">
          Add your purchases to see your return.
        </p>
      )}
      <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
        From your trades, in EUR, fees included. Dividends aren't counted.
        {summary.total > summary.counted && ` On ${summary.counted} of ${summary.total} holdings.`}
        {summary.partial > 0 &&
          summary.since == null &&
          ` ${summary.partial} measured from the first price we have.`}
      </p>
      <div className="mt-1">
        <ImportTrades kind={perf.kind} saved={saved} />
      </div>
      {summary.best.length > 0 && (
        <div className="mt-3 flex gap-6 sm:max-w-md">
          <Movers title="Best" items={summary.best} />
          <Movers title="Worst" items={summary.worst} />
        </div>
      )}
    </section>
  );
}
