// Reads a bank statement exported as CSV (any bank, or another budgeting app) into transactions.
// Works out the layout by itself: separator, decimal mark, day/month order, which columns hold
// what, and how money out is told apart from money in. Known exports go through a preset.
import { appLocale, monthFirst } from "@/lib/locale";
import { detectDecimal, monthNumber, parseAmount, type DecimalMark } from "./normalize";
import { parseCsv } from "./parse-csv";
import { findPreset, presetColumns, type StatementPreset } from "./statement-presets";

export type Direction = "DBIT" | "CRDT";

export interface StatementRow {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // above zero
  direction: Direction;
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

const clean = (header: string) =>
  header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// A direction cell as a word: "Débit" → "debit", "+" stays "+".
const word = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.:]$/, "").trim();

const NO_COLUMNS = (): StatementColumns => ({
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
  const result = NO_COLUMNS();
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

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const pad = (n: number) => String(n).padStart(2, "0");
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
  } else if (/^\d{5}$/.test(s) && Number(s) >= 20_000 && Number(s) <= 80_000) {
    const date = new Date(EXCEL_EPOCH_MS + Number(s) * 86_400_000);
    [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  } else if ((match = /^(\d{1,2})\.?[\s-]([^\s\d,-]+)[\s-](\d{2}|\d{4})$/.exec(text))) {
    // 4 Mar 2026, 04-Mar-26, 4. März 2026
    const year = Number(match[3]);
    [y, m, d] = [fullYear(year), monthNumber(match[2]!) ?? 0, Number(match[1])];
  } else if ((match = /^([^\s\d,]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(text))) {
    // Mar 4, 2026
    [y, m, d] = [Number(match[3]), monthNumber(match[1]!) ?? 0, Number(match[2])];
  } else return null;
  if (m < 1) return null;
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

const cell = (row: Array<string>, i: number | null | undefined) =>
  i == null ? "" : (row[i] ?? "").trim();

/** How to read each row: the columns plus what a preset adds. */
interface Recipe {
  columns: StatementColumns;
  /** Description columns to fall back on when the main one is empty. */
  descriptionAlt: Array<number>;
  fee: number | null;
  skip: (row: Array<string>) => boolean;
  /** Direction words, when a preset has its own (Firefly's withdrawal/deposit). */
  out: Set<string>;
  in: Set<string>;
  dateOrder: DateOrder;
  decimal: DecimalMark | undefined;
  invert: boolean;
}

function readRow(row: Array<string>, r: Recipe): StatementRow | null {
  if (r.skip(row)) return null;
  const c = r.columns;
  const date = parseDay(cell(row, c.date), r.dateOrder);
  const description = [c.description, ...r.descriptionAlt]
    .map((i) => cell(row, i).replace(/\s+/g, " "))
    .find((text) => text !== "");
  if (!date || !description) return null;
  const amount = (i: number | null | undefined) => parseAmount(cell(row, i), r.decimal);
  let signed: number | null;
  if (c.amount != null) {
    signed = amount(c.amount);
    if (signed != null && r.fee != null) signed -= Math.abs(amount(r.fee) ?? 0);
    const said = word(cell(row, c.direction));
    if (signed != null && r.out.has(said)) signed = -Math.abs(signed);
    else if (signed != null && r.in.has(said)) signed = Math.abs(signed);
  } else {
    const money = (i: number | null) => Math.abs(amount(i) ?? 0);
    signed = money(c.in) - money(c.out);
  }
  if (signed == null || Math.abs(signed) < 0.005) return null;
  if (r.invert) signed = -signed;
  return {
    date,
    description,
    amount: Math.round(Math.abs(signed) * 100) / 100,
    direction: signed < 0 ? "DBIT" : "CRDT",
  };
}

function genericRecipe(headers: Array<string>, columns: StatementColumns) {
  const names = headers.map(clean);
  const descriptionAlt = names.flatMap((n, i) =>
    i !== columns.description &&
    !Object.values(columns).includes(i) &&
    SYNONYMS.description.some((s) => n === s || n.startsWith(`${s} `))
      ? [i]
      : [],
  );
  return { columns, descriptionAlt, fee: null, skip: () => false, out: OUT_WORDS, in: IN_WORDS };
}

function presetRecipe(preset: StatementPreset, headers: Array<string>) {
  const { columns, descriptionAlt, fee, skip } = presetColumns(preset, headers);
  const words = (list: Array<string> | undefined, fallback: Set<string>) =>
    list ? new Set(list) : fallback;
  return {
    columns,
    descriptionAlt,
    fee,
    skip,
    out: words(preset.direction?.out, OUT_WORDS),
    in: words(preset.direction?.in, IN_WORDS),
  };
}

const HEADER_SEARCH_LINES = 20;

/**
 * Reads the statement. Banks put title lines above the table, so the header is the first of the
 * first lines that is a known export or whose columns can be recognised. With columns picked by
 * hand, the header is the first line. Throws a plain-language Error when it can't tell which
 * columns to use.
 */
export function readStatement(
  text: string,
  picked?: StatementColumns,
  options: StatementOptions = {},
): Statement {
  const parsed = parseCsv(text);
  const lines = [parsed.headers, ...parsed.rows];
  let start = 0;
  let preset: StatementPreset | null = null;
  let base: Omit<Recipe, "dateOrder" | "decimal" | "invert"> | null = picked
    ? genericRecipe(lines[0]!, { ...NO_COLUMNS(), ...picked })
    : null;
  for (let i = 0; !base && i < Math.min(lines.length, HEADER_SEARCH_LINES); i++) {
    preset = findPreset(lines[i]!);
    if (preset) {
      start = i;
      base = presetRecipe(preset, lines[i]!);
      break;
    }
    const guess = guessStatementColumns(lines[i]!);
    if (usable(guess)) {
      start = i;
      base = genericRecipe(lines[i]!, guess);
    }
  }
  if (!base || !usable(base.columns)) {
    throw new Error("Couldn't find the date, description and amount columns. Pick them below.");
  }
  const body = lines.slice(start + 1);
  const c = base.columns;
  const amountCells = body.flatMap((r) => [cell(r, c.amount), cell(r, c.in), cell(r, c.out)]);
  const recipe: Recipe = {
    ...base,
    dateOrder:
      options.dateOrder ?? preset?.dateOrder ?? detectDateOrder(body.map((r) => cell(r, c.date))),
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
  return `${row.date}|${row.direction}|${row.amount.toFixed(2)}|${text}`;
}
