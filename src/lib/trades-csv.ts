import { netShares, parseAmount } from "@/lib/trades";
import type { Trade } from "@/lib/trades";

// Your trades as a spreadsheet export. Header row required, in any order and either case:
//   date, side, isin (or symbol for coins), shares, price, fee (optional)
// Separated by comma, semicolon or tab. Prices are per share in EUR. Dates are 2026-10-30 or 30/10/2026.
// A Trade Republic transaction export is recognised by its columns and read as it comes.

export interface CsvResult {
  trades: Array<Trade>;
  errors: Array<string>;
  /** Left out on purpose, but you should know. */
  notes: Array<string>;
  /** The file is your broker's full record, so it can correct how many shares you hold. */
  setsShares?: boolean;
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

/**
 * Trade Republic: BUY and SELL rows are trades, a split adds shares at no cost. Dividends, card
 * payments and MIGRATION rows (a move in and straight out again) are not trades, so they're skipped.
 * Things you sold that aren't in your holdings are kept, so their profit counts.
 */
function parseTradeRepublic(
  lines: Array<string>,
  separator: string,
  header: Array<string>,
  { kind, knownKeys }: { kind: "stock" | "crypto"; knownKeys: Set<string> },
): CsvResult {
  if (kind !== "stock") {
    return {
      trades: [],
      errors: ["This is a Trade Republic export: import it on the Portfolio page."],
      notes: [],
    };
  }
  const trades: Array<Trade> = [];
  const errors: Array<string> = [];
  const notes: Array<string> = [];
  const names = new Map<string, string>();
  lines.slice(1).forEach((line, i) => {
    const cells = splitLine(line, separator);
    const get = (name: string) => cells[header.indexOf(name)] ?? "";
    const type = get("type");
    const key = get("symbol").toUpperCase();
    const date = get("date");
    const shares = Math.abs(Number(get("shares")));
    if (type !== "BUY" && type !== "SELL" && type !== "SPLIT") return;
    names.set(key, get("name"));
    if (type === "SPLIT" && Number(get("shares")) < 0) {
      notes.push(`${get("name")}: a reverse split on ${date} wasn't imported. Add it by hand.`);
      return;
    }
    const price = type === "SPLIT" ? 0 : Number(get("price"));
    const fee = type === "SPLIT" ? 0 : Math.abs(Number(get("fee")));
    if (!key || parseDate(date) == null || !(shares > 0) || !(price >= 0) || !(fee >= 0)) {
      errors.push(`Line ${i + 2}: couldn't read this ${type} row.`);
      return;
    }
    if (type !== "SPLIT" && get("currency") !== "EUR") {
      errors.push(`Line ${i + 2}: the price isn't in EUR.`);
      return;
    }
    trades.push({
      kind,
      key,
      side: type === "SELL" ? "sell" : "buy",
      trade_date: date,
      shares,
      price_eur: price,
      fee_eur: fee,
    });
  });

  // Not in your holdings and not fully sold: there's no price to value what's left.
  const open = [...new Set(trades.map((t) => t.key))].filter(
    (key) =>
      !knownKeys.has(key) && Math.abs(netShares(trades.filter((t) => t.key === key))) > 0.000001,
  );
  for (const key of open)
    notes.push(
      `${names.get(key)} isn't in your holdings, so it was left out. Add it, then import again.`,
    );
  return { trades: trades.filter((t) => !open.includes(t.key)), errors, notes, setsShares: true };
}

/** All or nothing: any error means nothing is saved, so a half-imported holding can't look right. */
export function parseTradesCsv(
  text: string,
  { kind, knownKeys, today }: { kind: "stock" | "crypto"; knownKeys: Set<string>; today: string },
): CsvResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { trades: [], errors: ["The file is empty."], notes: [] };

  const headerLine = lines[0]!.replace(/^\uFEFF/, "");
  const separator = [";", "\t", ","].find((s) => headerLine.includes(s)) ?? ",";
  const header = splitLine(headerLine, separator).map((h) => h.toLowerCase());
  if (header.includes("transaction_id") && header.includes("category")) {
    return parseTradeRepublic(lines, separator, header, { kind, knownKeys });
  }
  const keyName = kind === "stock" ? "isin" : "symbol";
  const at = (name: string) => header.indexOf(name);
  const missing = ["date", "side", keyName, "shares", "price"].filter((n) => at(n) < 0);
  if (missing.length > 0) {
    return {
      trades: [],
      errors: [`Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`],
      notes: [],
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
  return { trades, errors, notes: [] };
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

/**
 * What each traded holding's share count should become, for those that differ. Counts your saved
 * trades too, and leaves alone anything the file doesn't mention or you don't hold a row for.
 */
export function shareUpdates(
  incoming: Array<Trade>,
  saved: Array<Trade>,
  holdings: Map<string, number>,
): Array<{ key: string; shares: number }> {
  const all = [...saved, ...newTrades(incoming, saved)];
  const keys = [...new Set(incoming.map((t) => t.key))];
  return keys.flatMap((key) => {
    const current = holdings.get(key);
    if (current === undefined) return [];
    // Rounded: summing many fractional buys leaves floating-point dust.
    const shares = Math.max(0, Math.round(netShares(all.filter((t) => t.key === key)) * 1e8) / 1e8);
    return Math.abs(shares - current) > 0.000001 ? [{ key, shares }] : [];
  });
}
