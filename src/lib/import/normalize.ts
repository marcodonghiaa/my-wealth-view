// Turns the messy text people have in spreadsheets into clean values for the import.

const MONTH_NAMES: Array<Array<string>> = [
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

/**
 * Reads an amount written the European way (1.234,56) or the English way (1,234.56).
 * A single separator followed by exactly three digits ("1,234") is read as thousands, except
 * after a leading zero ("0.125"). Returns null when the text is not a clean number.
 */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/[€$£\s]/g, "");
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const negative = s.startsWith("-");
  const body = negative ? s.slice(1) : s;

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

  const value = Number(fraction ? `${intPart}.${fraction}` : intPart);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}
