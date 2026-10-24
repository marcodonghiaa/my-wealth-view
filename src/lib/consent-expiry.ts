import { bankNameFromLabel } from "@/components/bank-badge";
import { formatISODate } from "@/lib/date";

// Bank access (PSD2 consent) lasts 180 days. After that the bank stops syncing without any
// error the user can see, so the Accounts page warns from two weeks before.
const WARN_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ConsentAccount {
  label: string | null;
  consent_valid_until: string | null;
}

export interface ConsentAlert {
  bank: string;
  daysLeft: number; // 0 or less: already expired
}

// One alert per bank (all of a bank's accounts share one consent), soonest first.
export function consentAlerts(accounts: Array<ConsentAccount>, today: Date): Array<ConsentAlert> {
  const todayUtc = Date.parse(formatISODate(today));
  const soonest = new Map<string, number>();
  for (const a of accounts) {
    if (!a.consent_valid_until) continue;
    const daysLeft = Math.round(
      (Date.parse(a.consent_valid_until.slice(0, 10)) - todayUtc) / DAY_MS,
    );
    if (daysLeft > WARN_DAYS) continue;
    const bank = bankNameFromLabel(a.label ?? "Bank");
    soonest.set(bank, Math.min(daysLeft, soonest.get(bank) ?? Infinity));
  }
  return [...soonest]
    .map(([bank, daysLeft]) => ({ bank, daysLeft }))
    .sort((x, y) => x.daysLeft - y.daysLeft);
}
