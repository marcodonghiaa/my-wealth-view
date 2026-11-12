import { describe, expect, it } from "vitest";
import {
  REGULAR_RULE,
  classifyIncome,
  incomeWindow,
  kindLabel,
  regularSenders,
  regularSources,
  ruleFor,
  senderKey,
  txKey,
  type IncomeRule,
  type IncomeTx,
} from "./regular-income";

let seq = 0;
const tx = (date: string, name: string | null, over: Partial<IncomeTx> = {}): IncomeTx => ({
  account_uid: "acc",
  entry_reference: `r${++seq}`,
  booking_date: date,
  merchant_key: name ? name.toLowerCase() : null,
  creditor_name: name,
  remittance_info: null,
  amount: 100,
  currency: "EUR",
  ...over,
});
const rule = (text: string, kind: string | null, over: Partial<IncomeRule> = {}): IncomeRule => ({
  id: `rule-${text}`,
  match_field: "creditor_name",
  match_text: text,
  match_mode: "word",
  set_income_kind: kind,
  ...over,
});

describe("REGULAR_RULE", () => {
  it("says the rule with its numbers", () => {
    expect(REGULAR_RULE).toBe("paid you in at least 3 of the last 6 months");
  });
});

describe("kindLabel", () => {
  it("says the kind in words", () => {
    expect(kindLabel("regular")).toBe("regular");
    expect(kindLabel("one_off")).toBe("one-off");
  });
});

describe("incomeWindow", () => {
  it("is the month and the five before it", () => {
    expect(incomeWindow(new Date(2026, 10, 1))).toEqual({ start: "2026-06-01", end: "2026-12-01" });
  });
  it("crosses a year", () => {
    expect(incomeWindow(new Date(2026, 1, 1))).toEqual({ start: "2025-09-01", end: "2026-03-01" });
  });
});

describe("senderKey", () => {
  it("prefers the sync's merchant key", () => {
    expect(senderKey({ merchant_key: "acme", creditor_name: "ACME S.p.A." })).toBe("acme");
  });
  it("falls back to the folded bank name", () => {
    expect(senderKey({ merchant_key: null, creditor_name: "  Café ROSSI " })).toBe("cafe rossi");
  });
  it("is null without either", () => {
    expect(senderKey({ merchant_key: null, creditor_name: "  " })).toBeNull();
  });
});

describe("regularSenders", () => {
  it("needs 3 different months, whatever the amounts", () => {
    const rows = [
      tx("2026-09-27", "Acme", { amount: 2000 }),
      tx("2026-10-27", "Acme", { amount: 4000 }), // a 13th month
      tx("2026-11-27", "Acme", { amount: 2000 }),
      tx("2026-11-02", "Gift"),
      tx("2026-11-20", "Gift"),
      tx("2026-10-05", "Gift"),
    ];
    // Gift paid 3 times but only in 2 months: not regular.
    expect([...regularSenders(rows)]).toEqual(["acme"]);
  });
  it("skips rows without a sender or a date", () => {
    expect(
      regularSenders([
        tx("2026-09-01", null),
        tx("2026-10-01", null),
        tx("2026-11-01", null),
        { ...tx("2026-11-01", "X"), booking_date: null },
      ]).size,
    ).toBe(0);
  });
});

describe("ruleFor", () => {
  it("matches the name, the description or either", () => {
    const t = tx("2026-11-01", "Acme Payroll", { remittance_info: "Stipendio novembre" });
    expect(ruleFor(t, [rule("acme", "regular")])?.id).toBe("rule-acme");
    expect(
      ruleFor(t, [rule("stipendio", "regular", { match_field: "remittance_info" })]),
    ).toBeDefined();
    expect(ruleFor(t, [rule("stipendio", "regular", { match_field: "any" })])).toBeDefined();
    expect(ruleFor(t, [rule("stipendio", "regular")])).toBeUndefined();
  });
  it("ignores rules that don't set an income kind, and takes the first match", () => {
    const t = tx("2026-11-01", "Acme");
    expect(ruleFor(t, [rule("acme", null), rule("acme", "one_off", { id: "b" })])?.id).toBe("b");
  });
  it("folds case and accents like the rest of the rules", () => {
    expect(
      ruleFor(tx("2026-11-01", "CAFÉ Rossi"), [
        rule("cafe rossi", "regular", { match_mode: "exact" }),
      ]),
    ).toBeDefined();
  });
});

describe("classifyIncome", () => {
  const rows = [
    tx("2026-09-27", "Acme"),
    tx("2026-10-27", "Acme"),
    tx("2026-11-27", "Acme"),
    tx("2026-11-03", "Friend"),
  ];
  it("calls regular senders regular and the rest one-off", () => {
    const kinds = classifyIncome(rows, []);
    expect(kinds.get(txKey(rows[2]!))).toBe("regular");
    expect(kinds.get(txKey(rows[3]!))).toBe("one_off");
  });
  it("lets a rule override both ways", () => {
    const kinds = classifyIncome(rows, [rule("acme", "one_off"), rule("friend", "regular")]);
    expect(kinds.get(txKey(rows[2]!))).toBe("one_off");
    expect(kinds.get(txKey(rows[3]!))).toBe("regular");
  });
});

describe("regularSources", () => {
  it("gives each regular sender its usual day and amount, by day", () => {
    const rows = [
      tx("2026-09-26", "Acme", { amount: 2000 }),
      tx("2026-10-27", "Acme", { amount: 4000 }),
      tx("2026-11-27", "Acme", { amount: 2000 }),
      tx("2026-09-05", "Rent In", { amount: 600 }),
      tx("2026-10-05", "Rent In", { amount: 600 }),
      tx("2026-11-04", "Rent In", { amount: 650 }),
      tx("2026-11-10", "Friend"),
    ];
    const sources = regularSources(rows, []);
    expect(sources.map((s) => [s.name, s.day, s.amount])).toEqual([
      ["Rent In", 5, 600],
      ["Acme", 27, 2000],
    ]);
    expect(sources[1]!.rows[0]!.booking_date).toBe("2026-11-27");
  });
  it("uses the newest payment's currency for the usual amount", () => {
    const rows = [
      tx("2026-09-01", "Client", { amount: 999, currency: "USD" }),
      tx("2026-10-01", "Client", { amount: 100 }),
      tx("2026-11-01", "Client", { amount: 300 }),
    ];
    expect(regularSources(rows, [])[0]).toMatchObject({ currency: "EUR", amount: 200 });
  });
  it("follows rules: one-off takes a sender off, regular puts one on", () => {
    const rows = [
      tx("2026-09-01", "Acme"),
      tx("2026-10-01", "Acme"),
      tx("2026-11-01", "Acme"),
      tx("2026-11-15", "Tutoring", {
        creditor_name: null,
        merchant_key: null,
        remittance_info: "lesson",
      }),
      tx("2026-11-20", "Side Gig"),
    ];
    const names = regularSources(rows, [rule("acme", "one_off"), rule("side gig", "regular")]).map(
      (s) => s.name,
    );
    expect(names).toEqual(["Side Gig"]);
  });
  it("falls back to the key when the bank sent no name", () => {
    const rows = ["2026-09-01", "2026-10-01", "2026-11-01"].map((d) =>
      tx(d, null, { merchant_key: "acme" }),
    );
    expect(regularSources(rows, [])[0]!.name).toBe("acme");
  });
});
