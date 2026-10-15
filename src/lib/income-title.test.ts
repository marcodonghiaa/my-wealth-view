import { describe, expect, it } from "vitest";
import { incomeTitle } from "./transactions";

describe("incomeTitle", () => {
  it("uses the counterparty name when there is one", () => {
    expect(incomeTitle({ creditor_name: "ACME Ltd", category: "Services" })).toBe("ACME Ltd");
  });

  it("falls back to the category when the name is missing or blank", () => {
    expect(incomeTitle({ creditor_name: null, category: "Services" })).toBe("Services");
    expect(incomeTitle({ creditor_name: "  ", category: "Income" })).toBe("Income");
  });

  it("never returns a bare dash or empty string", () => {
    expect(incomeTitle({ creditor_name: null, category: null })).toBe("Unlabelled income");
  });
});
