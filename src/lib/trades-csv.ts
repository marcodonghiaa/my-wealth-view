import { BROKERS } from "@/lib/brokers";
import type { CsvResult, ParseContext } from "@/lib/brokers";
import { parseDate, splitLine } from "@/lib/brokers/csv";
import { netShares, parseAmount } from "@/lib/trades";
import type { Trade } from "@/lib/trades";

// Your trades as a spreadsheet export. Header row required, in any order and either case:
//   date, side, isin (or symbol for coins), shares, price, fee (optional)
// Separated by comma, semicolon or tab. Prices are per share in EUR. Dates are 2026-10-30 or 30/10/2026.
// A broker export Alopex knows (src/lib/brokers) is recognised by its columns and read as it comes.

export type { CsvResult } from "@/lib/brokers";

/** All or nothing: any error means nothing is saved, so a half-imported holding can't look right. */
export function parseTradesCsv(text: string, ctx: ParseContext): CsvResult {
  const { kind, knownKeys, today } = ctx;
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { trades: [], errors: ["The file is empty."], notes: [] };

  const headerLine = lines[0]!.replace(/^\uFEFF/, "");
  const separator = [";", "\t", ","].find((s) => headerLine.includes(s)) ?? ",";
  const header = splitLine(headerLine, separator).map((h) => h.toLowerCase());
  const broker = BROKERS.find((b) => b.detect(header));
  if (broker) return broker.parse(lines, separator, header, ctx);

  const keyName = kind === "stock" ? "isin" : "symbol";
  const at = (name: string) => header.indexOf(name);
  const required = ["date", "side", keyName, "shares", "price"];
  const missing = required.filter((n) => at(n) < 0);
  // Columns missing and others we don't know: not a half-made file but some broker's export, or
  // one whose format changed. Say so, never guess.
  const ours = new Set([...required, "symbol", "isin", "fee"]);
  if (missing.length > 0 && header.some((h) => !ours.has(h))) {
    return {
      trades: [],
      errors: [
        `This file's format isn't one Alopex knows. It reads ${BROKERS.map((b) => b.name).join(", ")} exports, or a file with the columns ${required.join(", ")}. Nothing was imported.`,
      ],
      notes: [],
      unknownFormat: true,
    };
  }
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

/**
 * Importing the same file twice must not double your holdings: leave out what's already saved.
 * A trade with the broker's own id matches by that id, so two identical buys on one day stay two.
 * Without one (plain CSV, or trades saved before ids were kept) it matches by its contents, one
 * saved row per incoming row: two identical saved buys cover two incoming ones, not every copy.
 */
export function newTrades(incoming: Array<Trade>, saved: Array<Trade>): Array<Trade> {
  const ids = new Set(
    saved.filter((t) => t.external_id).map((t) => `${t.source}|${t.external_id}`),
  );
  const unmatched = new Map<string, number>();
  for (const t of saved) {
    if (t.external_id) continue;
    unmatched.set(signature(t), (unmatched.get(signature(t)) ?? 0) + 1);
  }
  return incoming.filter((t) => {
    if (t.external_id && ids.has(`${t.source}|${t.external_id}`)) return false;
    const left = unmatched.get(signature(t)) ?? 0;
    if (left === 0) return true;
    unmatched.set(signature(t), left - 1);
    return false;
  });
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
