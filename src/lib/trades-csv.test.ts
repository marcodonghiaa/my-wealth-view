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
