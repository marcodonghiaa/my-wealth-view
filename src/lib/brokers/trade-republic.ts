import { netShares } from "@/lib/trades";
import type { Trade } from "@/lib/trades";
import { parseDate, splitLine } from "./csv";
import type { BrokerParser } from "./types";

const COLUMNS = ["transaction_id", "category", "type", "symbol", "shares", "price", "currency"];

/**
 * Trade Republic's transaction export (Profile > Documents, CSV). BUY and SELL rows are trades, a
 * split adds shares at no cost. Dividends, card payments and MIGRATION rows (a move in and straight
 * out again) are not trades, so they're skipped and counted. Things you sold that aren't in your
 * holdings are kept, so their profit counts. Each trade keeps Trade Republic's transaction_id, so
 * importing the file again skips exactly what's saved.
 */
export const tradeRepublic: BrokerParser = {
  id: "trade_republic",
  name: "Trade Republic",
  country: "DE, IT, FR, ES and more",
  verifiedAt: "2026-11-01",
  detect: (header) => COLUMNS.every((c) => header.includes(c)),
  parse(lines, separator, header, { kind, knownKeys, today }) {
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
    let skipped = 0;
    lines.slice(1).forEach((line, i) => {
      const cells = splitLine(line, separator);
      const get = (name: string) => cells[header.indexOf(name)] ?? "";
      const type = get("type");
      const key = get("symbol").toUpperCase();
      const date = get("date");
      const shares = Math.abs(Number(get("shares")));
      if (type !== "BUY" && type !== "SELL" && type !== "SPLIT") {
        skipped++;
        return;
      }
      names.set(key, get("name"));
      if (type === "SPLIT" && Number(get("shares")) < 0) {
        notes.push(`${get("name")}: a reverse split on ${date} wasn't imported. Add it by hand.`);
        return;
      }
      // A blank price read as 0 and saved a buy at no cost, inflating the return.
      if (type !== "SPLIT" && get("price").trim() === "") {
        errors.push(`Line ${i + 2}: this ${type} row has no price.`);
        return;
      }
      if (date > today) {
        errors.push(`Line ${i + 2}: the date is in the future.`);
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
      const id = get("transaction_id").trim();
      trades.push({
        kind,
        key,
        side: type === "SELL" ? "sell" : "buy",
        trade_date: date,
        shares,
        price_eur: price,
        fee_eur: fee,
        source: "trade_republic",
        external_id: id === "" ? null : id,
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
    if (skipped > 0)
      notes.push(
        `${skipped} row${skipped === 1 ? " that isn't a trade was" : "s that aren't trades were"} skipped (dividends, interest, card payments, transfers).`,
      );
    return { trades: trades.filter((t) => !open.includes(t.key)), errors, notes, setsShares: true };
  },
};
