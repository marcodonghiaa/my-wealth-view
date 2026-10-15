interface Chargeable {
  charge_count: number | null;
  billing_frequency_is_manual: boolean | null;
  monthly_equivalent_eur: number | null;
}

// A single charge with no confirmed frequency is a one-off, not a subscription.
const isRecurring = (sub: Chargeable): boolean =>
  (sub.charge_count ?? 0) >= 2 || sub.billing_frequency_is_manual === true;

export function splitSubscriptions<T extends Chargeable>(subs: Array<T>) {
  return {
    recurring: subs.filter(isRecurring),
    oneOff: subs.filter((sub) => !isRecurring(sub)),
  };
}

export const estimatedMonthlyEur = (subs: Array<Chargeable>): number =>
  subs.reduce((sum, sub) => sum + Math.abs(sub.monthly_equivalent_eur ?? 0), 0);
