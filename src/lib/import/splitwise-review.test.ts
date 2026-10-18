import { describe, expect, it } from "vitest";
import {
  categoryChoices,
  defaultSelection,
  makeRate,
  toBankTx,
  type BankRowFromDb,
} from "./splitwise-review";

const dbRow = (over: Partial<BankRowFromDb> = {}): BankRowFromDb => ({
  account_uid: "acc",
  entry_reference: "e1",
  booking_date: "2026-08-16",
  amount: 12.34,
  currency: "USD",
  credit_debit_indicator: "DBIT",
  personal_amount: null,
  flow_type: null,
  deleted_at: null,
  ...over,
});

describe("makeRate", () => {
  const rate = makeRate([
    { currency: "USD", date: "2026-08-10", rate_to_eur: 0.9 },
    { currency: "USD", date: "2026-08-14", rate_to_eur: 0.92 },
    { currency: "CHF", date: "2026-08-14", rate_to_eur: 1.04 },
  ]);

  // protects=the rate used to compare Splitwise amounts to the bank; fails_when=a later rate is
  // used for an earlier date, or EUR is not 1
  it("uses the latest rate on or before the date", () => {
    expect(rate("USD", "2026-08-14")).toBe(0.92);
    expect(rate("USD", "2026-08-13")).toBe(0.9);
    expect(rate("USD", "2026-09-30")).toBe(0.92);
  });
  it("returns null when there is no rate yet, and 1 for euros", () => {
    expect(rate("USD", "2026-08-09")).toBeNull();
    expect(rate("GBP", "2026-08-14")).toBeNull();
    expect(rate("EUR", "2020-01-01")).toBe(1);
  });
});

describe("toBankTx", () => {
  it("converts a bank row to cents and a direction", () => {
    expect(toBankTx(dbRow({ personal_amount: 5 }))).toEqual({
      entryReference: "e1",
      accountUid: "acc",
      bookingDate: "2026-08-16",
      amountCents: 1234,
      currency: "USD",
      direction: "DBIT",
      personalAmountCents: 500,
      flowType: null,
    });
  });
  it("skips deleted rows and rows it cannot place", () => {
    expect(toBankTx(dbRow({ deleted_at: "2026-09-01" }))).toBeNull();
    expect(toBankTx(dbRow({ booking_date: null }))).toBeNull();
    expect(toBankTx(dbRow({ account_uid: null }))).toBeNull();
    expect(toBankTx(dbRow({ credit_debit_indicator: null }))).toBeNull();
  });
});

describe("categoryChoices", () => {
  it("lists each Splitwise category once with the app's suggestion", () => {
    const rows = [
      { category: "Dining out" },
      { category: "Groceries" },
      { category: "Dining out" },
    ];
    expect(categoryChoices(rows)).toEqual([
      { source: "Dining out", suggested: "Dine Out" },
      { source: "Groceries", suggested: "Groceries" },
    ]);
  });
});

describe("defaultSelection", () => {
  it("ticks only the sure matches", () => {
    const picked = defaultSelection([
      { row: 3, confidence: "likely" },
      { row: 4, confidence: "ambiguous" },
    ]);
    expect([...picked]).toEqual([3]);
  });
});
