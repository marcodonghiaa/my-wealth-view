import { TradesDialog } from "@/components/holdings/trades-dialog";
import { ImportTrades } from "@/components/holdings/import-trades";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
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

const dash = <span className="text-muted-foreground">—</span>;

/** What a holding's return cell says: its return, or what's stopping it. */
function returnLabel(perf: Performance, holdingKey: string) {
  const measured = perf.measuredByKey.get(holdingKey);
  const trades = perf.tradesByKey.get(holdingKey) ?? [];
  if (measured?.state === "dust") return dash;
  if (trades.length === 0) return <span className="text-xs text-primary">Add purchases</span>;
  if (measured?.state === "ok") return <Change change={measured.change} />;
  if (measured?.state === "mismatch") {
    return <span className="text-xs text-negative">Trades don't match</span>;
  }
  return dash;
}

/** The same words as ReturnCell, not tappable: for a row whose own tap expands it. */
export function ReturnText({ perf, holdingKey }: { perf: Performance; holdingKey: string | null }) {
  if (perf.isPending) return <span className="text-muted-foreground">…</span>;
  if (perf.unavailable || perf.error || holdingKey == null) return dash;
  return returnLabel(perf, holdingKey);
}

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
  if (perf.isPending || perf.unavailable || perf.error || holdingKey == null) {
    return <ReturnText perf={perf} holdingKey={holdingKey} />;
  }
  // Always the same trigger, so adding the first trade keeps the dialog open.
  return (
    <TradesDialog
      kind={perf.kind}
      holdingKey={holdingKey}
      name={name}
      quantity={quantity}
      trades={perf.tradesByKey.get(holdingKey) ?? []}
      label={returnLabel(perf, holdingKey)}
    />
  );
}

/** Your total return since purchase, from your trades, and the best and worst holding. The hero's
 * quiet second line: the range change above it answers "how did it move". */
export function PerformanceSummary({ perf }: { perf: Performance }) {
  if (perf.error) {
    return <Alert className="mt-3">Couldn't load returns: {perf.error.message}</Alert>;
  }
  if (perf.isPending) {
    return <Skeleton className="mt-2 h-5 w-56" />;
  }
  if (perf.unavailable) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        Returns appear once your database has the latest update (see UPGRADING.md).
      </p>
    );
  }

  const { summary } = perf;
  const best = summary.best[0];
  const worst = summary.worst[0];
  const incomplete = summary.total > summary.counted;
  return (
    <section aria-label="Return" className="mt-2 space-y-1 text-sm">
      {summary.counted > 0 ? (
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-muted-foreground">Total return since purchase</span>
          <Change change={summary.change} />
          <span className="font-figure text-foreground">{formatGain(summary.gain)}</span>
          {incomplete && (
            <span className="text-muted-foreground">
              on {summary.counted} of {summary.total} holdings
            </span>
          )}
        </p>
      ) : (
        <p className="text-muted-foreground">Add your purchases to see your return.</p>
      )}
      {(best || worst) && (
        <p className="flex flex-wrap gap-x-4">
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
    </section>
  );
}

/** "Import trades from CSV", under the holdings it fills in. Always offered once returns load: a new
 * buy still matches your old share count, so nothing else would prompt it. */
export function TradesImport({ perf }: { perf: Performance }) {
  if (perf.isPending || perf.unavailable || perf.error) return null;
  return (
    <p className="mt-3 px-1">
      <ImportTrades kind={perf.kind} saved={[...perf.tradesByKey.values()].flat()} />
    </p>
  );
}
