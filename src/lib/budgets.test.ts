import { describe, expect, it } from "vitest";
import {
  addMonths,
  budgetLines,
  effectiveBudget,
  monthIncome,
  monthsBetween,
  parseAmount,
  suggestedBudgets,
  type BudgetRow,
  type MonthSpend,
} from "./budgets";

const b = (category: string, month: string, amount: number, rollover = false): BudgetRow => ({
  category,
  month,
  amount,
  rollover,
});
const s = (category: string, month: string, spend_eur: number): MonthSpend => ({
  category,
  month,
  spend_eur,
});

describe("months", () => {
  it("steps across a year end both ways", () => {
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(addMonths("2026-11-01", -11)).toBe("2025-12-01");
  });
  it("lists both ends", () => {
    expect(monthsBetween("2026-11-01", "2027-01-01")).toEqual([
      "2026-11-01",
      "2026-12-01",
      "2027-01-01",
    ]);
    expect(monthsBetween("2026-02-01", "2026-01-01")).toEqual([]);
  });
});

describe("effectiveBudget", () => {
  const rows = [b("Groceries", "2026-01-01", 300), b("Groceries", "2026-04-01", 350)];
  // protects=a budget set once holds for later months; fails_when=only exact-month rows count
  it("takes the latest row at or before the month", () => {
    expect(effectiveBudget(rows, "Groceries", "2026-03-01")?.amount).toBe(300);
    expect(effectiveBudget(rows, "Groceries", "2026-04-01")?.amount).toBe(350);
    expect(effectiveBudget(rows, "Groceries", "2026-09-01")?.amount).toBe(350);
  });
  it("has none before the first row or for another category", () => {
    expect(effectiveBudget(rows, "Groceries", "2025-12-01")).toBeUndefined();
    expect(effectiveBudget(rows, "Dine Out", "2026-04-01")).toBeUndefined();
  });
});

describe("budgetLines without rollover", () => {
  it("shows budget, spent and left; over budget is negative", () => {
    const [line] = budgetLines(
      [b("Dine Out", "2026-01-01", 100)],
      [s("Dine Out", "2026-01-01", 130)],
      "2026-01-01",
    );
    expect(line).toEqual({
      category: "Dine Out",
      budget: 100,
      rollover: false,
      carriedIn: 0,
      available: 100,
      spent: 130,
      left: -30,
    });
  });
  it("never carries anything", () => {
    const [line] = budgetLines(
      [b("Dine Out", "2026-01-01", 100)],
      [s("Dine Out", "2026-01-01", 20)],
      "2026-02-01",
    );
    expect(line!.carriedIn).toBe(0);
    expect(line!.left).toBe(100);
  });
  it("skips categories whose budget starts later, and removed budgets", () => {
    const rows = [
      b("Travel", "2026-05-01", 200),
      b("Gym", "2026-01-01", 40),
      b("Gym", "2026-03-01", 0),
    ];
    expect(budgetLines(rows, [], "2026-04-01")).toEqual([]);
  });

  it("sorts by budget, largest first, then by name", () => {
    const lines = budgetLines(
      [b("Rent", "2026-01-01", 50), b("Gym", "2026-01-01", 50), b("Groceries", "2026-01-01", 300)],
      [],
      "2026-01-01",
    );
    expect(lines.map((l) => l.category)).toEqual(["Groceries", "Gym", "Rent"]);
  });
});

describe("budgetLines with rollover across three months", () => {
  // protects=rollover math: next = previous leftover + budget − actual, overspend carries too;
  // fails_when=carry ignores overspend, resets each month, or double counts
  const rows = [b("Groceries", "2026-01-01", 300, true)];
  const spend = [
    s("Groceries", "2026-01-01", 250), // 50 left
    s("Groceries", "2026-02-01", 400), // 300 + 50 = 350 available, 50 over
    s("Groceries", "2026-03-01", 100), // 300 − 50 = 250 available, 150 left
  ];
  it("month 1: nothing carried", () => {
    expect(budgetLines(rows, spend, "2026-01-01")[0]).toMatchObject({
      carriedIn: 0,
      available: 300,
      left: 50,
    });
  });
  it("month 2: the leftover adds to the budget", () => {
    expect(budgetLines(rows, spend, "2026-02-01")[0]).toMatchObject({
      carriedIn: 50,
      available: 350,
      left: -50,
    });
  });
  it("month 3: the overspend comes off the budget", () => {
    expect(budgetLines(rows, spend, "2026-03-01")[0]).toMatchObject({
      carriedIn: -50,
      available: 250,
      spent: 100,
      left: 150,
    });
  });
  it("follows a budget change in the middle", () => {
    const changed = [...rows, b("Groceries", "2026-02-01", 200, true)];
    // Jan 50 left; Feb 200 + 50 − 400 = −150; Mar 200 − 150 = 50 available.
    expect(budgetLines(changed, spend, "2026-03-01")[0]).toMatchObject({
      budget: 200,
      carriedIn: -150,
      available: 50,
      left: -50,
    });
  });
  // protects=turning rollover off keeps what this month already received (P2-1);
  // fails_when=the switch wipes this month's carry instead of next month's
  it("starts clean the month after rollover is turned off", () => {
    const off = [...rows, b("Groceries", "2026-02-01", 300, false)];
    expect(budgetLines(off, spend, "2026-02-01")[0]).toMatchObject({ carriedIn: 50 });
    expect(budgetLines(off, spend, "2026-03-01")[0]).toMatchObject({ carriedIn: 0, left: 200 });
  });
  it("starts carrying the month after rollover is turned on", () => {
    const on = [b("Groceries", "2026-01-01", 300), b("Groceries", "2026-02-01", 300, true)];
    expect(budgetLines(on, spend, "2026-02-01")[0]).toMatchObject({ carriedIn: 0 });
    // Feb 300 − 400 = −100 carried into March.
    expect(budgetLines(on, spend, "2026-03-01")[0]).toMatchObject({ carriedIn: -100 });
  });
  // protects=P5 P0-1 Remove works on a budget with a carried amount;
  // fails_when=a removed (0) budget stays listed because something was rolled into it
  it("drops a removed budget together with what was carried into it", () => {
    const removed = [...rows, b("Groceries", "2026-02-01", 0)];
    // Jan leftover 50 would carry into Feb, but Feb's budget is removed.
    expect(budgetLines(removed, spend, "2026-02-01")).toEqual([]);
    expect(budgetLines(removed, spend, "2026-03-01")).toEqual([]);
    // A new budget later starts clean, without the old leftover.
    const again = [...removed, b("Groceries", "2026-03-01", 200)];
    expect(budgetLines(again, spend, "2026-03-01")[0]).toMatchObject({ budget: 200, carriedIn: 0 });
  });
  it("adds up several spend rows for the same month and category, to the cent", () => {
    const [line] = budgetLines(
      [b("Shopping", "2026-01-01", 100, true)],
      [s("Shopping", "2026-01-01", 10.1), s("Shopping", "2026-01-01", 20.2)],
      "2026-02-01",
    );
    expect(line!.carriedIn).toBe(69.7);
  });
});

describe("suggestedBudgets", () => {
  it("averages the last months with spending, rounded up to 10, without Uncategorized", () => {
    const spend = [
      s("Groceries", "2026-08-01", 300),
      s("Groceries", "2026-09-01", 320),
      s("Groceries", "2026-10-01", 301),
      s("Dine Out", "2026-10-01", 90), // only one month: averaged over all three
      s("Uncategorized", "2026-10-01", 50),
      s("Groceries", "2026-11-01", 999), // the month itself doesn't count
    ];
    const out = suggestedBudgets(spend, "2026-11-01");
    expect(Object.fromEntries(out.amounts)).toEqual({ Groceries: 310, "Dine Out": 30 });
    expect(out.months).toBe(3);
  });
  // protects=no budget is ever suggested for transfers or income (P2-2)
  it("never suggests Transfer or Income", () => {
    const spend = [s("Transfer", "2026-10-01", 500), s("Income", "2026-10-01", 40)];
    expect(suggestedBudgets(spend, "2026-11-01").amounts.size).toBe(0);
  });
  // protects=rounding goes up, never to nearest; fails_when=Math.round replaces Math.ceil
  it("rounds up to the next 10", () => {
    expect(suggestedBudgets([s("Gym", "2026-10-01", 301)], "2026-11-01").amounts.get("Gym")).toBe(
      310,
    );
  });
  it("uses at most six months", () => {
    const spend = ["01", "02", "03", "04", "05", "06", "07"].map((m, i) =>
      s("Gym", `2026-${m}-01`, i === 0 ? 7000 : 60),
    );
    expect(suggestedBudgets(spend, "2026-08-01").amounts.get("Gym")).toBe(60);
  });
  // protects=averages only over the last six calendar months, which hold every category;
  // fails_when=empty recent months pull in older months loaded only for budgeted categories
  it("ignores months older than six calendar months", () => {
    const spend = [
      s("Rent", "2026-03-01", 900), // older: loaded only because Rent has a budget
      s("Rent", "2026-04-01", 900),
      s("Rent", "2026-10-01", 900),
      s("Gym", "2026-10-01", 60), // no budget: its older months were never loaded
    ];
    const out = suggestedBudgets(spend, "2026-11-01");
    expect(Object.fromEntries(out.amounts)).toEqual({ Rent: 900, Gym: 60 });
    expect(out.months).toBe(1);
  });
  it("is empty with no history", () => {
    expect(suggestedBudgets([], "2026-11-01")).toEqual({ amounts: new Map(), months: 0 });
  });
});

describe("monthIncome", () => {
  const income = new Map([
    ["2026-01-01", 2000],
    ["2026-02-01", 2000],
    ["2026-03-01", 2000],
    ["2026-04-01", 2000],
    ["2026-05-01", 2000],
    ["2026-06-01", 4000], // 14th month salary
    ["2026-07-01", 2000],
    ["2026-08-01", 2000],
    ["2026-09-01", 2000],
    ["2026-10-01", 2000],
    ["2026-11-01", 2000],
    ["2026-12-01", 4000], // 13th month salary
  ]);
  it("is the month's own income when not spread", () => {
    expect(monthIncome(income, "2026-06-01", false)).toBe(4000);
    expect(monthIncome(income, "2027-01-01", false)).toBe(0);
  });
  // protects=13th/14th salary spread evenly (annual ÷ 12); fails_when=June/December spike
  it("spreads 12 months evenly", () => {
    expect(monthIncome(income, "2026-12-01", true)).toBe(2333.33);
  });
  it("divides by the months since the first income when history is shorter", () => {
    expect(monthIncome(income, "2026-03-01", true)).toBe(2000);
  });
  // protects=spread income before payday; fails_when=the unfinished month counts as 0 income
  it("ends the 12 months with the month before while this month has no income yet", () => {
    const early = new Map([
      ["2026-09-01", 3000],
      ["2026-10-01", 3000],
    ]);
    expect(monthIncome(early, "2026-11-01", true)).toBe(3000);
    const year = new Map(income);
    year.delete("2026-12-01");
    // Dec before payday: Dec 2025 has none, so Jan–Nov 2026 (11 months, incl. the June 14th) = 24000 / 11.
    expect(monthIncome(year, "2026-12-01", true)).toBe(2181.82);
  });
  // protects=a past month without income (between jobs) keeps its own 12 months;
  // fails_when=the before-payday shift also applies to finished months
  it("keeps the window on a past month that had no income", () => {
    const gap = new Map(income);
    gap.delete("2026-12-01");
    // Dec is over and had none: Jan–Dec 2026 = 24000 / 12, not Dec 2025–Nov 2026 = 24000 / 11.
    expect(monthIncome(gap, "2026-12-01", true, "2027-02-01")).toBe(2000);
  });
  it("is 0 without any income", () => {
    expect(monthIncome(new Map(), "2026-03-01", true)).toBe(0);
  });
});

describe("parseAmount", () => {
  it("reads dots and commas, rounded to cents", () => {
    expect(parseAmount(" 250 ")).toBe(250);
    expect(parseAmount("250,5")).toBe(250.5);
    expect(parseAmount("0")).toBe(0);
    expect(parseAmount("12.3456")).toBe(12.35);
  });
  // protects=P1-1 thousands separators; fails_when="1.250" saves as €1.25
  it("reads thousands separators either way, and nothing but plain numbers", () => {
    expect(parseAmount("1.250")).toBe(1250);
    expect(parseAmount("1,250")).toBe(1250);
    expect(parseAmount("1.250,50")).toBe(1250.5);
    expect(parseAmount("1,250.50")).toBe(1250.5);
    expect(parseAmount("12.34")).toBe(12.34);
    expect(parseAmount("12,345")).toBe(12345);
    // Re-audit: grouped millions read too, and a leading 0 is a decimal, never thousands.
    expect(parseAmount("1.000.000")).toBe(1000000);
    expect(parseAmount("1,000,000")).toBe(1000000);
    expect(parseAmount("0.125")).toBe(0.13);
    expect(parseAmount("0,500")).toBe(0.5);
    expect(parseAmount("1e3")).toBeNull();
    expect(parseAmount("0x10")).toBeNull();
  });
  // protects=a cleared field never removes a budget; fails_when=blank parses as 0
  it("refuses blank, text and negatives", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("   ")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
  });
  // protects=amounts the database would reject get a readable message instead (P2-6)
  it("refuses 10 million or more", () => {
    expect(parseAmount("9999999.99")).toBe(9999999.99);
    expect(parseAmount("10000000")).toBeNull();
    expect(parseAmount("9999999.999")).toBeNull();
  });
});

// protects=P5 P2-10 the placeholder says "€ per month", so a typed € sign is fine;
// fails_when="€250" is refused
describe("parseAmount with a euro sign", () => {
  it("reads an amount with € before or after it", () => {
    expect(parseAmount("€250")).toBe(250);
    expect(parseAmount("250 €")).toBe(250);
    expect(parseAmount("€ 1.250,50")).toBe(1250.5);
    expect(parseAmount("€")).toBeNull();
    expect(parseAmount("2€50")).toBeNull();
  });
});
