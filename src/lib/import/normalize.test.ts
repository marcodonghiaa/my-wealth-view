import { describe, expect, it } from "vitest";
import { parseAmount, parseMonth } from "./normalize";

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
