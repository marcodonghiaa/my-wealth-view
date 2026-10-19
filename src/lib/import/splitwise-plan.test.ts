import { describe, expect, it } from "vitest";
import { classifyRows } from "./splitwise-classify";
import type { BankMatch } from "./splitwise-match";
import { fingerprintRows } from "./splitwise-match";
import type { SplitwiseRow } from "./splitwise-parse";
import { planWrite } from "./splitwise-plan";

const row = (over: Partial<SplitwiseRow>): SplitwiseRow => ({
  row: 1,
  date: "2026-08-16",
  description: "Dinner",
  category: "Dining out",
  costCents: 9000,
  currency: "USD",
  netCents: [-3000, 6000, -3000],
  ...over,
});

const FRIEND_PAID = row({ row: 1 });
const I_PAID = row({
  row: 2,
  date: "2026-08-17",
  description: "Uber",
  netCents: [6900, -3000, -3900],
});
const PAID_ZERO = row({
  row: 3,
  date: "2026-08-18",
  description: "Gift",
  netCents: [9000, -4500, -4500],
});
const SETTLE = row({
  row: 4,
  date: "2026-08-19",
  category: "Payment",
  description: "Me paid Ann",
  costCents: 2500,
  netCents: [2500, -2500, 0],
});
const NOT_MINE = row({
  row: 5,
  date: "2026-08-20",
  description: "Concert",
  netCents: [0, 2000, -2000],
});

const rowsOf = (...r: Array<SplitwiseRow>) =>
  classifyRows({ members: ["Me", "Ann", "Ben"], rows: r, total: null }, 0);

const match = (over: Partial<BankMatch>): BankMatch => ({
  row: 2,
  entryReference: "e2",
  accountUid: "acc",
  action: "set_personal_amount",
  confidence: "likely",
  personalAmountCents: 2690,
  ...over,
});

const base = (rows = rowsOf(FRIEND_PAID, I_PAID, PAID_ZERO, SETTLE, NOT_MINE)) => ({
  group: "berkeley",
  rows,
  fingerprints: fingerprintRows(rows),
  confirmed: [] as Array<BankMatch>,
  existingLinks: new Map<string, { accountUid: string; entryReference: string }>(),
  includeUnmatchedPaidByMe: false,
  categoryFor: () => "Dining",
  rate: (c: string) => (c === "USD" ? 0.9 : null),
});

describe("planWrite", () => {
  // protects=exactly which rows get written and which bank transactions get changed; fails_when=
  // a share is counted twice, a bank link is lost or a row the user did not confirm is touched;
  // no_claim=that the database accepts the plan (the database rules are tested separately)
  it("records a share for an expense a friend paid, over the whole file's dates", () => {
    const plan = planWrite(base());
    expect(plan).toMatchObject({
      group: "berkeley",
      from: "2026-08-16",
      to: "2026-08-20",
      problems: [],
    });
    expect(plan.shares).toEqual([
      {
        fingerprint: expect.stringContaining("Dinner"),
        booking_date: "2026-08-16",
        description: "Dinner",
        category: "Dining",
        amount: 30,
        currency: "USD",
        linked_account_uid: null,
        linked_entry_reference: null,
      },
    ]);
    expect(plan.links).toEqual([]);
  });

  it("keeps a confirmed expense I paid as a share linked to its bank transaction", () => {
    const plan = planWrite({ ...base(), confirmed: [match({})] });
    expect(plan.shares).toHaveLength(2);
    expect(plan.shares[1]).toMatchObject({
      description: "Uber",
      amount: 21,
      linked_account_uid: "acc",
      linked_entry_reference: "e2",
    });
    expect(plan.links).toEqual([
      {
        account_uid: "acc",
        entry_reference: "e2",
        action: "set_personal_amount",
        personal_amount: 26.9,
      },
    ]);
  });

  it("keeps an earlier import's link without asking the bank to change again", () => {
    const b = base();
    const fingerprint = b.fingerprints[1] as string;
    const plan = planWrite({
      ...b,
      existingLinks: new Map([[fingerprint, { accountUid: "acc", entryReference: "old" }]]),
    });
    expect(plan.shares[1]).toMatchObject({
      linked_account_uid: "acc",
      linked_entry_reference: "old",
    });
    expect(plan.links).toEqual([]);
  });

  it("leaves an unmatched expense I paid out, unless I choose to add it", () => {
    expect(planWrite(base()).shares.map((s) => s.description)).toEqual(["Dinner"]);
    const added = planWrite({ ...base(), includeUnmatchedPaidByMe: true });
    expect(added.shares.map((s) => s.description)).toEqual(["Dinner", "Uber"]);
    expect(added.shares[1]).toMatchObject({ linked_account_uid: null, amount: 21 });
  });

  it("changes the bank for a matched expense where my share is zero, with no share row", () => {
    const plan = planWrite({
      ...base(),
      confirmed: [match({ row: 3, entryReference: "e3", personalAmountCents: 0 })],
    });
    expect(plan.shares.map((s) => s.description)).toEqual(["Dinner"]);
    expect(plan.links).toEqual([
      {
        account_uid: "acc",
        entry_reference: "e3",
        action: "set_personal_amount",
        personal_amount: 0,
      },
    ]);
  });

  it("marks a matched settle-up as a transfer and writes no share for it", () => {
    const plan = planWrite({
      ...base(),
      confirmed: [
        match({
          row: 4,
          entryReference: "e4",
          action: "mark_transfer",
        }),
      ],
    });
    expect(plan.links).toEqual([
      { account_uid: "acc", entry_reference: "e4", action: "mark_transfer", personal_amount: null },
    ]);
    expect(plan.shares).toHaveLength(1);
  });

  describe("problems that block the import", () => {
    it("a share with no exchange rate for its currency", () => {
      const plan = planWrite({ ...base(), rate: () => null });
      expect(plan.problems).toEqual([expect.stringMatching(/rate.*USD.*2026-08-16/i)]);
    });

    it("the same bank transaction confirmed for two rows", () => {
      const plan = planWrite({
        ...base(),
        confirmed: [match({}), match({ row: 3, personalAmountCents: 0 })],
      });
      expect(plan.problems).toEqual([expect.stringMatching(/e2.*more than one/i)]);
    });

    it("a confirmed match for a row that is not mine to link", () => {
      const plan = planWrite({
        ...base(),
        confirmed: [match({ row: 5 }), match({ row: 99, entryReference: "e9" })],
      });
      expect(plan.problems).toHaveLength(2);
      expect(plan.problems[0]).toMatch(/row 5/i);
      expect(plan.problems[1]).toMatch(/row 99/i);
    });

    it("an empty group name", () => {
      expect(planWrite({ ...base(), group: "  " }).problems).toEqual([
        expect.stringMatching(/group/i),
      ]);
    });

    it("a row whose id would be too long", () => {
      const long = rowsOf(row({ row: 1, description: "x".repeat(600) }));
      expect(planWrite(base(long)).problems).toEqual([expect.stringMatching(/row 1.*too long/i)]);
    });
  });

  it("cuts a long description to fit the database", () => {
    const long = rowsOf(row({ row: 1, description: "y".repeat(400) }));
    const plan = planWrite({ ...base(long), fingerprints: ["short-id"] });
    expect(plan.shares[0]?.description).toHaveLength(300);
    expect(plan.problems).toEqual([]);
  });

  it("writes nothing for a file with nothing of mine in it", () => {
    const plan = planWrite(base(rowsOf(NOT_MINE)));
    expect(plan.shares).toEqual([]);
    expect(plan.links).toEqual([]);
  });
});
