import { describe, expect, it } from "vitest";
import { classifyRows } from "./splitwise-classify";
import type { SplitwiseRow } from "./splitwise-parse";
import {
  fingerprintRows,
  manualMatch,
  manualSplit,
  matchBank,
  nearbyPayments,
  type BankTx,
} from "./splitwise-match";

const row = (over: Partial<SplitwiseRow> = {}): SplitwiseRow => ({
  row: 1,
  date: "2026-08-16",
  description: "Uber",
  category: "Taxi",
  costCents: 9900,
  currency: "USD",
  netCents: [6900, -3000, -3900],
  ...over,
});

const classify = (rows: Array<SplitwiseRow>) =>
  classifyRows({ members: ["Me", "Ben", "Cy"], rows, total: null }, 0);

const tx = (over: Partial<BankTx> = {}): BankTx => ({
  entryReference: "e1",
  accountUid: "a1",
  bookingDate: "2026-08-18",
  amountCents: 8900,
  currency: "EUR",
  direction: "DBIT",
  personalAmountCents: null,
  flowType: null,
  ...over,
});

const rate = (currency: string): number | null => ({ USD: 0.9, EUR: 1 })[currency] ?? null;

describe("fingerprintRows", () => {
  // protects=importing the same file twice without duplicates; fails_when=a row's id changes
  // between imports or two real repeats collapse into one; no_claim=detecting edited expenses
  it("gives identical rows different ids, and the same ids on every run", () => {
    const rows = classify([row({ row: 1 }), row({ row: 2 })]);
    const first = fingerprintRows(rows);
    expect(new Set(first).size).toBe(2);
    expect(fingerprintRows(rows)).toEqual(first);
  });

  it("does not change when other members' columns change", () => {
    const a = fingerprintRows(classify([row()]));
    const b = fingerprintRows(classify([row({ netCents: [6900, -1000, -5900] })]));
    expect(b).toEqual(a);
  });

  it("changes when the date, description, cost or my amount change", () => {
    const base = fingerprintRows(classify([row()]))[0];
    for (const change of [
      { date: "2026-08-17" },
      { description: "Lyft" },
      { costCents: 10000, netCents: [7000, -3000, -4000] },
      { netCents: [6000, -3000, -3000] },
    ]) {
      expect(fingerprintRows(classify([row(change)]))[0]).not.toBe(base);
    }
  });
});

describe("matchBank", () => {
  // protects=suggestions shown to the user; fails_when=a wrong bank transaction is proposed or a
  // handled one is touched again; no_claim=anything is written (these are only suggestions)
  it("suggests the card payment for an expense I paid, with my share of it", () => {
    const result = matchBank(classify([row({ netCents: [6900, -3000, -3900] })]), [tx()], rate);
    expect(result).toEqual([
      {
        row: 1,
        entryReference: "e1",
        accountUid: "a1",
        action: "set_personal_amount",
        confidence: "likely",
        personalAmountCents: 2697,
      },
    ]);
  });

  it("suggests marking the transfer for a settle-up I sent", () => {
    const rows = classify([
      row({ category: "Payment", costCents: 5000, netCents: [5000, -5000, 0] }),
    ]);
    const result = matchBank(rows, [tx({ amountCents: 4500 })], rate);
    expect(result).toMatchObject([{ row: 1, action: "mark_transfer", confidence: "likely" }]);
  });

  it("matches a settle-up I received only to money coming in", () => {
    const rows = classify([
      row({ category: "Payment", costCents: 5000, netCents: [-5000, 5000, 0] }),
    ]);
    expect(matchBank(rows, [tx({ amountCents: 4500 })], rate)).toEqual([]);
    expect(matchBank(rows, [tx({ amountCents: 4500, direction: "CRDT" })], rate)).toHaveLength(1);
  });

  it("ignores rows that are not mine to match", () => {
    const rows = classify([
      row({ netCents: [-3000, 6000, -3000] }),
      row({ row: 2, netCents: [0, 3000, -3000] }),
    ]);
    expect(matchBank(rows, [tx()], rate)).toEqual([]);
  });

  it("ignores a transaction outside the date window or off in amount", () => {
    const rows = classify([row()]);
    expect(matchBank(rows, [tx({ bookingDate: "2026-08-30" })], rate)).toEqual([]);
    expect(matchBank(rows, [tx({ bookingDate: "2026-07-10" })], rate)).toEqual([]);
    expect(matchBank(rows, [tx({ amountCents: 7000 })], rate)).toEqual([]);
  });

  it("finds an expense entered in Splitwise long after it was paid, if the amount is exact", () => {
    const rows = classify([row({ date: "2026-10-18" })]);
    const early = tx({ bookingDate: "2026-10-01", amountCents: 8910 });
    expect(matchBank(rows, [early], rate)).toMatchObject([
      { entryReference: "e1", confidence: "ambiguous" },
    ]);
    expect(matchBank(rows, [{ ...early, amountCents: 8700 }], rate)).toEqual([]);
    expect(matchBank(rows, [{ ...early, bookingDate: "2026-09-05" }], rate)).toEqual([]);
  });

  it("ignores a transaction whose booking date is not a date", () => {
    expect(matchBank(classify([row()]), [tx({ bookingDate: "n/a" })], rate)).toEqual([]);
  });

  it("ignores transactions already split or marked as a transfer", () => {
    const rows = classify([row()]);
    expect(matchBank(rows, [tx({ personalAmountCents: 100 })], rate)).toEqual([]);
    expect(matchBank(rows, [tx({ flowType: "transfer" })], rate)).toEqual([]);
  });

  it("gives up on a row when no exchange rate is known", () => {
    expect(matchBank(classify([row({ currency: "CHF" })]), [tx()], rate)).toEqual([]);
    expect(matchBank(classify([row()]), [tx({ currency: "CHF" })], rate)).toEqual([]);
  });

  it("uses one transaction for one row only", () => {
    const rows = classify([row({ row: 1 }), row({ row: 2 })]);
    const result = matchBank(rows, [tx()], rate);
    expect(result).toHaveLength(1);
    expect(result[0]?.confidence).toBe("ambiguous");
  });

  it("flags as ambiguous a row with several candidates and proposes the closest", () => {
    const result = matchBank(
      classify([row()]),
      [
        tx({ entryReference: "far", bookingDate: "2026-08-22", amountCents: 8800 }),
        tx({ entryReference: "near", bookingDate: "2026-08-17", amountCents: 8910 }),
      ],
      rate,
    );
    expect(result).toMatchObject([{ entryReference: "near", confidence: "ambiguous" }]);
  });
});

describe("nearbyPayments", () => {
  // Uber on 2026-08-16, paid by me: cost 99 USD, my share 30 USD (net +69 = others owe me).
  const [uber] = classify([row()]);
  const key = (t: BankTx) => `${t.accountUid}|${t.entryReference}`;

  it("lists money out around the date, any amount, closest date first", () => {
    const list = nearbyPayments(
      uber!,
      [
        tx({ entryReference: "far", bookingDate: "2026-08-22", amountCents: 100 }),
        tx({ entryReference: "same", bookingDate: "2026-08-16", amountCents: 50 }),
        tx({ entryReference: "before", bookingDate: "2026-08-14", amountCents: 999999 }),
      ],
      new Set(),
    );
    expect(list.map((t) => t.entryReference)).toEqual(["same", "before", "far"]);
  });

  it("leaves out money in, other dates, split or transfer rows, and taken payments", () => {
    const taken = tx({ entryReference: "taken" });
    const list = nearbyPayments(
      uber!,
      [
        tx({ entryReference: "in", direction: "CRDT" }),
        tx({ entryReference: "early", bookingDate: "2026-08-12" }),
        tx({ entryReference: "late", bookingDate: "2026-08-24" }),
        tx({ entryReference: "split", personalAmountCents: 100 }),
        tx({ entryReference: "transfer", flowType: "transfer" }),
        taken,
        tx({ entryReference: "ok" }),
      ],
      new Set([key(taken)]),
    );
    expect(list.map((t) => t.entryReference)).toEqual(["ok"]);
  });
});

describe("manualSplit", () => {
  const [uber] = classify([row()]);

  it("keeps the bank amount minus what the others owe, converted to the bank currency", () => {
    // Others owe 69 USD = 62.10 EUR; Revolut charged 80 EUR (a bigger total than in Splitwise).
    const split = manualSplit(uber!, tx({ amountCents: 8000 }), rate);
    expect(split).toEqual({ othersOweCents: 6210, personalAmountCents: 1790 });
  });

  it("never goes below zero when the others owe more than the bank charge", () => {
    expect(manualSplit(uber!, tx({ amountCents: 5000 }), rate)?.personalAmountCents).toBe(0);
  });

  it("gives up when an exchange rate is missing", () => {
    expect(manualSplit(uber!, tx({ currency: "GBP" }), rate)).toBeNull();
    expect(manualSplit({ ...uber!, currency: "GBP" }, tx(), rate)).toBeNull();
  });

  it("does not convert when the expense and the payment share a currency", () => {
    // A rate that moves by day would make 69 USD drift if it were converted twice.
    const drifting = (c: string, d: string) =>
      c === "USD" ? (d === "2026-08-16" ? 0.9 : 0.91) : 1;
    const split = manualSplit(uber!, tx({ currency: "USD", amountCents: 9900 }), drifting);
    expect(split).toEqual({ othersOweCents: 6900, personalAmountCents: 3000 });
    // Even with no rate at all.
    expect(manualSplit(uber!, tx({ currency: "USD" }), () => null)?.othersOweCents).toBe(6900);
  });

  it("builds the link the plan writes", () => {
    const t = tx({ amountCents: 8000 });
    const split = manualSplit(uber!, t, rate)!;
    expect(manualMatch(uber!, t, split)).toEqual({
      row: 1,
      entryReference: "e1",
      accountUid: "a1",
      action: "set_personal_amount",
      confidence: "likely",
      personalAmountCents: 1790,
    });
  });
});
