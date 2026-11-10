// Reads a bank statement exported as CSV (any bank, or another budgeting app) into transactions.
// Works out the layout by itself: separator, decimal mark, day/month order, which columns hold
// what, and how money out is told apart from money in. Known exports go through a preset.
import { appLocale, monthFirst } from "@/lib/locale";
import { cleanHeader as clean, headerMatches } from "./guess-columns";
import {
  detectDecimal,
  excelDay,
  monthNumber,
  pad,
  parseAmount,
  type DecimalMark,
} from "./normalize";
import { parseCsv } from "./parse-csv";
import { findPreset, presetColumns } from "./statement-presets";

export type Direction = "DBIT" | "CRDT";

export interface StatementRow {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // above zero
  direction: Direction;
  /** ISO code; EUR when the file has no currency column. */
  currency?: string;
  /** Money between your own accounts (a known export said so): not spending or income. */
  category?: "Transfer";
}

/**
 * Column index for each field, or null. Either amount or in/out must be set. With direction
 * (a column saying "D"/"C", "Af"/"Bij", "Soll"/"Haben"…) the amount's own sign is ignored.
 */
export interface StatementColumns {
  date: number | null;
  description: number | null;
  amount: number | null;
  in: number | null;
  out: number | null;
  direction?: number | null;
}

/** DMY: 03/04 is 3 April. MDY: 03/04 is March 4 (US). */
export type DateOrder = "DMY" | "MDY";

export interface StatementOptions {
  /** Day/month order; worked out from the file when not given. */
  dateOrder?: DateOrder;
  /** Money out is written as positive (most credit card exports): flip every sign. */
  invert?: boolean;
}

export interface Statement {
  headers: Array<string>;
  columns: StatementColumns;
  rows: Array<StatementRow>;
  /** Lines that are not a transaction: no valid date, no amount, a balance line. */
  skipped: number;
  /** The known export the file was read as, or null for a generic statement. */
  preset: string | null;
  dateOrder: DateOrder;
  decimal: DecimalMark | null;
}

const FIELDS = ["date", "description", "amount", "direction", "in", "out"] as const;

// Header names banks really use, lower-cased and without accents. English, Italian, German,
// French, Spanish, Dutch. Earlier names win: payee before free text.
const SYNONYMS: Record<(typeof FIELDS)[number], Array<string>> = {
  date: [
    "data operazione",
    "data contabile",
    "data",
    "date",
    "booking date",
    "transaction date",
    "posting date",
    "buchungstag",
    "buchungsdatum",
    "datum",
    "date operation",
    "fecha",
    "fecha operacion",
    "transactiedatum",
  ],
  description: [
    "descrizione",
    "description",
    "causale",
    "dettagli",
    "details",
    "merchant",
    "payee",
    "beneficiario",
    "narrative",
    "begunstigter zahlungspflichtiger",
    "beguenstigter zahlungspflichtiger",
    "auftraggeber begunstigter",
    "zahlungsempfanger",
    "empfanger",
    "naam omschrijving",
    "omschrijving",
    "libelle",
    "concepto",
    "verwendungszweck",
    "buchungstext",
    "mededelingen",
    "note",
    "memo",
  ],
  amount: [
    "importo",
    "amount",
    "ammontare",
    "valore",
    "value",
    "betrag",
    "umsatz",
    "montant",
    "importe",
    "bedrag",
  ],
  direction: [
    "af bij",
    "soll haben",
    "debit credit",
    "credit debit",
    "credit debit indicator",
    "dr cr",
    "d c",
    "segno",
    "direction",
    "type",
    "transaction type",
  ],
  in: [
    "entrate",
    "accrediti",
    "avere",
    "credit",
    "money in",
    "paid in",
    "in",
    "haben",
    "gutschrift",
    "credito",
    "ingreso",
  ],
  out: [
    "uscite",
    "addebiti",
    "dare",
    "debit",
    "money out",
    "paid out",
    "out",
    "soll",
    "lastschrift",
    "debito",
    "cargo",
  ],
};

/** What a direction cell says. Anything else falls back to the amount's sign. */
const OUT_WORDS = new Set([
  "d",
  "db",
  "dbit",
  "debit",
  "debet",
  "dr",
  "af",
  "s",
  "soll",
  "dare",
  "addebito",
  "uscita",
  "withdrawal",
  "expense",
  "out",
  "-",
  "debito",
  "cargo",
]);
const IN_WORDS = new Set([
  "c",
  "cr",
  "crdt",
  "credit",
  "bij",
  "h",
  "haben",
  "avere",
  "accredito",
  "entrata",
  "deposit",
  "income",
  "in",
  "+",
  "credito",
  "abono",
]);

// A direction cell as a word: "Débit" → "debit", "+" stays "+".
const word = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.:]$/, "").trim();

// In order of preference: "valuta" is the currency in Italian but the value date in German
// statements, which often have a Währung column too.
const CURRENCY_HEADERS = [
  "currency",
  "wahrung",
  "waehrung",
  "devise",
  "moneda",
  "munt",
  "ccy",
  "valuta",
];
const SYMBOLS: Record<string, string> = { "€": "EUR", "£": "GBP" };

/** "eur", "€" → "EUR". Anything that is not a currency code gives undefined (EUR). */
export function currencyCode(text: string): string | undefined {
  const code = SYMBOLS[text.trim()] ?? text.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : undefined;
}

/** No column picked yet. */
export const NO_COLUMNS: Readonly<StatementColumns> = Object.freeze({
  date: null,
  description: null,
  amount: null,
  direction: null,
  in: null,
  out: null,
});

/** The likely column of each field. A column goes to at most one field. */
export function guessStatementColumns(headers: Array<string>): StatementColumns {
  const names = headers.map(clean);
  const taken = new Set<number>();
  const result: StatementColumns = { ...NO_COLUMNS };
  for (const field of FIELDS) {
    // Exact names first, so "Data" wins over "Data valuta" and "Descrizione" over its longer twin.
    for (const exact of [true, false]) {
      if (result[field] != null) break;
      for (const synonym of SYNONYMS[field]) {
        const i = names.findIndex(
          (n, idx) => !taken.has(idx) && (exact ? n === synonym : n.startsWith(`${synonym} `)),
        );
        if (i !== -1) {
          result[field] = i;
          taken.add(i);
          break;
        }
      }
    }
  }
  // A direction column only makes sense next to one amount column.
  if (result.amount == null && result.direction != null) result.direction = null;
  return result;
}

const usable = (c: StatementColumns) =>
  c.date != null && c.description != null && (c.amount != null || c.in != null || c.out != null);

const SHORT_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;
// Two-digit years: 70-99 are the 1900s, the rest the 2000s.
const fullYear = (year: number) => (year >= 100 ? year : year >= 70 ? 1900 + year : 2000 + year);
const TIME = /[ T]\d{1,2}:\d{2}(:\d{2})?.*$/;

/**
 * A day from common statement formats, as YYYY-MM-DD, or null. For 03/04/2026 the order says
 * which number is the day; ISO, 20260304, "4 Mar 2026" and Excel day numbers need no order.
 */
export function parseDay(raw: string, order: DateOrder = "DMY"): string | null {
  const text = raw.trim().replace(TIME, "");
  const s = text.split(/[ T]/)[0] ?? "";
  let y: number, m: number, d: number;
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = SHORT_DATE.exec(s))) {
    const year = Number(match[3]);
    const [a, b] = [Number(match[1]), Number(match[2])];
    [y, m, d] = [fullYear(year), order === "MDY" ? a : b, order === "MDY" ? b : a];
  } else if ((match = /^((?:19|20)\d{2})(\d{2})(\d{2})$/.exec(s))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if (excelDay(s)) {
    const date = excelDay(s)!;
    [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  } else if ((match = /^(\d{1,2})\.?[\s-]([^\s\d,-]+)[\s-](\d{2}|\d{4})$/.exec(text))) {
    // 4 Mar 2026, 04-Mar-26, 4. März 2026
    const year = Number(match[3]);
    [y, m, d] = [fullYear(year), monthNumber(match[2]!) ?? 0, Number(match[1])];
  } else if ((match = /^([^\s\d,]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(text))) {
    // Mar 4, 2026
    [y, m, d] = [Number(match[3]), monthNumber(match[1]!) ?? 0, Number(match[2])];
  } else return null;
  // A bank row from before 1900 or after next year is a typo or a crafted file.
  if (m < 1 || y < 1900 || y > new Date().getFullYear() + 1) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Day/month order from the dates themselves: a first number above 12 means day first, a second
 * one means month first. When every date fits both (all days 1 to 12), the locale decides.
 */
export function detectDateOrder(cells: Array<string>, locale: string = appLocale()): DateOrder {
  for (const raw of cells) {
    const date = raw.trim().split(/[ T]/)[0] ?? "";
    const match = SHORT_DATE.exec(date);
    if (!match) continue;
    // 01.03.2026: dots are only ever written day first.
    if (date.includes(".")) return "DMY";
    if (Number(match[1]) > 12) return "DMY";
    if (Number(match[2]) > 12) return "MDY";
  }
  return monthFirst(locale) ? "MDY" : "DMY";
}

const MAX_AMOUNT = 1e12;

const cell = (row: Array<string>, i: number | null | undefined) =>
  i == null ? "" : (row[i] ?? "").trim();

/** How to read each row: the columns plus what a preset adds. */
interface Recipe {
  columns: StatementColumns;
  /** Description columns to fall back on when the main one is empty. */
  descriptionAlt: Array<number>;
  fee: number | null;
  currency: number | null;
  skip: (row: Array<string>) => boolean;
  transfer: (row: Array<string>) => boolean;
  dateOrder: DateOrder;
  decimal: DecimalMark | undefined;
  invert: boolean;
}

function readRow(row: Array<string>, r: Recipe): StatementRow | null {
  if (r.skip(row)) return null;
  const c = r.columns;
  const date = parseDay(cell(row, c.date), r.dateOrder);
  const description = [c.description, ...r.descriptionAlt]
    // Tabs and newlines become spaces; other control characters (Postgres rejects U+0000) go.
    .map((i) =>
      cell(row, i)
        .replace(/\s+/g, " ")
        .replace(/\p{Cc}/gu, "")
        .slice(0, 500),
    )
    .find((text) => text !== "");
  if (!date || !description) return null;
  const amount = (i: number | null | undefined) => parseAmount(cell(row, i), r.decimal);
  let signed: number | null;
  if (c.amount != null) {
    signed = amount(c.amount);
    if (signed != null && r.fee != null) signed -= Math.abs(amount(r.fee) ?? 0);
    // "Spending is written as positive" flips the bare sign; a D/C word still wins.
    if (signed != null && r.invert) signed = -signed;
    const said = word(cell(row, c.direction));
    if (signed != null && OUT_WORDS.has(said)) signed = -Math.abs(signed);
    else if (signed != null && IN_WORDS.has(said)) signed = Math.abs(signed);
  } else {
    const money = (i: number | null) => Math.abs(amount(i) ?? 0);
    signed = money(c.in) - money(c.out);
  }
  // Below a cent is no row; above a trillion is a broken or crafted file, not a payment.
  if (signed == null || Math.abs(signed) < 0.005 || !(Math.abs(signed) <= MAX_AMOUNT)) return null;
  const currencyText = cell(row, r.currency);
  const currency = currencyCode(currencyText);
  // "$" could be USD, CAD, AUD…: a currency it can't tell is skipped, not saved as EUR.
  if (currencyText !== "" && !currency) return null;
  return {
    date,
    description,
    amount: Math.round(Math.abs(signed) * 100) / 100,
    direction: signed < 0 ? "DBIT" : "CRDT",
    ...(currency && currency !== "EUR" ? { currency } : {}),
    ...(r.transfer(row) ? { category: "Transfer" as const } : {}),
  };
}

type Base = Omit<Recipe, "dateOrder" | "decimal" | "invert">;

function genericRecipe(
  headers: Array<string>,
  columns: StatementColumns,
  rows: Array<Array<string>>,
): Base {
  const names = headers.map(clean);
  const descriptionAlt = names.flatMap((n, i) =>
    !Object.values(columns).includes(i) && SYNONYMS.description.some((s) => headerMatches(n, s))
      ? [i]
      : [],
  );
  const free = (i: number) => i >= 0 && !Object.values(columns).includes(i);
  // A column named like a currency doesn't count if it holds digits: German "Valuta" is a date.
  const holdsCodes = (i: number) => !rows.some((r) => /\d/.test(r[i] ?? ""));
  const currency =
    CURRENCY_HEADERS.map((h) => names.indexOf(h)).find((i) => free(i) && holdsCodes(i)) ?? -1;
  return {
    columns,
    descriptionAlt,
    fee: null,
    currency: currency === -1 ? null : currency,
    skip: () => false,
    transfer: () => false,
  };
}

/** The header line (title lines above it are skipped) and how to read the rows under it. */
function findLayout(lines: Array<Array<string>>) {
  for (let i = 0; i < Math.min(lines.length, HEADER_SEARCH_LINES); i++) {
    const preset = findPreset(lines[i]!);
    if (preset) return { start: i, preset, base: presetColumns(preset, lines[i]!) as Base };
    const guess = guessStatementColumns(lines[i]!);
    if (usable(guess))
      return { start: i, preset: null, base: genericRecipe(lines[i]!, guess, lines.slice(i + 1)) };
  }
  return null;
}

const HEADER_SEARCH_LINES = 20;

/**
 * Reads the statement. Banks put title lines above the table, so the header is the first of the
 * first lines that is a known export or whose columns can be recognised. Columns picked by hand
 * replace the found ones but keep that header line and a known export's rules (skipped rows,
 * fees). Throws a plain-language Error when it can't tell which columns to use.
 */
export function readStatement(
  text: string,
  picked?: StatementColumns,
  options: StatementOptions = {},
): Statement {
  const parsed = parseCsv(text);
  const lines = [parsed.headers, ...parsed.rows];
  const found = findLayout(lines);
  const start = found?.start ?? 0;
  const preset = found?.preset ?? null;
  let base = found?.base ?? null;
  if (picked) {
    const columns = { ...NO_COLUMNS, ...picked };
    base =
      preset && base
        ? { ...base, columns }
        : genericRecipe(lines[start]!, columns, lines.slice(start + 1));
  }
  if (!base || !usable(base.columns)) {
    throw new Error("Couldn't find the date, description and amount columns. Pick them below.");
  }
  const body = lines.slice(start + 1);
  const c = base.columns;
  const amountCells = body.flatMap((r) => [cell(r, c.amount), cell(r, c.in), cell(r, c.out)]);
  const recipe: Recipe = {
    ...base,
    dateOrder: options.dateOrder ?? detectDateOrder(body.map((r) => cell(r, c.date))),
    decimal: preset?.decimal ?? detectDecimal(amountCells),
    invert: options.invert ?? false,
  };
  const rows = body.map((r) => readRow(r, recipe)).filter((r): r is StatementRow => r != null);
  return {
    headers: lines[start]!,
    columns: c,
    rows,
    skipped: body.length - rows.length,
    preset: preset?.name ?? null,
    dateOrder: recipe.dateOrder,
    decimal: recipe.decimal ?? null,
  };
}

/** Same transaction whatever the case, spacing or amount format. */
export function dedupeKey(row: StatementRow): string {
  const text = row.description.toLowerCase().replace(/\s+/g, " ").trim();
  const currency = row.currency ?? "EUR";
  return `${row.date}|${row.direction}|${row.amount.toFixed(2)}|${currency}|${text}`;
}
