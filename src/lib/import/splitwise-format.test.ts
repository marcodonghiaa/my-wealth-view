import { describe, expect, it } from "vitest";
import { money, moneyAmount, shortDate } from "./splitwise-format";

describe("shortDate", () => {
  const today = new Date("2026-11-09T12:00:00Z");
  it("drops the year when it is this year", () => {
    expect(shortDate("2026-11-03", today)).toBe("3 Nov");
  });
  it("keeps the year for another year", () => {
    expect(shortDate("2025-12-31", today)).toBe("31 Dec 2025");
  });
  it("gives back text it cannot read as a date", () => {
    expect(shortDate("soon", today)).toBe("soon");
  });
});

describe("money", () => {
  it("shows cents with two decimals and the currency", () => {
    expect(money(2730, "USD")).toBe("US$27.30");
  });
});

describe("moneyAmount", () => {
  it("keeps a code Intl rejects as plain text instead of crashing", () => {
    expect(moneyAmount(1.5, "EURO")).toBe("1.50 EURO");
  });
});
