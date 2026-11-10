// The locale numbers are written in: the one picked in Settings, else the browser's.
// UI text and month names stay English; numbers and day/month order follow the locale.

const KEY = "alopex.locale";
const FALLBACK = "en-GB";

/** Settings choices. "" follows the browser. */
export const LOCALE_CHOICES: Array<[string, string]> = [
  ["", "Automatic (browser)"],
  ["en-GB", "English (UK)"],
  ["en-IE", "English (Ireland)"],
  ["en-US", "English (US)"],
  ["de-DE", "Deutsch"],
  ["it-IT", "Italiano"],
  ["fr-FR", "Français"],
  ["es-ES", "Español"],
  ["nl-NL", "Nederlands"],
  ["pt-PT", "Português"],
  ["da-DK", "Dansk"],
  ["sv-SE", "Svenska"],
  ["pl-PL", "Polski"],
];

/** The locale picked in Settings, or "" to follow the browser. */
export function localeOverride(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setLocaleOverride(locale: string): void {
  try {
    if (locale) localStorage.setItem(KEY, locale);
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the browser locale is used.
  }
}

/** The locale to format with. Never throws: a bad value falls back to en-GB. */
export function appLocale(): string {
  const wanted = localeOverride() || (typeof navigator === "undefined" ? "" : navigator.language);
  try {
    return Intl.getCanonicalLocales(wanted || FALLBACK)[0] ?? FALLBACK;
  } catch {
    return FALLBACK;
  }
}

/** Whether people in this locale write the month before the day (03/25/2026). */
export const monthFirst = (locale: string = appLocale()): boolean => /^en-US\b/.test(locale);

/**
 * A share or change as a percent in the chosen locale: 0.2548 → "25.5%" (en), "25,5 %" (de).
 * signed: "+" above zero and a real minus "−" below, nothing on zero.
 */
export function formatPercent(
  fraction: number,
  { digits = 1, signed = false }: { digits?: number; signed?: boolean } = {},
): string {
  const text = new Intl.NumberFormat(appLocale(), {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(signed ? Math.abs(fraction) : fraction);
  if (!signed) return text;
  return `${fraction > 0 ? "+" : fraction < 0 ? "−" : ""}${text}`;
}

/**
 * The locale for dates that spell the month: English, since the UI is English, in the
 * reader's order (Nov 10, 2026 for US English, 10 Nov 2026 for everyone else).
 */
export const dateLocale = (locale: string = appLocale()): string =>
  monthFirst(locale) ? "en-US" : "en-GB";
