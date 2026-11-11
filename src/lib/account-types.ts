import { normalizeNumber } from "@/lib/locale";
// What kind of account it is. The bank says on link; null (unknown) counts as checking.
export const ACCOUNT_TYPES = [
  ["checking", "Checking"],
  ["savings", "Savings"],
  ["credit_card", "Credit card"],
  ["loan", "Loan"],
  ["investment", "Investment"],
  ["other", "Other"],
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number][0];

/** Credit cards and loans are money owed: net worth subtracts them. */
export const isDebt = (type: string | null | undefined): boolean =>
  type === "credit_card" || type === "loan";

/** A debt's balance as it counts in net worth: always negative, whatever sign the bank uses. */
export const debtEur = (amount: number | null | undefined): number =>
  amount ? -Math.abs(amount) : 0;

export const accountTypeLabel = (type: string | null | undefined): string =>
  ACCOUNT_TYPES.find(([t]) => t === type)?.[1] ?? "Checking";

/** What is owed, typed by hand: 0 or more, up to two decimals. */
export function parseOwed(input: string): number | null {
  const text = normalizeNumber(input);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) && value <= 1e12 ? value : null;
}
