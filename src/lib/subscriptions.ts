interface Chargeable {
  charge_count: number | null;
  billing_frequency_is_manual: boolean | null;
  monthly_equivalent_eur: number | null;
  last_charged?: string | null;
  billing_frequency?: string | null;
  custom_interval_value?: number | null;
  custom_interval_unit?: string | null;
}

// A single charge with no confirmed frequency is a one-off, not a subscription.
const isRecurring = (sub: Chargeable): boolean =>
  (sub.charge_count ?? 0) >= 2 || sub.billing_frequency_is_manual === true;

const UNIT_DAYS: Record<string, number> = { days: 1, weeks: 7, months: 30.437, years: 365.25 };
const FREQUENCY_DAYS: Record<string, number> = {
  Weekly: 7,
  Monthly: 30.437,
  Quarterly: 91.31,
  Yearly: 365.25,
};

/** Days between charges, or null when the frequency isn't known. */
export function periodDays(sub: Chargeable): number | null {
  if (sub.billing_frequency === "Custom") {
    const unit = UNIT_DAYS[sub.custom_interval_unit ?? ""];
    return sub.custom_interval_value && unit ? sub.custom_interval_value * unit : null;
  }
  return FREQUENCY_DAYS[sub.billing_frequency ?? ""] ?? null;
}

/**
 * A subscription whose next charge is overdue by more than a period (at most 60 days of
 * grace) is treated as stopped: a cancelled Netflix no longer counts as a monthly cost.
 */
export function isStopped(sub: Chargeable, today: Date): boolean {
  const period = periodDays(sub);
  if (!sub.last_charged || period == null) return false;
  const last = new Date(`${sub.last_charged}T00:00:00`);
  const daysSince = (today.getTime() - last.getTime()) / 86_400_000;
  return daysSince > period + Math.min(period, 60);
}

export function splitSubscriptions<T extends Chargeable>(subs: Array<T>, today = new Date()) {
  return {
    recurring: subs.filter((sub) => isRecurring(sub) && !isStopped(sub, today)),
    stopped: subs.filter((sub) => isRecurring(sub) && isStopped(sub, today)),
    oneOff: subs.filter((sub) => !isRecurring(sub)),
  };
}

// Only subscriptions with a known frequency: without one the database prices the charge as
// monthly, which overstates a fortnightly or overcounts an irregular one. Those show
// "Set frequency" instead.
export const estimatedMonthlyEur = (subs: Array<Chargeable>): number =>
  subs.reduce(
    (sum, sub) =>
      sub.billing_frequency == null ? sum : sum + Math.abs(sub.monthly_equivalent_eur ?? 0),
    0,
  );
