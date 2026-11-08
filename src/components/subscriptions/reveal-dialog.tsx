import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { isDemoMode } from "@/lib/demo/mode";
import { groupStreams, monthlyEur, romeToday } from "@/lib/recurring";
import { formatMoney } from "@/lib/transactions";
import { useRecurringStreams } from "@/lib/use-recurring-streams";

const SEEN_KEY = "mf.subscriptionsReveal.seen";
// Covers the demo (shown on every start, never persisted) and blocked storage (once per page load).
let seenThisSession = false;

function claimReveal(): boolean {
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

  const { toReview, active } = useMemo(() => groupStreams(data ?? [], romeToday()), [data]);
  const count = active.length + toReview.length;
  const monthly = active.reduce((sum, s) => sum + Math.abs(monthlyEur(s) ?? 0), 0);
  const top = [...active, ...toReview]
    .map((s) => ({ s, m: Math.abs(monthlyEur(s) ?? 0) }))
    .sort((a, b) => b.m - a.m)
    .slice(0, 5);

  useEffect(() => {
    if (count > 0 && claimReveal()) setOpen(true);
  }, [count]);

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
        <DialogDescription className="figure-display">
          ~{formatMoney(monthly, "EUR")}
          <span className="text-[0.4em] font-medium text-muted-foreground"> /month</span>
        </DialogDescription>
        <ul className="divide-y">
          {top.map(({ s, m }) => (
            <li key={s.id} className="flex justify-between gap-3 py-2 text-sm">
              <span className="truncate">{s.display_name ?? "—"}</span>
              <span className="shrink-0 font-figure">{formatMoney(m, "EUR")}/mo</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={toReview.length > 0 ? review : () => setOpen(false)}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {toReview.length > 0
            ? `Review ${toReview.length} suggestion${toReview.length === 1 ? "" : "s"}`
            : "Got it"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
