import { describe, expect, it } from "vitest";
import { decodeCsv, MAX_ROWS, parseCsv } from "./parse-csv";

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

describe("decodeCsv", () => {
  it("reads UTF-8", () => {
    expect(decodeCsv(new TextEncoder().encode("Café;€"))).toBe("Café;€");
  });

  it("reads Windows-1252 when the bytes are not UTF-8", () => {
    // "Café;€5" in Windows-1252: é = 0xE9, € = 0x80
    const bytes = new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x3b, 0x80, 0x35]);
    expect(decodeCsv(bytes)).toBe("Café;€5");
  });

  it("reads UTF-16 with a byte-order mark, either byte order", () => {
    const le = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0xe9, 0x00]);
    const be = new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x00, 0xe9]);
    expect(decodeCsv(le)).toBe("Aé");
    expect(decodeCsv(be)).toBe("Aé");
  });
});
