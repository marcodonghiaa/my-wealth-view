// Reads a bank statement exported as CSV (Fineco, a Google Sheet, any bank) into transactions.
import { parseAmount } from "./normalize";
import { parseCsv } from "./parse-csv";

export type Direction = "DBIT" | "CRDT";

export interface StatementRow {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // above zero
  direction: Direction;
}

/** Column index for each field, or null. Either amount (signed) or in/out must be set. */
export interface StatementColumns {
  date: number | null;
  description: number | null;
  amount: number | null;
  in: number | null;
  out: number | null;
}

export interface Statement {
  headers: Array<string>;
  columns: StatementColumns;
  rows: Array<StatementRow>;
  /** Lines that are not a transaction: no valid date, no amount, a balance line. */
  skipped: number;
}

const FIELDS = ["date", "description", "amount", "in", "out"] as const;

// Header names banks really use, English and Italian, lower-cased and without accents.
const SYNONYMS: Record<(typeof FIELDS)[number], Array<string>> = {
  date: ["data operazione", "data contabile", "data", "date", "booking date", "transaction date"],
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
    "note",
  ],
  amount: ["importo", "amount", "ammontare", "valore", "value"],
  in: ["entrate", "accrediti", "avere", "credit", "money in", "paid in", "in"],
  out: ["uscite", "addebiti", "dare", "debit", "money out", "paid out", "out"],
};

const clean = (header: string) =>
  header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The likely column of each field. A column goes to at most one field. */
export function guessStatementColumns(headers: Array<string>): StatementColumns {
  const names = headers.map(clean);
  const taken = new Set<number>();
  const result: StatementColumns = {
    date: null,
    description: null,
    amount: null,
    in: null,
    out: null,
  };
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
  return result;
}

const usable = (c: StatementColumns) =>
  c.date != null && c.description != null && (c.amount != null || c.in != null || c.out != null);

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const pad = (n: number) => String(n).padStart(2, "0");

/** A day from common statement formats, as YYYY-MM-DD, or null. Day comes before month. */
export function parseDay(raw: string): string | null {
  const s = raw.trim().split(/[ T]/)[0] ?? "";
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))) {
    const year = Number(match[3]);
    [y, m, d] = [year < 100 ? 2000 + year : year, Number(match[2]), Number(match[1])];
  } else if (/^\d{5}$/.test(s) && Number(s) >= 20_000 && Number(s) <= 80_000) {
    const date = new Date(EXCEL_EPOCH_MS + Number(s) * 86_400_000);
    [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  } else return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

const cell = (row: Array<string>, i: number | null) => (i == null ? "" : (row[i] ?? "").trim());

function readRow(row: Array<string>, c: StatementColumns): StatementRow | null {
  const date = parseDay(cell(row, c.date));
  const description = cell(row, c.description).replace(/\s+/g, " ");
  if (!date || !description) return null;
  let signed: number | null = null;
  if (c.amount != null) signed = parseAmount(cell(row, c.amount));
  else {
    const money = (i: number | null) => Math.abs(parseAmount(cell(row, i)) ?? 0);
    signed = money(c.in) - money(c.out);
  }
  if (signed == null || signed === 0) return null;
  return {
    date,
    description,
    amount: Math.round(Math.abs(signed) * 100) / 100,
    direction: signed < 0 ? "DBIT" : "CRDT",
  };
}

const HEADER_SEARCH_LINES = 20;

/**
 * Reads the statement. Banks put title lines above the table, so the header is the first of the
 * first lines whose columns can be recognised. With columns picked by hand, the header is the
 * first line. Throws a plain-language Error when it can't tell which columns to use.
 */
export function readStatement(text: string, picked?: StatementColumns): Statement {
  const parsed = parseCsv(text);
  const lines = [parsed.headers, ...parsed.rows];
  let start = 0;
  let columns = picked;
  if (!columns) {
    for (let i = 0; i < Math.min(lines.length, HEADER_SEARCH_LINES); i++) {
      const guess = guessStatementColumns(lines[i]!);
      if (usable(guess)) {
        start = i;
        columns = guess;
        break;
      }
    }
  }
  if (!columns || !usable(columns)) {
    throw new Error("Couldn't find the date, description and amount columns. Pick them below.");
  }
  const body = lines.slice(start + 1);
  const rows = body.map((r) => readRow(r, columns)).filter((r): r is StatementRow => r != null);
  return { headers: lines[start]!, columns, rows, skipped: body.length - rows.length };
}

/** Same transaction whatever the case, spacing or amount format. */
export function dedupeKey(row: StatementRow): string {
  const text = row.description.toLowerCase().replace(/\s+/g, " ").trim();
  return `${row.date}|${row.direction}|${row.amount.toFixed(2)}|${text}`;
}
