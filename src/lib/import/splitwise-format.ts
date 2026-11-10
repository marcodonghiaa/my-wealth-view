import { appLocale } from "@/lib/locale";

// Display helpers for the Splitwise import screens.

/** "3 Nov" (in the chosen locale): short and readable; the year only shows when it is not this year. */
export function shortDate(iso: string, today = new Date()): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getUTCFullYear() === today.getUTCFullYear();
  return d.toLocaleDateString(appLocale(), {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

export const money = (cents: number, currency: string) => `${(cents / 100).toFixed(2)} ${currency}`;
