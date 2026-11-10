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
    const saved = localStorage.getItem(KEY) ?? "";
    // Only a Settings choice counts, whatever else ends up in storage.
    return LOCALE_CHOICES.some(([value]) => value === saved) ? saved : "";
  } catch {
    return "";
  }
}

/** Saves the choice on this device. False when the browser blocks storage. */
export function setLocaleOverride(locale: string): boolean {
  try {
    if (locale) localStorage.setItem(KEY, locale);
    else localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

/** The locale to format with. Never throws: a bad value falls back to en-GB. */
export function appLocale(): string {
  const wanted = localeOverride() || (typeof navigator === "undefined" ? "" : navigator.language);
  try {
    // baseName drops extensions such as -u-nu-arab, which would swap every digit.
    return new Intl.Locale(wanted || FALLBACK).baseName;
  } catch {
    return FALLBACK;
  }
}

const formats = new Map<string, Intl.NumberFormat>();

/** A number formatter for the chosen locale, built once per locale and options. */
export function numberFormat(options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const locale = appLocale();
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    formats.set(key, format);
  }
  return format;
}

/** Whether people in this locale write the month before the day (03/25/2026). */
export const monthFirst = (locale: string = appLocale()): boolean => /^en-US\b/.test(locale);

/** A plain number with fixed decimals in the chosen locale: 1.0842 → "1.0842" / "1,0842". */
export function formatNumber(value: number, digits: number): string {
  return numberFormat({
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** A quantity of shares or coins with up to `maxDigits` decimals: 1.5 → "1.5" / "1,5". */
export const formatQuantity = (value: number, maxDigits: number): string =>
  numberFormat({ minimumFractionDigits: 0, maximumFractionDigits: maxDigits }).format(value);

/**
 * A share or change as a percent in the chosen locale: 0.2548 → "25.5%" (en), "25,5 %" (de).
 * signed: "+" above zero and a real minus "−" below, nothing on zero.
 */
export function formatPercent(
  fraction: number,
  { digits = 1, signed = false }: { digits?: number; signed?: boolean } = {},
): string {
  const text = numberFormat({
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
