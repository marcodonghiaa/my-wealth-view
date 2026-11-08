import type { Tables } from "@/integrations/supabase/types";
import { isStopped, periodDays } from "./subscriptions";

type Stream = Tables<"recurring_streams">;

const MONTH_DAYS = 30.437;
const DAY_MS = 86_400_000;
const label = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

/** User cadence (or custom interval) wins over the detected cadence. Capitalised like subscriptions.ts. */
export const effectiveCadence = (s: Stream): string | null => {
  const c = s.user_cadence ?? s.cadence;
  return c ? label(c) : null;
};

// Adapter so periodDays/isStopped from subscriptions.ts can be reused as-is.
const asChargeable = (s: Stream) => ({
  charge_count: s.charge_count,
  billing_frequency_is_manual: s.user_status === "confirmed",
  monthly_equivalent_eur: null,
  last_charged: s.last_charged,
  billing_frequency: effectiveCadence(s),
  custom_interval_value: s.custom_interval_value,
  custom_interval_unit: s.custom_interval_unit,
});

export function monthlyEur(s: Stream): number | null {
  const period = periodDays(asChargeable(s));
  if (period == null || s.typical_amount_eur == null) return null;
  return (s.typical_amount_eur * MONTH_DAYS) / period;
}

const daysBetween = (from: string, to: Date) =>
  (to.getTime() - new Date(`${from}T00:00:00`).getTime()) / DAY_MS;

// Ruling 6: a suggestion is stale once today > next_expected + 7 days + one period.
function isStaleSuggestion(s: Stream, today: Date): boolean {
  if (s.next_expected) {
    const period = periodDays(asChargeable(s));
    return period != null && daysBetween(s.next_expected, today) > 7 + period;
  }
  return s.last_charged != null && daysBetween(s.last_charged, today) > 400;
}

export function groupStreams(streams: Array<Stream>, today = new Date()) {
  const out = {
    toReview: [] as Array<Stream>,
    active: [] as Array<Stream>,
    stopped: [] as Array<Stream>,
    dismissed: [] as Array<Stream>,
  };
  for (const s of streams) {
    if (s.user_status === "dismissed") out.dismissed.push(s);
    else if (s.user_status === "confirmed" || s.detected_status === "active")
      (isStopped(asChargeable(s), today) ? out.stopped : out.active).push(s);
    else if (s.detected_status === "suggested" && !isStaleSuggestion(s, today))
      out.toReview.push(s);
  }
  return out;
}
