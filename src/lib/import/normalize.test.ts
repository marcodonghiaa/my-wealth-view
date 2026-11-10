import { describe, expect, it } from "vitest";
import { detectDecimal, monthNumber, parseAmount, parseMonth } from "./normalize";

describe("parseMonth", () => {
  // protects=a month typed in any common way becomes YYYY-MM; fails_when=a format is misread
  // (e.g. day and month swapped) or garbage is accepted; no_claim=timezones, only calendar text
  it.each([
    ["2024-03", "2024-03"],
    ["2024-03-15", "2024-03"],
    ["03/2024", "2024-03"],
    ["15/03/2024", "2024-03"],
    ["Mar 2024", "2024-03"],
    ["March 2024", "2024-03"],
    ["marzo 2024", "2024-03"],
    ["  2024-03  ", "2024-03"],
    ["45352", "2024-03"], // Excel serial for 2024-03-01
  ])("reads %s as %s", (raw, expected) => {
    expect(parseMonth(raw)).toBe(expected);
  });

  it.each(["", "abc", "13/2024", "2024-13", "00/2024", "32/03/2024"])("rejects %j", (raw) => {
    expect(parseMonth(raw)).toBeNull();
  });
});

describe("parseAmount", () => {
  // protects=European and English number styles give the same value; fails_when=a thousands
  // separator is read as a decimal point; no_claim=currency, only the number
  it.each([
    ["1234.56", 1234.56],
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["1234,56", 1234.56],
    ["€ 1.234,56", 1234.56],
    ["-50", -50],
    ["1,234", 1234],
    ["0", 0],
  ])("reads %s as %s", (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected);
  });

  it.each(["", "  ", "abc", "1.2.3,4,5x"])("rejects %j", (raw) => {
    expect(parseAmount(raw)).toBeNull();
  });
});

describe("parseAmount, as banks write it", () => {
  it.each([
    ["(12.50)", -12.5],
    ["12,50-", -12.5],
    ["+3,00", 3],
    ["EUR 4,20", 4.2],
    ["-1 234,56 €", -1234.56],
    ["1 234,56", 1234.56],
    ["1'234.56", 1234.56],
    ["$-7.10", -7.1],
    ["\u221212.50", -12.5],
    ["\u201312,50", -12.5],
    ["12.50 CR", 12.5],
    ["12.50DR", -12.5],
    ["eur 5", 5],
    ["5 usd", 5],
  ])("reads %s as %s", (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected);
  });

  it("uses the file's decimal mark when it is known", () => {
    expect(parseAmount("1,234", ",")).toBe(1.234);
    expect(parseAmount("1.500", ",")).toBe(1500);
    expect(parseAmount("1.500", ".")).toBe(1.5);
    expect(parseAmount("1.234.567,8", ",")).toBe(1234567.8);
    expect(parseAmount(",5", ",")).toBe(0.5);
    expect(parseAmount("1,2,3", ",")).toBeNull();
    expect(parseAmount(",", ",")).toBeNull();
    expect(parseAmount("12a", ",")).toBeNull();
    // A cell in the other style is skipped, never read 100 times off.
    expect(parseAmount("3.99", ",")).toBeNull();
    expect(parseAmount("1,5", ".")).toBeNull();
    expect(parseAmount("1.234.5", ",")).toBeNull();
    expect(parseAmount("12,50 €-", ".")).toBeNull();
  });
});

describe("parseAmount, unreadable signs", () => {
  it.each(["-5-", "(-12)", "+-3", "-12 CR", "(5)DR"])("rejects %j", (raw) => {
    expect(parseAmount(raw)).toBeNull();
  });
});

describe("detectDecimal", () => {
  it("reads the mark from cells that can only mean one thing", () => {
    expect(detectDecimal(["1.500", "12,50", "3,1"])).toBe(",");
    expect(detectDecimal(["1,500", "12.50", "-3.99"])).toBe(".");
    expect(detectDecimal(["1.234,56"])).toBe(",");
    expect(detectDecimal(["1,234.56"])).toBe(".");
  });

  it("is undefined when no cell tells", () => {
    expect(detectDecimal(["1,234", "12", ""])).toBeUndefined();
    expect(detectDecimal([])).toBeUndefined();
  });
});

describe("monthNumber", () => {
  it("reads month names in six languages, with or without accents and dots", () => {
    expect(monthNumber("März")).toBe(3);
    expect(monthNumber("Ma\u0308rz")).toBe(3);
    expect(monthNumber("déc.")).toBe(12);
    expect(monthNumber("Sept.")).toBe(9);
    expect(monthNumber("mei")).toBe(5);
    expect(monthNumber("foo")).toBeNull();
  });
});
