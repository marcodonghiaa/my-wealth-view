import { TradesDialog } from "@/components/holdings/trades-dialog";
import { ImportTrades } from "@/components/holdings/import-trades";
import { shortHoldingName } from "@/lib/holding-name";
import { RETURN_NOISE_BAND, formatReturn } from "@/lib/performance";
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

/** A holding's total return, or what's stopping it. Tapping it opens its trades. */
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
  // Always the same trigger, so adding the first trade keeps the dialog open.
  return (
    <TradesDialog
      kind={perf.kind}
      holdingKey={holdingKey}
      name={name}
      quantity={quantity}
      trades={trades}
      label={
        measured?.state === "dust" ? (
          <span className="text-muted-foreground">—</span>
        ) : trades.length === 0 ? (
          <span className="text-xs text-primary">Add purchases</span>
        ) : measured?.state === "ok" ? (
          <Change change={measured.change} />
        ) : measured?.state === "mismatch" ? (
          <span className="text-xs text-negative">Trades don't match</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      }
    />
  );
}

/** Your total return from your trades, and the best and worst holding. Nothing else. */
export function PerformanceSummary({ perf }: { perf: Performance }) {
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
  const best = summary.best[0];
  const worst = summary.worst[0];
  const incomplete = summary.total > summary.counted;
  return (
    <section aria-label="Return" className="mt-3 space-y-1">
      {summary.counted > 0 ? (
        <p className="flex flex-wrap items-baseline gap-x-2 text-[0.9375rem]" aria-live="polite">
          <span className="font-medium">
            <Change change={summary.change} />
          </span>
          <span className="font-figure text-foreground">{formatGain(summary.gain)}</span>
          <span className="text-muted-foreground">Total return</span>
        </p>
      ) : (
        <p className="text-[0.9375rem] text-muted-foreground">
          Add your purchases to see your return.
        </p>
      )}
      {(best || worst) && (
        <p className="flex flex-wrap gap-x-4 text-sm">
          {best && (
            <span>
              <span className="text-muted-foreground">Best </span>
              {shortHoldingName(best.name ?? best.key)} <Change change={best.change} />
            </span>
          )}
          {worst && (
            <span>
              <span className="text-muted-foreground">Worst </span>
              {shortHoldingName(worst.name ?? worst.key)} <Change change={worst.change} />
            </span>
          )}
        </p>
      )}
      <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
        {incomplete && summary.counted > 0 && (
          <span>
            On {summary.counted} of {summary.total} holdings
          </span>
        )}
        <ImportTrades kind={perf.kind} saved={[...perf.tradesByKey.values()].flat()} />
      </p>
    </section>
  );
}
