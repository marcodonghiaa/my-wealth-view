import { parseCsv } from "./parse-csv";

// Splitwise's "Export as spreadsheet": Date, Description, Category, Cost, Currency, then one
// column per group member holding that person's net (paid minus owed) for the row. The last
// row is a totals row. Money is read to whole cents so sums are exact.

const FIXED_COLUMNS = 5;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONEY = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/;

export interface SplitwiseRow {
  /** 1-based position among the data rows, for error messages. */
  row: number;
  date: string;
  description: string;
  category: string;
  costCents: number;
  currency: string;
  /** One entry per member, in the same order as `members`. */
  netCents: Array<number>;
}

export interface SplitwiseTotal {
  currency: string;
  netCents: Array<number>;
}

export interface SplitwiseFile {
  members: Array<string>;
  rows: Array<SplitwiseRow>;
  total: SplitwiseTotal | null;
}

// How Splitwise labels a settle-up in the languages it ships in. The row's shape cannot tell a
// settle-up from a two-person expense, so the label decides.
const PAYMENT_LABELS = new Set(["payment", "pagamento", "zahlung", "paiement", "pago"]);

export const isPaymentRow = (r: Pick<SplitwiseRow, "category">): boolean =>
  PAYMENT_LABELS.has(r.category.toLowerCase());

// Cells come from an uploaded file; keep error messages short whatever they contain.
const MAX_SHOWN = 40;
const shown = (cell: string) => (cell.length > MAX_SHOWN ? `${cell.slice(0, MAX_SHOWN)}...` : cell);

function toCents(raw: string): number | null {
  const m = MONEY.exec(raw);
  if (!m) return null;
  const cents = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return m[1] === "-" && cents !== 0 ? -cents : cents;
}

function isRealDate(raw: string): boolean {
  const m = ISO_DATE.exec(raw);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** Reads a Splitwise export. Throws an Error with a plain-language message if it is not one. */
export function parseSplitwiseCsv(text: string): SplitwiseFile {
  const { headers, rows: body } = parseCsv(text);
  if (headers.length <= FIXED_COLUMNS) {
    throw new Error(
      "This does not look like a Splitwise export: there are no member columns after Currency.",
    );
  }
  const members = headers.slice(FIXED_COLUMNS);

  const rows: Array<SplitwiseRow> = [];
  let total: SplitwiseTotal | null = null;

  const readNets = (cells: Array<string>, label: string): Array<number> =>
    members.map((member, i) => {
      const cents = toCents(cells[FIXED_COLUMNS + i] ?? "");
      if (cents === null) throw new Error(`${label}: the amount for ${member} is not a number.`);
      return cents;
    });

  body.forEach((cells, index) => {
    const label = `Row ${index + 1}`;
    if (cells.length !== headers.length) {
      throw new Error(`${label} has ${cells.length} columns but the header has ${headers.length}.`);
    }
    if (total !== null) {
      throw new Error("The totals row must be the last row, and there can be only one.");
    }
    const [date = "", description = "", category = "", cost = "", currency = ""] = cells;

    if (cost === "") {
      if (!currency) throw new Error(`${label}: the currency is missing.`);
      total = { currency, netCents: readNets(cells, label) };
      return;
    }
    if (!isRealDate(date))
      throw new Error(`${label}: "${shown(date)}" is not a date like 2026-08-16.`);
    const costCents = toCents(cost);
    if (costCents === null) throw new Error(`${label}: the cost "${shown(cost)}" is not a number.`);
    if (!currency) throw new Error(`${label}: the currency is missing.`);

    rows.push({
      row: index + 1,
      date,
      description,
      category,
      costCents,
      currency,
      netCents: readNets(cells, label),
    });
  });

  if (rows.length === 0) throw new Error("The file has no expenses, only a totals row.");
  return { members, rows, total };
}
