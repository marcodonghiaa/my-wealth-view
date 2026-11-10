import { describe, expect, it } from "vitest";
import { accountTypeLabel, debtEur, isDebt, parseOwed } from "./account-types";

describe("isDebt", () => {
  it("is true for credit cards and loans only", () => {
    expect(isDebt("credit_card")).toBe(true);
    expect(isDebt("loan")).toBe(true);
    for (const t of ["checking", "savings", "investment", "other", null, undefined])
      expect(isDebt(t)).toBe(false);
  });
});

describe("debtEur", () => {
  it("is negative whatever sign the bank uses", () => {
    expect(debtEur(120)).toBe(-120);
    expect(debtEur(-120)).toBe(-120);
  });
  // -0 would show as "-€0.00".
  it("is a plain 0 for a missing or zero balance", () => {
    expect(debtEur(null)).toBe(0);
    expect(debtEur(0)).toBe(0);
  });
});

describe("accountTypeLabel", () => {
  it("names the type, and unknown as checking", () => {
    expect(accountTypeLabel("credit_card")).toBe("Credit card");
    expect(accountTypeLabel(null)).toBe("Checking");
    expect(accountTypeLabel("weird")).toBe("Checking");
  });
});

describe("parseOwed", () => {
  it("reads 0 or more, with a dot or a comma", () => {
    expect(parseOwed("0")).toBe(0);
    expect(parseOwed(" 1250.5 ")).toBe(1250.5);
    expect(parseOwed("12,30")).toBe(12.3);
  });
  it("refuses empty, negative, text, too many decimals and absurd amounts", () => {
    for (const s of ["", "-5", "abc", "1.234", "1e5", "2000000000000"])
      expect(parseOwed(s)).toBeNull();
  });
});
