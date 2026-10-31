import { parseAmount } from "@/lib/trades";
import type { Trade } from "@/lib/trades";

// Your trades as a spreadsheet export. Header row required, in any order and either case:
//   date, side, isin (or symbol for coins), shares, price, fee (optional)
// Separated by comma, semicolon or tab. Prices are per share in EUR. Dates are 2026-10-30 or 30/10/2026.

export interface CsvResult {
  trades: Array<Trade>;
  errors: Array<string>;
}

function splitLine(line: string, separator: string): Array<string> {
  const cells: Array<string> = [];
  let cell = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === separator && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

function parseDate(text: string): string | null {
  const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  const iso = dayFirst
    ? `${dayFirst[3]}-${dayFirst[2]!.padStart(2, "0")}-${dayFirst[1]!.padStart(2, "0")}`
    : text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const parsed = new Date(`${iso}T00:00:00Z`);
  // Rejects 31/02/2026, which Date would roll into March.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

/** All or nothing: any error means nothing is saved, so a half-imported holding can't look right. */
export function parseTradesCsv(
  text: string,
  { kind, knownKeys, today }: { kind: "stock" | "crypto"; knownKeys: Set<string>; today: string },
): CsvResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { trades: [], errors: ["The file is empty."] };

  const headerLine = lines[0]!.replace(/^\uFEFF/, "");
  const separator = [";", "\t", ","].find((s) => headerLine.includes(s)) ?? ",";
  const header = splitLine(headerLine, separator).map((h) => h.toLowerCase());
  const keyName = kind === "stock" ? "isin" : "symbol";
  const at = (name: string) => header.indexOf(name);
  const missing = ["date", "side", keyName, "shares", "price"].filter((n) => at(n) < 0);
  if (missing.length > 0) {
    return {
      trades: [],
      errors: [`Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`],
    };
  }

  const trades: Array<Trade> = [];
  const errors: Array<string> = [];
  lines.slice(1).forEach((line, i) => {
    const cells = splitLine(line, separator);
    const fail = (message: string): void => {
      errors.push(`Line ${i + 2}: ${message}`);
    };
    const key = (cells[at(keyName)] ?? "").toUpperCase();
    const side = (cells[at("side")] ?? "").toLowerCase();
    const date = parseDate(cells[at("date")] ?? "");
    const shares = parseAmount(cells[at("shares")] ?? "");
    const price = parseAmount(cells[at("price")] ?? "");
    const feeText = at("fee") >= 0 ? (cells[at("fee")] ?? "") : "";
    const fee = feeText === "" ? 0 : parseAmount(feeText);

    if (!knownKeys.has(key)) return fail(`${key || "(blank)"} isn't one of your holdings.`);
    if (side !== "buy" && side !== "sell") return fail("side must be buy or sell.");
    if (date == null) return fail("date isn't valid.");
    if (date > today) return fail("date is in the future.");
    if (shares == null || shares <= 0) return fail("shares must be a number above zero.");
    if (price == null) return fail("price must be a number.");
    if (fee == null) return fail("fee must be a number.");
    trades.push({ kind, key, side, trade_date: date, shares, price_eur: price, fee_eur: fee });
  });
  return { trades, errors };
}

const signature = (t: Trade) =>
  [
    t.kind,
    t.key,
    t.side,
    t.trade_date,
    Number(t.shares),
    Number(t.price_eur),
    Number(t.fee_eur),
  ].join("|");

/** Importing the same file twice must not double your holdings: leave out what's already saved. */
export function newTrades(incoming: Array<Trade>, saved: Array<Trade>): Array<Trade> {
  const known = new Set(saved.map(signature));
  return incoming.filter((t) => !known.has(signature(t)));
}
