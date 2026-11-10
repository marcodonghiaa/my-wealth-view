import { describe, expect, it } from "vitest";
import { needsReview, pairIdByTx, reviewGroups, type ReviewRow } from "./transfer-review";

const row = (over: Partial<ReviewRow>): ReviewRow => ({
  entry_reference: "r1",
  account_uid: "a1",
  booking_date: "2026-10-02",
  category: "Transfer",
  creditor_name: "Revolut",
  merchant_key: "revolut",
  currency: "EUR",
  amount: 10,
  credit_debit_indicator: "DBIT",
  flow_type: "spend",
  flow_source: "default",
  ...over,
});

describe("pairIdByTx", () => {
  it("maps both sides of a pair to its id", () => {
    const map = pairIdByTx([
      { id: "p1", out_account_uid: "a1", out_ref: "o", in_account_uid: "a2", in_ref: "i" },
    ]);
    expect(map.get("a1|o")).toBe("p1");
    expect(map.get("a2|i")).toBe("p1");
    expect(map.size).toBe(2);
  });
});

describe("needsReview", () => {
  it("flags a Transfer counted as spend or income", () => {
    expect(needsReview(row({}))).toBe(true);
    expect(needsReview(row({ credit_debit_indicator: "CRDT", flow_type: "income" }))).toBe(true);
  });
  it("flags Income left out as a transfer", () => {
    expect(needsReview(row({ category: "Income", flow_type: "transfer" }))).toBe(true);
  });
  it("reads a missing flow as the row's direction", () => {
    expect(needsReview(row({ flow_type: null }))).toBe(true);
    expect(needsReview(row({ category: "Income", flow_type: null }))).toBe(false);
  });
  it("skips rows that agree, other categories, and anything the user decided", () => {
    expect(needsReview(row({ flow_type: "transfer" }))).toBe(false);
    expect(needsReview(row({ category: "Income", flow_type: "income" }))).toBe(false);
    expect(needsReview(row({ category: "Groceries" }))).toBe(false);
    expect(needsReview(row({ flow_source: "user" }))).toBe(false);
  });
});

describe("reviewGroups", () => {
  it("groups by merchant, falls back to the name, totals per currency, biggest first", () => {
    const groups = reviewGroups([
      row({ entry_reference: "a", merchant_key: null, creditor_name: "Mum" }),
      row({ entry_reference: "b" }),
      row({ entry_reference: "c", credit_debit_indicator: "CRDT", flow_type: "income", amount: 4 }),
      row({ entry_reference: "d", currency: "USD", amount: 2 }),
      row({ entry_reference: "e", category: "Groceries" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["revolut", "Mum"]);
    expect(groups[0]!.rows).toHaveLength(3);
    expect(groups[0]!.totals).toEqual([
      { currency: "EUR", amount: -6 },
      { currency: "USD", amount: -2 },
    ]);
    expect(groups[0]!.direction).toBe("mixed");
    expect(groups[1]!.direction).toBe("spend");
    expect(groups[1]!.name).toBe("Mum");
  });

  it("names a group with no name null and a credit-only group income", () => {
    const [g] = reviewGroups([
      row({
        merchant_key: null,
        creditor_name: null,
        category: "Income",
        credit_debit_indicator: "CRDT",
        flow_type: "transfer",
      }),
    ]);
    expect(g).toMatchObject({ key: "", name: null, direction: "income" });
  });
});
