import { describe, expect, it, vi } from "vitest";

// The demo client mirrors the real tables and views, and the demo data holds one split (Giulia).
vi.mock("@/integrations/supabase/client", async () => {
  const { createFakeClient } = await import("@/lib/demo/fake-client");
  return { supabase: createFakeClient(new Date("2026-11-08T12:00:00Z")) };
});

import {
  contactsFrom,
  evenShare,
  fetchSplitContacts,
  fetchSplits,
  joinNames,
  money,
  NO_NAME,
  owedEur,
  peopleFrom,
  parseNames,
  type SplitRow,
} from "./splits";

const row = (over: Partial<SplitRow> = {}): SplitRow => ({
  entry_reference: "r1",
  account_uid: "a1",
  booking_date: "2026-11-01",
  creditor_name: "Pizzeria",
  owed_by: "Anna",
  owed_settled: false,
  signed_amount_eur: -30,
  personal_signed_amount_eur: -10,
  ...over,
});

describe("splits", () => {
  it("parses and joins comma-separated names", () => {
    expect(parseNames(" Anna , ,Luca M ")).toEqual(["Anna", "Luca M"]);
    expect(parseNames(null)).toEqual([]);
    expect(joinNames(["Anna", "Luca M"])).toBe("Anna, Luca M");
    expect(joinNames([])).toBeNull();
  });

  it("splits evenly to the cent", () => {
    expect(evenShare(20, 3)).toBe(6.67);
    expect(evenShare(20, 2)).toBe(10);
  });

  // protects=saved contacts; fails_when=names repeat by case or lose their most-used order
  it("lists past names once, most used first", () => {
    expect(
      contactsFrom([
        { owed_by: "Luca M" },
        { owed_by: "anna, luca m" },
        { owed_by: null },
        { owed_by: "Bea" },
        { owed_by: "Anna" },
      ]),
    ).toEqual(["anna", "Luca M", "Bea"]);
  });

  it("computes what the others owe on a charge", () => {
    expect(owedEur(row())).toBe(20);
    expect(owedEur(row({ personal_signed_amount_eur: -30 }))).toBe(0);
    expect(owedEur(row({ signed_amount_eur: null, personal_signed_amount_eur: null }))).toBe(0);
  });

  // protects=refunds of a split bill; fails_when=a refund adds to what people owe
  it("counts a split refund against what they owe", () => {
    expect(owedEur(row({ signed_amount_eur: 100, personal_signed_amount_eur: 50 }))).toBe(-50);
  });

  // protects=who-owes-what totals; fails_when=settled splits count or shared splits double count
  it("totals open amounts per person, sharing multi-person splits", () => {
    const people = peopleFrom([
      row(),
      row({ owed_by: "anna, Luca" }),
      row({ owed_by: null }),
      row({ owed_by: "Luca", owed_settled: true }),
      row({ owed_by: "Bea", signed_amount_eur: -20.01, personal_signed_amount_eur: -20 }),
      row({ owed_by: "Bea", signed_amount_eur: 0.01, personal_signed_amount_eur: 0 }),
    ]);
    expect(people.map((p) => [p.name, p.open, p.rows.length])).toEqual([
      ["Anna", 30, 2],
      [NO_NAME, 20, 1],
      ["Luca", 10, 2],
      ["Bea", 0, 2],
    ]);
  });
});

describe("fetching splits", () => {
  it("reads saved contacts and open splits", async () => {
    expect(await fetchSplitContacts()).toContain("Giulia");
    const splits = await fetchSplits();
    expect(splits.length).toBeGreaterThan(0);
    expect(splits.every((r) => owedEur(r) > 0)).toBe(true);
    expect(peopleFrom(splits)[0]?.name).toBe("Giulia");
  });

  // protects=no double counting with Splitwise; fails_when=a charge matched to a Splitwise expense
  // or moved to transfers still shows as a split bill
  it("leaves out charges matched to Splitwise and transfers", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const [first, second] = await fetchSplits();
    await supabase
      .from("transactions")
      .update({ import_batch_id: "batch-1" })
      .eq("entry_reference", first!.entry_reference!);
    await supabase
      .from("transactions")
      .update({ flow_type: "transfer" })
      .eq("entry_reference", second!.entry_reference!);
    const refs = (await fetchSplits()).map((r) => r.entry_reference);
    expect(refs).not.toContain(first!.entry_reference);
    expect(refs).not.toContain(second!.entry_reference);
  });
});

describe("money with a bad currency code", () => {
  it("#7 writes it as text instead of throwing", () => {
    expect(money(12.5, "XX1")).toBe("12.50 XX1");
  });
});
