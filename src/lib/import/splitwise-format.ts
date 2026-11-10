import { dateLocale } from "@/lib/locale";
import { formatMoney } from "@/lib/transactions";

// Display helpers for the Splitwise import screens.

/** "3 Nov" (in the chosen locale): short and readable; the year only shows when it is not this year. */
export function shortDate(iso: string, today = new Date()): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getUTCFullYear() === today.getUTCFullYear();
  return d.toLocaleDateString(dateLocale(), {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

/** An amount in the chosen locale's format: "€12.34", "12,34 €". A code Intl rejects stays as text. */
export const moneyAmount = formatMoney;

export const money = (cents: number, currency: string) => moneyAmount(cents / 100, currency);
