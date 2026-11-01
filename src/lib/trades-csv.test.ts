import { describe, expect, it } from "vitest";
import { newTrades, parseTradesCsv } from "./trades-csv";

const opts = { kind: "stock" as const, knownKeys: new Set(["IE00B4L5Y983"]), today: "2026-10-31" };

describe("parseTradesCsv", () => {
  it("reads a comma file", () => {
    const { trades, errors } = parseTradesCsv(
      "date,side,isin,shares,price,fee\n2026-01-15,buy,IE00B4L5Y983,1.5,90.25,1\n",
      opts,
    );
    expect(errors).toEqual([]);
    expect(trades).toEqual([
      {
        kind: "stock",
        key: "IE00B4L5Y983",
        side: "buy",
        trade_date: "2026-01-15",
        shares: 1.5,
        price_eur: 90.25,
        fee_eur: 1,
      },
    ]);
  });

  it("reads a European semicolon file: day first, decimal commas, BOM, any header case", () => {
    const { trades, errors } = parseTradesCsv(
      "﻿Date;Side;ISIN;Shares;Price\r\n15/01/2026;SELL;ie00b4l5y983;1,5;1.090,25\r\n",
      opts,
    );
    expect(errors).toEqual([]);
    expect(trades[0]).toMatchObject({
      side: "sell",
      trade_date: "2026-01-15",
      shares: 1.5,
      price_eur: 1090.25,
      fee_eur: 0,
    });
  });

  it("handles a quoted decimal comma in a comma file", () => {
    const { trades } = parseTradesCsv(
      'date,side,isin,shares,price\n2026-01-15,buy,IE00B4L5Y983,"1,5",90\n',
      opts,
    );
    expect(trades[0]?.shares).toBe(1.5);
  });

  it("coins use the symbol column", () => {
    const { trades, errors } = parseTradesCsv(
      "date,side,symbol,shares,price\n2026-01-15,buy,btc,0.1,50000",
      {
        kind: "crypto",
        knownKeys: new Set(["BTC"]),
        today: "2026-10-31",
      },
    );
    expect(errors).toEqual([]);
    expect(trades[0]).toMatchObject({ kind: "crypto", key: "BTC" });
  });

  it("names missing columns", () => {
    expect(parseTradesCsv("date,isin\n", opts).errors).toEqual([
      "Missing columns: side, shares, price.",
    ]);
  });

  it("an empty file is an error", () => {
    expect(parseTradesCsv("\n\n", opts).errors).toEqual(["The file is empty."]);
  });

  it.each([
    ["2026-01-15,buy,XX0000000000,1,90", /isn't one of your holdings/],
    ["2026-01-15,gift,IE00B4L5Y983,1,90", /side must be/],
    ["31/02/2026,buy,IE00B4L5Y983,1,90", /date isn't valid/],
    ["2026-11-01,buy,IE00B4L5Y983,1,90", /in the future/],
    ["2026-01-15,buy,IE00B4L5Y983,0,90", /shares must be/],
    ["2026-01-15,buy,IE00B4L5Y983,1,abc", /price must be/],
  ])("reports %s with its line number", (line, want) => {
    const { errors } = parseTradesCsv(`date,side,isin,shares,price\n${line}\n`, opts);
    expect(errors[0]).toMatch(/^Line 2: /);
    expect(errors[0]).toMatch(want);
  });
});

describe("parseTradesCsv, Trade Republic export", () => {
  const HEADER =
    '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","transaction_id"';
  const line = (
    date: string,
    category: string,
    type: string,
    name: string,
    symbol: string,
    shares: string,
    price: string,
    fee = "",
    currency = "EUR",
  ) =>
    `"${date}T10:00:00Z","${date}","DEFAULT","${category}","${type}","FUND","${name}","${symbol}","${shares}","${price}","","${fee}","","${currency}","id"`;
  const file = (...rows: Array<string>) => [HEADER, ...rows].join("\n");
  const known = { kind: "stock" as const, knownKeys: new Set(["AA", "BB"]), today: "2026-10-31" };

  it("reads buys and sells, with the fee as a positive number", () => {
    const { trades, errors } = parseTradesCsv(
      file(
        line("2026-01-02", "TRADING", "BUY", "A", "AA", "2.5000000000", "10.000000"),
        line("2026-02-02", "TRADING", "SELL", "A", "AA", "-1.0000000000", "12.000000", "-1.00"),
      ),
      known,
    );
    expect(errors).toEqual([]);
    expect(trades).toEqual([
      {
        kind: "stock",
        key: "AA",
        side: "buy",
        trade_date: "2026-01-02",
        shares: 2.5,
        price_eur: 10,
        fee_eur: 0,
      },
      {
        kind: "stock",
        key: "AA",
        side: "sell",
        trade_date: "2026-02-02",
        shares: 1,
        price_eur: 12,
        fee_eur: 1,
      },
    ]);
  });

  it("a split adds shares at no cost", () => {
    const { trades } = parseTradesCsv(
      file(line("2026-04-06", "CORPORATE_ACTION", "SPLIT", "A", "AA", "2.0", "", "", "")),
      known,
    );
    expect(trades[0]).toMatchObject({ side: "buy", shares: 2, price_eur: 0, fee_eur: 0 });
  });

  it("skips dividends, migrations, saveback credits and card payments", () => {
    const { trades, errors } = parseTradesCsv(
      file(
        line("2026-01-02", "CASH", "DIVIDEND", "A", "AA", "7.0", ""),
        line("2026-01-02", "DELIVERY", "MIGRATION", "A", "AA", "-7.0", "90"),
        line("2026-01-02", "DELIVERY", "MIGRATION", "A", "AA", "7.0", "90"),
        line("2026-01-02", "CASH", "BENEFITS_SAVEBACK", "A", "AA", "", ""),
        line("2026-01-02", "CASH", "CARD_TRANSACTION", "Shop", "", "", ""),
      ),
      known,
    );
    expect(errors).toEqual([]);
    expect(trades).toEqual([]);
  });

  it("keeps something fully sold that isn't in your holdings, so its profit counts", () => {
    const { trades, notes } = parseTradesCsv(
      file(
        line("2026-01-02", "TRADING", "BUY", "Sold", "ZZ", "1.0", "10"),
        line("2026-02-02", "TRADING", "SELL", "Sold", "ZZ", "-1.0", "12"),
      ),
      known,
    );
    expect(trades).toHaveLength(2);
    expect(notes).toEqual([]);
  });

  it("leaves out something still held that isn't in your holdings, and says so", () => {
    const { trades, notes } = parseTradesCsv(
      file(line("2026-01-02", "TRADING", "BUY", "Other", "ZZ", "1.0", "10")),
      known,
    );
    expect(trades).toEqual([]);
    expect(notes[0]).toMatch(/Other isn't in your holdings/);
  });

  it("refuses a price that isn't in EUR", () => {
    const { errors } = parseTradesCsv(
      file(line("2026-01-02", "TRADING", "BUY", "A", "AA", "1.0", "10", "", "USD")),
      known,
    );
    expect(errors[0]).toMatch(/Line 2: the price isn't in EUR/);
  });

  it("belongs on the Portfolio page", () => {
    const { errors } = parseTradesCsv(file(), { ...known, kind: "crypto" });
    expect(errors[0]).toMatch(/Portfolio page/);
  });
});

describe("newTrades", () => {
  const trade = {
    kind: "stock",
    key: "K",
    side: "buy",
    trade_date: "2026-01-15",
    shares: 1.5,
    price_eur: 90,
    fee_eur: 0,
  };

  it("leaves out what's already saved, so re-importing doesn't double up", () => {
    const other = { ...trade, shares: 2 };
    expect(newTrades([trade, other], [trade])).toEqual([other]);
  });
});
