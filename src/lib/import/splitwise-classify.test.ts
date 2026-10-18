import { describe, expect, it } from "vitest";
import type { SplitwiseFile, SplitwiseRow } from "./splitwise-parse";
import { classifyRows, summarize } from "./splitwise-classify";

const row = (over: Partial<SplitwiseRow>): SplitwiseRow => ({
  row: 1,
  date: "2026-08-16",
  description: "x",
  category: "General",
  costCents: 900,
  currency: "USD",
  netCents: [0, 0, 0],
  ...over,
});

const file = (rows: Array<SplitwiseRow>): SplitwiseFile => ({
  members: ["Me", "Ben", "Cy"],
  rows,
  total: null,
});

const classifyOne = (over: Partial<SplitwiseRow>, me = 0) => {
  const [result] = classifyRows(file([row(over)]), me);
  return result;
};

describe("classifyRows", () => {
  // protects=what counts as my spending; fails_when=a share is computed from the wrong person or
  // a settle-up is treated as an expense; no_claim=matching to bank transactions
  it("paid by someone else: my share is what I owe", () => {
    expect(classifyOne({ netCents: [-300, 600, -300] })).toMatchObject({
      kind: "paid_by_other",
      shareCents: 300,
    });
  });

  it("paid by me: my share is the cost minus what I am owed", () => {
    expect(classifyOne({ netCents: [600, -300, -300] })).toMatchObject({
      kind: "paid_by_me",
      shareCents: 300,
    });
  });

  it("paid by me for others only: my share is zero", () => {
    expect(classifyOne({ netCents: [900, -450, -450] })).toMatchObject({
      kind: "paid_by_me",
      shareCents: 0,
    });
  });

  it("not involved when my amount is zero and someone else's is not", () => {
    expect(classifyOne({ netCents: [0, 600, -600] })).toMatchObject({
      kind: "not_involved",
      shareCents: null,
    });
  });

  it("a full-cost expense between two people is an expense, not a payment", () => {
    expect(classifyOne({ costCents: 850, netCents: [-850, 850, 0] })).toMatchObject({
      kind: "paid_by_other",
      shareCents: 850,
    });
  });

  it("unclear when every amount is zero", () => {
    expect(classifyOne({ netCents: [0, 0, 0] })).toMatchObject({
      kind: "unclear",
      shareCents: null,
    });
  });

  it("unclear when more than one person paid, whoever I am", () => {
    expect(classifyOne({ netCents: [200, 100, -300] })).toMatchObject({
      kind: "unclear",
      shareCents: null,
    });
    expect(classifyOne({ netCents: [-300, 100, 200] })).toMatchObject({
      kind: "unclear",
      shareCents: null,
    });
  });

  it("a negative cost is a refund and has no share", () => {
    expect(classifyOne({ costCents: -900, netCents: [-600, 300, 300] })).toMatchObject({
      kind: "refund",
      shareCents: null,
    });
  });

  describe("settle-ups (Payment rows)", () => {
    it("I paid someone back", () => {
      expect(
        classifyOne({ category: "Payment", costCents: 3169, netCents: [3169, -3169, 0] }),
      ).toMatchObject({ kind: "settle_out", shareCents: null });
    });

    it("someone paid me back", () => {
      expect(
        classifyOne({ category: "Payment", costCents: 617, netCents: [-617, 617, 0] }),
      ).toMatchObject({ kind: "settle_in", shareCents: null });
    });

    it("two other people settled up", () => {
      expect(
        classifyOne({ category: "Payment", costCents: 349, netCents: [0, 349, -349] }),
      ).toMatchObject({ kind: "settle_other", shareCents: null });
    });

    it.each(["payment", "PAYMENT", "Zahlung", "Pagamento", "Paiement", "Pago"])(
      "recognises the label %s",
      (category) => {
        expect(classifyOne({ category, costCents: 500, netCents: [500, -500, 0] })?.kind).toBe(
          "settle_out",
        );
      },
    );
  });

  it("uses the chosen member as me", () => {
    const f = file([row({ netCents: [-300, 600, -300] })]);
    expect(classifyRows(f, 1)[0]).toMatchObject({ kind: "paid_by_me", shareCents: 300 });
    expect(classifyRows(f, 2)[0]).toMatchObject({ kind: "paid_by_other", shareCents: 300 });
  });

  it("rejects a member index that does not exist", () => {
    expect(() => classifyRows(file([row({})]), 3)).toThrow(/member/i);
    expect(() => classifyRows(file([row({})]), -1)).toThrow(/member/i);
  });
});

describe("summarize", () => {
  it("counts rows and adds up shares and settle-ups", () => {
    const rows = classifyRows(
      file([
        row({ row: 1, netCents: [-300, 600, -300] }),
        row({ row: 2, netCents: [-200, 400, -200], costCents: 600 }),
        row({ row: 3, netCents: [600, -300, -300] }),
        row({ row: 4, netCents: [0, 600, -600] }),
        row({ row: 5, category: "Payment", costCents: 1000, netCents: [1000, -1000, 0] }),
        row({ row: 6, category: "Payment", costCents: 250, netCents: [-250, 250, 0] }),
      ]),
      0,
    );
    expect(summarize(rows)).toEqual({
      paidByOther: { count: 2, shareCents: 500 },
      paidByMe: { count: 1, costCents: 900, shareCents: 300 },
      notInvolved: { count: 1 },
      unclear: { count: 0 },
      refunds: { count: 0 },
      settledOutCents: 1000,
      settledInCents: 250,
    });
  });
});
