import { describe, expect, it } from "vitest";
import { classifyRows, summarize } from "./splitwise-classify";
import { fingerprintRows, matchBank, type BankTx } from "./splitwise-match";
import { parseSplitwiseCsv } from "./splitwise-parse";
import { hasErrors, validateSplitwise } from "./splitwise-validate";

// A small made-up group export that exercises every kind of row, run through the whole chain
// the import screen will use: read, check, classify, identify, suggest bank links.
const EXPORT = [
  "Date,Description,Category,Cost,Currency,Me,Ann,Ben",
  "",
  "2026-08-16,Dinner,Dining out,90.00,USD,60.00,-30.00,-30.00",
  "2026-08-17,Groceries,Groceries,60.00,USD,-20.00,40.00,-20.00",
  "2026-08-18,Concert,General,40.00,USD,0.00,20.00,-20.00",
  "2026-08-19,Me paid Ann,Payment,25.00,USD,25.00,-25.00,0.00",
  "2026-10-18,Late taxi,Taxi,30.00,USD,20.00,-10.00,-10.00",
  "",
  "2026-10-18,Total balance, , ,USD,85.00,-5.00,-80.00",
  "",
].join("\n");

const tx = (over: Partial<BankTx>): BankTx => ({
  entryReference: "x",
  accountUid: "usd",
  bookingDate: "2026-08-16",
  amountCents: 0,
  currency: "USD",
  direction: "DBIT",
  personalAmountCents: null,
  flowType: null,
  ...over,
});

const BANK = [
  tx({ entryReference: "dinner", bookingDate: "2026-08-16", amountCents: 9040 }),
  tx({ entryReference: "transfer", bookingDate: "2026-08-20", amountCents: 2500 }),
  tx({ entryReference: "taxi", bookingDate: "2026-10-01", amountCents: 3000 }),
  tx({ entryReference: "other", bookingDate: "2026-08-17", amountCents: 1200 }),
  tx({
    entryReference: "done",
    bookingDate: "2026-08-17",
    amountCents: 6010,
    personalAmountCents: 2000,
  }),
];

const usd = (currency: string) => (currency === "USD" ? 0.9 : currency === "EUR" ? 1 : null);

describe("Splitwise import, end to end", () => {
  // protects=the whole read-check-classify-match chain working together; fails_when=any stage
  // changes what the next one needs; no_claim=the screen or the database write (later steps)
  const file = parseSplitwiseCsv(EXPORT);
  const rows = classifyRows(file, 0);

  it("reads and passes every check", () => {
    expect(file.members).toEqual(["Me", "Ann", "Ben"]);
    expect(file.rows).toHaveLength(5);
    expect(validateSplitwise(file)).toEqual([]);
  });

  it("works out my spending and the settle-ups", () => {
    expect(summarize(rows)).toEqual({
      paidByOther: { count: 1, shareCents: 2000 },
      paidByMe: { count: 2, costCents: 12000, shareCents: 4000 },
      notInvolved: { count: 1 },
      unclear: { count: 0 },
      refunds: { count: 0 },
      settledOutCents: 2500,
      settledInCents: 0,
    });
  });

  it("suggests the right bank transactions and leaves the others alone", () => {
    expect(matchBank(rows, BANK, usd)).toEqual([
      {
        row: 1,
        entryReference: "dinner",
        accountUid: "usd",
        action: "set_personal_amount",
        confidence: "likely",
        personalAmountCents: 3013,
      },
      {
        row: 4,
        entryReference: "transfer",
        accountUid: "usd",
        action: "mark_transfer",
        confidence: "likely",
      },
      {
        row: 5,
        entryReference: "taxi",
        accountUid: "usd",
        action: "set_personal_amount",
        confidence: "ambiguous",
        personalAmountCents: 1000,
      },
    ]);
  });

  it("gives the same row ids when the same file is imported again", () => {
    const again = classifyRows(parseSplitwiseCsv(EXPORT), 0);
    expect(fingerprintRows(again)).toEqual(fingerprintRows(rows));
    expect(new Set(fingerprintRows(rows)).size).toBe(5);
  });

  it("stops at a broken file before anything is classified", () => {
    const broken = EXPORT.replace("-80.00", "-79.00");
    const issues = validateSplitwise(parseSplitwiseCsv(broken));
    expect(hasErrors(issues)).toBe(true);
    expect(issues[0]?.message).toMatch(/Ben.*total/i);
  });
});
