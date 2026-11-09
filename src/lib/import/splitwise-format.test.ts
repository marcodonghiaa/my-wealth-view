import { describe, expect, it } from "vitest";
import { money, shortDate } from "./splitwise-format";

describe("shortDate", () => {
  const today = new Date("2026-11-09T12:00:00Z");
  it("drops the year when it is this year", () => {
    expect(shortDate("2026-11-03", today)).toBe("Nov 3");
  });
  it("keeps the year for another year", () => {
    expect(shortDate("2025-12-31", today)).toBe("Dec 31, 2025");
  });
  it("gives back text it cannot read as a date", () => {
    expect(shortDate("soon", today)).toBe("soon");
  });
});

describe("money", () => {
  it("shows cents with two decimals and the currency", () => {
    expect(money(2730, "USD")).toBe("27.30 USD");
  });
});
