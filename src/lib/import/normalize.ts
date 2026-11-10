// Turns the messy text people have in spreadsheets into clean values for the import.

export const MONTH_NAMES: Array<Array<string>> = [
  ["jan", "january", "gen", "gennaio"],
  ["feb", "february", "febbraio"],
  ["mar", "march", "marzo"],
  ["apr", "april", "aprile"],
  ["may", "mag", "maggio"],
  ["jun", "june", "giu", "giugno"],
  ["jul", "july", "lug", "luglio"],
  ["aug", "august", "ago", "agosto"],
  ["sep", "sept", "september", "set", "settembre"],
  ["oct", "october", "ott", "ottobre"],
  ["nov", "november", "novembre"],
  ["dec", "december", "dic", "dicembre"],
];

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;
// Excel day numbers for roughly 1954 to 2119: wide enough for real dates, narrow enough that an
// amount like "1500" is never mistaken for a date.
const EXCEL_SERIAL_RANGE = [20_000, 80_000] as const;

const pad = (n: number) => String(n).padStart(2, "0");
const validMonth = (m: number) => m >= 1 && m <= 12;
const validDay = (d: number) => d >= 1 && d <= 31;
const ym = (year: number, month: number) => `${year}-${pad(month)}`;

/** Reads a month from common spreadsheet formats. Returns "YYYY-MM", or null if not a month. */
export function parseMonth(raw: string): string | null {
  const s = raw.trim().toLowerCase();

  let m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(s);
  if (m) {
    const [month, day] = [Number(m[2]), m[3] === undefined ? 1 : Number(m[3])];
    return validMonth(month) && validDay(day) ? ym(Number(m[1]), month) : null;
  }

  m = /^(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return validMonth(Number(m[1])) ? ym(Number(m[2]), Number(m[1])) : null;

  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    return validDay(Number(m[1])) && validMonth(Number(m[2]))
      ? ym(Number(m[3]), Number(m[2]))
      : null;
  }

  m = /^([a-z]+)\.?\s+(\d{4})$/.exec(s);
  if (m) {
    const index = MONTH_NAMES.findIndex((names) => names.includes(m[1] ?? ""));
    return index === -1 ? null : ym(Number(m[2]), index + 1);
  }

  if (/^\d{5}$/.test(s)) {
    const serial = Number(s);
    if (serial < EXCEL_SERIAL_RANGE[0] || serial > EXCEL_SERIAL_RANGE[1]) return null;
    const d = new Date(EXCEL_EPOCH_MS + serial * DAY_MS);
    return ym(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }

  return null;
}

const THOUSANDS_GROUPS = /^\d{1,3}([.,]\d{3})+$/;

export type DecimalMark = "," | ".";

/**
 * Strips what banks put around a number and reads its sign: "(12.50)", "12,50-", "+3", "EUR 4",
 * "−7" (typographic minus), "12.50 CR" / "12.50 DR". More than one sign makes it unreadable.
 */
function unwrap(raw: string): { body: string; negative: boolean } {
  let s = raw
    .replace(/[\u2212\u2013]/g, "-")
    .replace(/[€$£\s'’]/g, "")
    .replace(/^[A-Za-z]{3}(?=[\d+\-(.,])/, "")
    .replace(/(?<=[\d)-])[A-Za-z]{3}$/, "");
  let signs = 0;
  let negative = false;
  const flag = (minus: boolean) => {
    signs++;
    negative = minus;
  };
  const crdr = /^(.*?)(CR|DR)$/i.exec(s);
  if (crdr) {
    flag(crdr[2]!.toUpperCase() === "DR");
    s = crdr[1] ?? "";
  }
  const paren = /^\((.*)\)$/.exec(s);
  if (paren) {
    flag(true);
    s = paren[1] ?? "";
  }
  if (s.endsWith("-")) {
    flag(true);
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    flag(true);
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    flag(false);
    s = s.slice(1);
  }
  return { body: signs > 1 ? "x" : s, negative };
}

/**
 * Reads an amount written the European way (1.234,56) or the English way (1,234.56).
 * With `decimal` (the file's decimal mark, see detectDecimal) the other mark is always thousands.
 * Without it, a single separator followed by exactly three digits ("1,234") is read as thousands,
 * except after a leading zero ("0.125"). Returns null when the text is not a clean number.
 */
export function parseAmount(raw: string, decimal?: DecimalMark): number | null {
  const { body, negative } = unwrap(raw);
  if (!/^[\d.,]+$/.test(body)) return null;
  const value = decimal ? withMark(body, decimal) : guessMark(body);
  if (value === null || !Number.isFinite(value)) return null;
  return negative ? -value : value;
}

function withMark(body: string, decimal: DecimalMark): number | null {
  const parts = body.split(decimal);
  if (parts.length > 2) return null;
  const thousands = decimal === "," ? "." : ",";
  const raw = parts[0] ?? "";
  // "3.99" in a decimal-comma file is not 399: thousands marks must split groups of three.
  if (raw.includes(thousands) && !new RegExp(`^\\d{1,3}(\\${thousands}\\d{3})+$`).test(raw)) {
    return null;
  }
  const whole = raw.split(thousands).join("");
  const fraction = parts[1] ?? "";
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction) || whole + fraction === "") return null;
  return Number(`${whole || "0"}.${fraction || "0"}`);
}

function guessMark(body: string): number | null {
  const sepPos = Math.max(body.lastIndexOf("."), body.lastIndexOf(","));
  let intPart = body;
  let fraction = "";

  if (sepPos !== -1) {
    const sep = body[sepPos] as string;
    const other = sep === "." ? "," : ".";
    const before = body.slice(0, sepPos);
    const after = body.slice(sepPos + 1);
    const sepCount = body.split(sep).length - 1;
    const looksLikeThousands = after.length === 3 && /^[1-9]\d{0,2}$/.test(before);
    const isDecimal = body.includes(other) || (sepCount === 1 && !looksLikeThousands);
    if (isDecimal) {
      if (sepCount !== 1 || !/^\d+$/.test(after)) return null;
      intPart = before;
      fraction = after;
    }
  }

  if (!/^\d+$/.test(intPart)) {
    if (!THOUSANDS_GROUPS.test(intPart)) return null;
    intPart = intPart.replace(/[.,]/g, "");
  }
  return Number(fraction ? `${intPart}.${fraction}` : intPart);
}

/**
 * The decimal mark a column of amounts uses, from the cells that can only be read one way
 * ("12,50", "1.234,5", "3.99"). Undefined when no cell tells (only "1,234" or "12").
 */
export function detectDecimal(cells: Array<string>): DecimalMark | undefined {
  let comma = 0;
  let dot = 0;
  for (const raw of cells) {
    const { body } = unwrap(raw);
    const pos = Math.max(body.lastIndexOf("."), body.lastIndexOf(","));
    if (pos === -1) continue;
    const mark = body[pos] as DecimalMark;
    const after = body.slice(pos + 1);
    const both = body.includes(mark === "." ? "," : ".");
    if (both || (/^\d{1,2}$/.test(after) && body.split(mark).length === 2)) {
      if (mark === ",") comma++;
      else dot++;
    }
  }
  if (comma === dot) return undefined;
  return comma > dot ? "," : ".";
}
