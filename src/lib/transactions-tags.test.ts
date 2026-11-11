import { describe, expect, it } from "vitest";
import {
  filterTransactions,
  listTags,
  normalizeNote,
  normalizeTags,
  type TransactionRow,
} from "./transactions";

const row = (p: Partial<TransactionRow>): TransactionRow => ({
  entry_reference: "r",
  account_uid: "a",
  booking_date: "2026-11-01",
  category: null,
  transaction_type: null,
  creditor_name: null,
  currency: "EUR",
  amount: 1,
  signed_amount_eur: -1,
  credit_debit_indicator: "DBIT",
  created_at: null,
  worth_it: null,
  personal_amount: null,
  owed_by: null,
  flow_type: "spend",
  refund_of: null,
  ...p,
});

describe("normalizeTags", () => {
  it("trims, collapses spaces, drops blanks and case-insensitive repeats", () => {
    expect(normalizeTags(["  Trip ", "trip", "", "  ", "work  travel", "Work travel"])).toEqual([
      "Trip",
      "work travel",
    ]);
  });
  it("cuts long tags and keeps at most 20", () => {
    expect(normalizeTags(["x".repeat(60)])).toEqual(["x".repeat(40)]);
    expect(normalizeTags(Array.from({ length: 25 }, (_, i) => `t${i}`))).toHaveLength(20);
  });
});

describe("normalizeNote", () => {
  it("is null when empty, trimmed otherwise", () => {
    expect(normalizeNote("   ")).toBeNull();
    expect(normalizeNote("  paid for Anna  ")).toBe("paid for Anna");
    expect(normalizeNote("x".repeat(2100))).toHaveLength(2000);
  });
});

describe("listTags", () => {
  it("lists each tag once, sorted, ignoring rows without tags", () => {
    expect(listTags([{ tags: ["work", "trip"] }, { tags: ["trip"] }, { tags: null }, {}])).toEqual([
      "trip",
      "work",
    ]);
  });
});

describe("filterTransactions by tag and note", () => {
  const rows = [
    row({ entry_reference: "1", creditor_name: "Hotel", tags: ["trip"] }),
    row({ entry_reference: "2", creditor_name: "Cafe", note: "Lunch with the team" }),
    row({ entry_reference: "3", creditor_name: "Shop" }),
  ];
  const refs = (r: Array<TransactionRow>) => r.map((t) => t.entry_reference);
  it("keeps only rows with the tag", () => {
    expect(refs(filterTransactions(rows, "", "all", { tag: "trip" }))).toEqual(["1"]);
    expect(refs(filterTransactions(rows, "", "all", { tag: "all" }))).toEqual(["1", "2", "3"]);
  });
  it("search matches the note as well as the name", () => {
    expect(refs(filterTransactions(rows, "team", "all"))).toEqual(["2"]);
    expect(refs(filterTransactions(rows, "hotel", "all"))).toEqual(["1"]);
  });
});

// polish-1 #12: limits count characters like the database (char_length), so an emoji at the
// boundary is kept whole, never cut in half (half an emoji is refused by Postgres).
describe("length limits count characters, not UTF-16 units", () => {
  it("keeps an emoji at the tag and note boundary whole", () => {
    const tag = `${"x".repeat(39)}😀`;
    expect(normalizeTags([tag])).toEqual([tag]);
    expect(normalizeTags([`${"x".repeat(40)}😀`])).toEqual(["x".repeat(40)]);
    const note = `${"x".repeat(1999)}😀`;
    expect(normalizeNote(note)).toBe(note);
    expect(normalizeNote(`${"😀".repeat(2001)}`)).toBe("😀".repeat(2000));
  });
});

// polish-1 #13: invisible format characters would make an invisible "#" tag (the database refuses them).
describe("tags drop invisible characters", () => {
  it("strips zero-width and other format characters", () => {
    expect(normalizeTags(["​", "wo‍rk", "﻿trip­"])).toEqual(["work", "trip"]);
  });
});
