import { useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";

/**
 * The last Splitwise import, with Undo. Undo deletes rows, so it takes two taps: the first one
 * asks, and the question goes away by itself after a few seconds.
 */
export function LastImportRow({
  count,
  pending,
  onUndo,
}: {
  count: number;
  pending: boolean;
  onUndo: () => void;
}) {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const t = setTimeout(() => setAsking(false), 4000);
    return () => clearTimeout(t);
  }, [asking]);

  return (
    <div className="mt-3 flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-card px-4 py-2 text-sm sm:px-5">
      <span className="text-muted-foreground">
        Last import · {count === 1 ? "1 expense" : `${count} expenses`}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => (asking ? onUndo() : setAsking(true))}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 ${
          asking ? "bg-negative/15 text-negative" : "text-primary hover:bg-foreground/5"
        }`}
      >
        {pending ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <RotateCcw aria-hidden className="size-4" />
        )}
        {asking ? "Tap again to undo" : "Undo import"}
      </button>
    </div>
  );
}
