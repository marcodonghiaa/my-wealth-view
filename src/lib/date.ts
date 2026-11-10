import { appLocale } from "@/lib/locale";

// Format a Date's LOCAL calendar day as YYYY-MM-DD. `date.toISOString()`
// converts to UTC first, which shifts the date across midnight in any
// positive UTC-offset zone (e.g. Europe/Dublin in summer) -- the wrong
// value for "which day/month did the user mean".
export function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const SHORT_RANGE_DAYS = 180;

// Daily snapshots need day-level ticks; month-only labels repeat ("Sept 26" x3).
export function axisDateFormatter(
  firstIso: string | undefined,
  lastIso: string | undefined,
): (iso: string) => string {
  const spanDays =
    firstIso && lastIso
      ? (Date.parse(`${lastIso}T00:00:00`) - Date.parse(`${firstIso}T00:00:00`)) / 86_400_000
      : 0;
  const options: Intl.DateTimeFormatOptions =
    spanDays > SHORT_RANGE_DAYS
      ? { month: "short", year: "2-digit" }
      : { day: "numeric", month: "short" };
  return (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(appLocale(), options);
}

// A day as people read it: 3 Mar 2026.
export function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(appLocale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "as of 3 Nov" for a balance from before today (the bank didn't sync since), else null. */
export function asOf(snapshotDate: string | null, today: string): string | null {
  if (!snapshotDate || snapshotDate >= today) return null;
  const date = new Date(`${snapshotDate}T00:00:00`);
  return `as of ${date.toLocaleDateString(appLocale(), {
    day: "numeric",
    month: "short",
    ...(snapshotDate.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  })}`;
}
