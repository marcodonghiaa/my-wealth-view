import { TradesDialog } from "@/components/holdings/trades-dialog";
import { ImportTrades } from "@/components/holdings/import-trades";
import { Alert } from "@/components/ui/alert";
import { RETURN_NOISE_BAND, formatReturn } from "@/lib/performance";
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

/** Only what needs saying under the hero: returns failed to load, or the database needs its
 * update. The range change above answers "how did it move"; returns live on each row. */
export function PerformanceNotice({ perf }: { perf: Performance }) {
  if (perf.error) {
    return <Alert className="mt-3">Couldn't load returns: {perf.error.message}</Alert>;
  }
  if (perf.unavailable) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        Returns appear once your database has the latest update (see UPGRADING.md).
      </p>
    );
  }
  return null;
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
