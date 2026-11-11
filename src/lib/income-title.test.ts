import { describe, expect, it } from "vitest";
import { categoryRepeatsTitle, formatSignedEur, incomeTitle } from "./transactions";

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

// protects=Income hides a chip that only repeats the row name (#11); fails_when=chips vanish
// on rows where the category adds information
describe("categoryRepeatsTitle", () => {
  it("is true when the category is the title, ignoring case and spaces", () => {
    expect(categoryRepeatsTitle({ creditor_name: "Income", category: "income " })).toBe(true);
    expect(categoryRepeatsTitle({ creditor_name: null, category: "Salary" })).toBe(true);
  });
  it("is false when the category says something new, or there is none", () => {
    expect(categoryRepeatsTitle({ creditor_name: "ACME Ltd", category: "Salary" })).toBe(false);
    expect(categoryRepeatsTitle({ creditor_name: "ACME Ltd", category: null })).toBe(false);
  });
});

describe("formatSignedEur", () => {
  it("spells out the sign with a true minus", () => {
    expect(formatSignedEur(1067.66)).toBe("+€1,067.66");
    expect(formatSignedEur(-21.69)).toBe("−€21.69");
    expect(formatSignedEur(0)).toBe("+€0.00");
  });
});
