import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { demoStarts, isDemoMode } from "@/lib/demo/mode";
import { groupStreams, monthlyEur, monthlyTotal, romeToday } from "@/lib/recurring";
import { formatMoney } from "@/lib/transactions";
import { useRecurringStreams } from "@/lib/use-recurring-streams";
import { Button } from "@/components/ui/button";

const SEEN_KEY = "mf.subscriptionsReveal.seen";
// Covers the demo (shown on every start, never persisted) and blocked storage (once per page load).
let seenThisSession = false;
let seenAtDemoStart = 0;

function claimReveal(): boolean {
  // Each demo start resets the in-memory flag (ruling 8).
  if (demoStarts !== seenAtDemoStart) {
    seenAtDemoStart = demoStarts;
    seenThisSession = false;
  }
  if (seenThisSession) return false;
  seenThisSession = true;
  if (isDemoMode()) return true;
  try {
    if (window.localStorage.getItem(SEEN_KEY)) return false;
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Storage blocked: the in-memory flag above still prevents a loop.
  }
  return true;
}

/** One-time "We found N subscriptions" summary, shown over the Subscriptions page. */
export function RevealDialog() {
  const { data } = useRecurringStreams();
  const [open, setOpen] = useState(false);

  // Rows not yet seen by the detector (migrated overrides) must not burn the one-time reveal.
  const { toReview, active } = useMemo(
    () =>
      groupStreams(
        (data ?? []).filter((s) => s.detected_at != null),
        romeToday(),
      ),
    [data],
  );
  const count = active.length;
  const show = count + toReview.length;
  const total = monthlyTotal(active);
  const top = active
    .map((s) => {
      const m = monthlyEur(s);
      return { s, m: m == null ? null : Math.abs(m) };
    })
    .sort((a, b) => (b.m ?? 0) - (a.m ?? 0))
    .slice(0, 5);

  useEffect(() => {
    if (show > 0 && claimReveal()) setOpen(true);
  }, [show]);

  const review = () => {
    setOpen(false);
    setTimeout(() => {
      const section = document.querySelector<HTMLElement>('[aria-label="To review"]');
      section?.setAttribute("tabindex", "-1");
      section?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      section?.focus({ preventScroll: true });
    }, 0);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>
          We found {count} subscription{count === 1 ? "" : "s"}
        </DialogTitle>
        <DialogDescription>Your recurring charges add up to about</DialogDescription>
        <p className="figure-display">
          {total.known === 0 ? "—" : `~${formatMoney(total.sum, "EUR")}`}
          {total.known > 0 && (
            <span className="text-[0.4em] tracking-normal text-muted-foreground"> /month</span>
          )}
        </p>
        <ul className="divide-y">
          {top.map(({ s, m }) => (
            <li key={s.id} className="flex justify-between gap-3 py-2 text-sm">
              <span className="truncate">{s.display_name ?? "—"}</span>
              <span className="shrink-0 font-figure">
                {m == null ? "—" : `${formatMoney(m, "EUR")}/mo`}
              </span>
            </li>
          ))}
        </ul>
        {toReview.length > 0 && (
          <p className="text-sm text-muted-foreground">and {toReview.length} to review</p>
        )}
        <Button onClick={toReview.length > 0 ? review : () => setOpen(false)}>
          {toReview.length > 0
            ? `Review ${toReview.length} suggestion${toReview.length === 1 ? "" : "s"}`
            : "Got it"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
