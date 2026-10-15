import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UNCATEGORIZED,
  filterTransactions,
  formatAmountPlain,
  formatBookingDate,
  formatMoney,
  isWorthItEligible,
  listCategories,
  nativeSignedAmount,
  startOfMonth,
  type TransactionRow,
} from "./transactions";

const tx = (over: Partial<TransactionRow> = {}): TransactionRow => ({
  entry_reference: "r1",
  account_uid: "a1",
  booking_date: "2026-10-05",
  category: "Shopping",
  transaction_type: "One-time",
  creditor_name: "Amazon",
  currency: "EUR",
  amount: 20,
  signed_amount_eur: -20,
  credit_debit_indicator: "DBIT",
  created_at: "2026-10-05T08:00:00Z",
  worth_it: null,
  personal_amount: null,
  owed_by: null,
  ...over,
});

describe("isWorthItEligible", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T12:00:00Z")); // 4h after created_at
  });
  afterEach(() => vi.useRealTimers());

  it("accepts an unanswered discretionary debit older than 3 hours", () => {
    expect(isWorthItEligible(tx())).toBe(true);
  });

  it("rejects a purchase younger than 3 hours", () => {
    expect(isWorthItEligible(tx({ created_at: "2026-10-05T10:00:00Z" }))).toBe(false);
  });

  it("rejects amounts below 15 and accepts exactly 15", () => {
    expect(isWorthItEligible(tx({ amount: 14.99 }))).toBe(false);
    expect(isWorthItEligible(tx({ amount: 15 }))).toBe(true);
  });

  it("rejects non-discretionary or missing categories", () => {
    expect(isWorthItEligible(tx({ category: "Groceries" }))).toBe(false);
    expect(isWorthItEligible(tx({ category: null }))).toBe(false);
  });

  it("rejects credits and already-answered transactions", () => {
    expect(isWorthItEligible(tx({ credit_debit_indicator: "CRDT" }))).toBe(false);
    expect(isWorthItEligible(tx({ worth_it: "yes" }))).toBe(false);
  });

  it("rejects a transaction without created_at", () => {
    expect(isWorthItEligible(tx({ created_at: null }))).toBe(false);
  });
});

describe("money formatting", () => {
  it("formats a currency amount with two decimals", () => {
    expect(formatMoney(1234.5, "EUR")).toBe("€1,234.50");
  });

  it("formats a plain amount without sign or symbol", () => {
    expect(formatAmountPlain(-12.5)).toBe("12.50");
    expect(formatAmountPlain(3)).toBe("3.00");
  });
});

describe("nativeSignedAmount", () => {
  it("is negative when the EUR amount is negative", () => {
    expect(nativeSignedAmount(tx({ amount: 10, signed_amount_eur: -9 }))).toBe(-10);
  });

  it("is positive when the EUR amount is positive", () => {
    expect(nativeSignedAmount(tx({ amount: 10, signed_amount_eur: 9 }))).toBe(10);
  });

  it("falls back to the amount's own sign when EUR is missing", () => {
    expect(nativeSignedAmount(tx({ amount: -10, signed_amount_eur: null }))).toBe(-10);
    expect(nativeSignedAmount(tx({ amount: 10, signed_amount_eur: null }))).toBe(10);
  });

  it("is null without an amount", () => {
    expect(nativeSignedAmount(tx({ amount: null }))).toBeNull();
  });
});

describe("dates", () => {
  it("formats a booking date for en-GB", () => {
    expect(formatBookingDate("2026-10-05")).toBe("5 Oct 2026");
  });

  it("shows a dash when there is no booking date", () => {
    expect(formatBookingDate(null)).toBe("—");
  });

  it("finds the first day of the month", () => {
    expect(startOfMonth(new Date(2026, 9, 17))).toEqual(new Date(2026, 9, 1));
  });
});

describe("listCategories", () => {
  it("returns sorted unique categories and flags uncategorized rows", () => {
    const result = listCategories([
      tx({ category: "Shopping" }),
      tx({ category: "Groceries" }),
      tx({ category: "Shopping" }),
      tx({ category: null }),
    ]);
    expect(result).toEqual({ list: ["Groceries", "Shopping"], hasUncategorized: true });
  });

  it("reports no uncategorized rows when all have one", () => {
    expect(listCategories([tx()]).hasUncategorized).toBe(false);
  });
});

describe("filterTransactions", () => {
  const rows = [
    tx({ entry_reference: "1", creditor_name: "Amazon", category: "Shopping" }),
    tx({ entry_reference: "2", creditor_name: "Netflix", category: "Entertainment" }),
    tx({ entry_reference: "3", creditor_name: null, category: null }),
  ];
  const refs = (list: Array<TransactionRow>) => list.map((r) => r.entry_reference);

  it("returns everything for all categories and an empty search", () => {
    expect(refs(filterTransactions(rows, "", "all"))).toEqual(["1", "2", "3"]);
  });

  it("filters by an exact category", () => {
    expect(refs(filterTransactions(rows, "", "Shopping"))).toEqual(["1"]);
  });

  it("filters to uncategorized rows", () => {
    expect(refs(filterTransactions(rows, "", UNCATEGORIZED))).toEqual(["3"]);
  });

  it("searches merchant names case-insensitively and trims the query", () => {
    expect(refs(filterTransactions(rows, "  NETF ", "all"))).toEqual(["2"]);
  });

  it("combines search and category", () => {
    expect(refs(filterTransactions(rows, "amazon", "Entertainment"))).toEqual([]);
  });

  it("treats a missing merchant as empty text", () => {
    expect(refs(filterTransactions(rows, "zzz", "all"))).toEqual([]);
  });
});
