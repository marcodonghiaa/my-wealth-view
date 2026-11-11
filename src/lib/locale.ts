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

// Storage is read once: every figure on a page asks for the locale, and a change reloads it.
let saved: string | undefined;

/** The locale picked in Settings, or "" to follow the browser. */
export function localeOverride(): string {
  if (saved === undefined) {
    try {
      const stored = localStorage.getItem(KEY) ?? "";
      // Only a Settings choice counts, whatever else ends up in storage.
      saved = LOCALE_CHOICES.some(([value]) => value === stored) ? stored : "";
    } catch {
      saved = "";
    }
  }
  return saved;
}

/** Saves the choice on this device. False when the browser blocks storage. */
export function setLocaleOverride(locale: string): boolean {
  try {
    if (locale) localStorage.setItem(KEY, locale);
    else localStorage.removeItem(KEY);
    saved = undefined;
    return true;
  } catch {
    return false;
  }
}

let last: { wanted: string; locale: string } | undefined;

/** The locale to format with. Never throws: a bad value falls back to en-GB. */
export function appLocale(): string {
  const wanted =
    localeOverride() || (typeof navigator === "undefined" ? "" : (navigator.language ?? ""));
  if (last?.wanted === wanted) return last.locale;
  let locale = FALLBACK;
  try {
    // baseName drops extensions such as -u-nu-arab, which would swap every digit.
    locale = new Intl.Locale(wanted || FALLBACK).baseName;
  } catch {
    // A broken value falls back to en-GB.
  }
  last = { wanted, locale };
  return locale;
}

const formats = new Map<string, Intl.NumberFormat>();

/** A number formatter for the chosen locale, built once per locale and options. */
export function numberFormat(options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const locale = appLocale();
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = formats.get(key);
  if (!format) {
    // Italian, Spanish and Polish leave 4-digit numbers ungrouped (3487 next to 10.891): true means always.
    format = new Intl.NumberFormat(locale, { useGrouping: true, ...options });
    formats.set(key, format);
  }
  return format;
}

/**
 * A typed number as plain "1234.5", read in the chosen format. With both marks the last one is the
 * decimal. A lone mark is the decimal unless it's this format's thousands mark in 3-digit groups:
 * "1.250.000" is 1250000 in Italian, "0.5" / "12,5" stay decimals, and a single group such as
 * "1.250" in Italian or "1,250" in English is refused (empty) as it could mean either.
 */
export function normalizeNumber(input: string): string {
  const text = input.trim().replace(/[\s']/g, "");
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0)
    return comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  const mark = comma >= 0 ? "," : dot >= 0 ? "." : null;
  if (!mark) return text;
  const decimal = numberFormat()
    .formatToParts(1.5)
    .find((p) => p.type === "decimal")?.value;
  const grouped = new RegExp(`^[1-9]\\d{0,2}(\\${mark}\\d{3})+$`).test(text);
  if (mark === decimal || !grouped) return text.replace(mark, ".");
  // One group ("1.125" in Italian) could be 1125 or a typed decimal: refuse rather than guess.
  return text.split(mark).length > 2 ? text.split(mark).join("") : "";
}

/**
 * Why normalizeNumber refused a typed number that could mean two things, or null when it didn't:
 * "1.250" in Italian → '"1.250" could mean 1250 or 1,25: type one of those.'
 */
export function ambiguousNumberHint(input: string): string | null {
  const text = input.trim().replace(/[\s']/g, "");
  if (!text || normalizeNumber(text) !== "") return null;
  const [whole, part] = text.split(/[.,]/);
  return `"${text}" could mean ${whole}${part} or ${inputNumber(Number(`${whole}.${part}`))}: type one of those.`;
}

/** A number to put back in an input box: the chosen decimal mark, no grouping, Latin digits. */
export const inputNumber = (value: number, maxDigits = 20): string =>
  numberFormat({
    maximumFractionDigits: maxDigits,
    useGrouping: false,
    numberingSystem: "latn",
  }).format(value);

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
