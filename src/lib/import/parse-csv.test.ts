import { describe, expect, it } from "vitest";
import { MAX_ROWS, parseCsv } from "./parse-csv";

describe("parseCsv", () => {
  // protects=the same table comes out however the spreadsheet app saved it; fails_when=a
  // delimiter, quote or BOM changes the cells; no_claim=character encodings other than UTF-8
  it("reads a comma separated file", () => {
    expect(parseCsv("month,total\n2024-03,100\n2024-04,200\n")).toEqual({
      headers: ["month", "total"],
      rows: [
        ["2024-03", "100"],
        ["2024-04", "200"],
      ],
    });
  });

  it("reads a semicolon separated file (Excel in Italian)", () => {
    expect(parseCsv("mese;totale\n2024-03;1.234,56\n").rows).toEqual([["2024-03", "1.234,56"]]);
  });

  it("keeps commas inside quotes", () => {
    expect(parseCsv('category,amount\n"Food, drink",10\n').rows).toEqual([["Food, drink", "10"]]);
  });

  it("ignores a BOM at the start", () => {
    expect(parseCsv("﻿month,total\n2024-03,1\n").headers).toEqual(["month", "total"]);
  });

  it("handles Windows line endings and skips blank lines", () => {
    expect(parseCsv("a,b\r\n1,2\r\n\r\n3,4\r\n").rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("trims spaces around cells and headers", () => {
    const out = parseCsv(" month , total \n 2024-03 , 5 \n");
    expect(out.headers).toEqual(["month", "total"]);
    expect(out.rows).toEqual([["2024-03", "5"]]);
  });

  // protects=bad files get a plain message; fails_when=a bad file produces a silent empty table
  it.each([
    ["", /empty/i],
    ["   \n  \n", /empty/i],
    ["month,total\n", /no data rows/i],
  ])("rejects %j", (text, message) => {
    expect(() => parseCsv(text)).toThrow(message);
  });

  it("rejects files with too many rows", () => {
    const text = "a,b\n" + Array.from({ length: MAX_ROWS + 1 }, () => "1,2").join("\n");
    expect(() => parseCsv(text)).toThrow(/too many rows/i);
  });

  it("accepts exactly the maximum number of rows", () => {
    const text = "a,b\n" + Array.from({ length: MAX_ROWS }, () => "1,2").join("\n");
    expect(parseCsv(text).rows).toHaveLength(MAX_ROWS);
  });

  it("rejects text over the size limit", () => {
    expect(() => parseCsv("a\n" + "x".repeat(2_000_001))).toThrow(/too large/i);
  });
});
