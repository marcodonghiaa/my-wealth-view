import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UNCATEGORIZED,
  filterTransactions,
  formatAmountPlain,
  formatBookingDate,
  formatBookingDateShort,
  formatMoney,
  isSplitwiseShare,
  isWorthItEligible,
  mergeShares,
  shareToRow,
  type SplitwiseShare,
  listCategories,
  nameRefunds,
  nativeSignedAmount,
  personalAmountEur,
  restoredFlow,
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
  flow_type: "spend",
  refund_of: null,
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

describe("nameRefunds", () => {
  it("names a nameless refund after the charge it reverses", () => {
    const charge = tx({ entry_reference: "c1", creditor_name: "Tweethuntr" });
    const refund = tx({
      entry_reference: "r1",
      creditor_name: null,
      flow_type: "refunded",
      refund_of: "c1",
      credit_debit_indicator: "CRDT",
    });
    expect(nameRefunds([charge, refund]).map((r) => r.creditor_name)).toEqual([
      "Tweethuntr",
      "Refund: Tweethuntr",
    ]);
  });

  it("falls back to a plain label when the charge is not in the list", () => {
    const refund = tx({ creditor_name: null, flow_type: "refunded", refund_of: "gone" });
    expect(nameRefunds([refund])[0]!.creditor_name).toBe("Refund");
  });

  it("leaves named and non-refund rows alone", () => {
    const rows = [
      tx(),
      tx({ entry_reference: "r2", creditor_name: "Shop", flow_type: "refunded", refund_of: "x" }),
    ];
    expect(nameRefunds(rows)).toEqual(rows);
  });
});

const share = (over: Partial<SplitwiseShare> = {}): SplitwiseShare => ({
  id: "s1",
  booking_date: "2026-10-04",
  category: "Dine Out",
  description: "Dinner",
  group_name: "Trip",
  currency: "EUR",
  amount: 12.5,
  amount_eur: 12.5,
  ...over,
});

describe("Splitwise shares in the transaction list", () => {
  // protects=a share reads like a spend row (negative euro amount, named after the expense);
  // fails_when=the sign flips or the description is lost
  it("turns a share into a spend row", () => {
    expect(shareToRow(share())).toMatchObject({
      entry_reference: "sw:s1",
      account_uid: null,
      creditor_name: "Dinner",
      category: "Dine Out",
      currency: "EUR",
      amount: 12.5,
      signed_amount_eur: -12.5,
      credit_debit_indicator: "DBIT",
      flow_type: "spend",
      booking_date: "2026-10-04",
    });
  });

  it("recognises shares and only shares", () => {
    expect(isSplitwiseShare(shareToRow(share()))).toBe(true);
    expect(isSplitwiseShare(tx())).toBe(false);
  });

  // protects=the month list stays newest first with shares in the right place; fails_when=shares are appended at the end
  it("merges shares into bank rows, newest first", () => {
    const rows = mergeShares(
      [
        tx({ entry_reference: "a", booking_date: "2026-10-05" }),
        tx({ entry_reference: "b", booking_date: "2026-10-02" }),
      ],
      [share({ booking_date: "2026-10-04" })],
    );
    expect(rows.map((r) => r.entry_reference)).toEqual(["a", "sw:s1", "b"]);
  });

  it("leaves bank rows untouched when there are no shares", () => {
    const bank = [tx()];
    expect(mergeShares(bank, [])).toEqual(bank);
  });
});

describe("formatBookingDateShort", () => {
  const now = new Date("2026-10-19T12:00:00");

  it("omits the year for the current year", () => {
    expect(formatBookingDateShort("2026-10-18", now)).toBe("18 Oct");
  });

  it("keeps the year for other years", () => {
    expect(formatBookingDateShort("2025-12-31", now)).toBe("31 Dec 2025");
  });

  it("shows a dash without a date", () => {
    expect(formatBookingDateShort(null, now)).toBe("—");
  });
});

describe("personalAmountEur", () => {
  it("uses the euro figures, not the native amount, for a foreign-currency charge", () => {
    expect(personalAmountEur({ personal_signed_amount_eur: -9.2, signed_amount_eur: -18.4 })).toBe(
      9.2,
    );
  });

  it("falls back to the full euro amount when nothing was split", () => {
    expect(personalAmountEur({ personal_signed_amount_eur: null, signed_amount_eur: -18.4 })).toBe(
      18.4,
    );
  });

  it("is zero when no euro figure exists", () => {
    expect(personalAmountEur({ personal_signed_amount_eur: null, signed_amount_eur: null })).toBe(
      0,
    );
  });
});

describe("restoredFlow", () => {
  // protects=a transfer moved back lands in spending or income by its direction;
  // fails_when=a debit goes back as income or a credit as spend
  it("sends a debit back to spend and anything else to income", () => {
    expect(restoredFlow(tx({ credit_debit_indicator: "DBIT" }))).toBe("spend");
    expect(restoredFlow(tx({ credit_debit_indicator: "CRDT" }))).toBe("income");
    expect(restoredFlow(tx({ credit_debit_indicator: null }))).toBe("income");
  });
});
