import { describe, expect, it } from "vitest";
import { planNetWorth, planSpend } from "./plan";

const nw = { month: 0, total: 1, stocks: 2, bonds: 3, crypto: 4, cash: 5 };
const none = { month: null, total: null, stocks: null, bonds: null, crypto: null, cash: null };

describe("planNetWorth", () => {
  // protects=what gets written to net_worth_history; fails_when=a month, split or bad row is
  // mishandled; no_claim=writing to the database (this only builds the plan)
  it("builds a month-end row with the class split", () => {
    const { rows, skipped } = planNetWorth([["2024-02", "100", "60", "10", "20", "10"]], nw);
    expect(skipped).toEqual([]);
    expect(rows).toEqual([
      {
        snapshot_date: "2024-02-29",
        stocks_eur: 60,
        bonds_eur: 10,
        crypto_eur: 20,
        cash_eur: 10,
        other_eur: 0,
        liabilities_eur: 0,
        total_eur: 100,
      },
    ]);
  });

  // protects=imported figures show as whole cents; fails_when=float drift like
  // 0.30000000000000004 reaches the rows (and the preview) from summing the split
  it("rounds the split, other and liabilities to cents", () => {
    const { rows } = planNetWorth([["2024-04", "", "0.1", "0.2", "", ""]], nw);
    expect(rows[0]).toMatchObject({ total_eur: 0.3, other_eur: 0, liabilities_eur: 0 });
    const gap = planNetWorth([["2024-04", "0.3", "0.1", "0.1", "", ""]], nw);
    expect(gap.rows[0]).toMatchObject({ other_eur: 0.1 });
  });

  it("puts a total with no split into other", () => {
    const { rows } = planNetWorth([["2024-03", "1.500,50"]], { ...none, month: 0, total: 1 });
    expect(rows[0]).toMatchObject({ other_eur: 1500.5, total_eur: 1500.5, stocks_eur: 0 });
  });

  it("puts the gap above the split into other, and below it into liabilities", () => {
    const above = planNetWorth([["2024-03", "100", "60"]], {
      ...nw,
      bonds: null,
      crypto: null,
      cash: null,
    });
    expect(above.rows[0]).toMatchObject({ other_eur: 40, liabilities_eur: 0 });
    const below = planNetWorth([["2024-03", "50", "60"]], {
      ...nw,
      bonds: null,
      crypto: null,
      cash: null,
    });
    expect(below.rows[0]).toMatchObject({ other_eur: 0, liabilities_eur: 10 });
  });

  it("sums the classes when there is no total column", () => {
    const { rows } = planNetWorth([["2024-03", "", "60", "40"]], {
      ...nw,
      total: null,
      crypto: null,
      cash: null,
    });
    expect(rows[0]).toMatchObject({ total_eur: 100, other_eur: 0 });
  });

  it("skips bad rows with a reason and a line number", () => {
    const { rows, skipped } = planNetWorth(
      [
        ["nope", "1"],
        ["2024-04", "abc"],
        ["2024-05", "10", "-5"],
        ["2024-06", ""],
      ],
      nw,
    );
    expect(rows).toEqual([]);
    expect(skipped.map((s) => s.line)).toEqual([2, 3, 4, 5]);
    expect(skipped.every((s) => s.reason.length > 0)).toBe(true);
  });

  it("keeps the last row for a repeated month and reports the earlier one", () => {
    const { rows, skipped } = planNetWorth(
      [
        ["2024-02", "1"],
        ["2024-02", "2"],
      ],
      { ...none, month: 0, total: 1 },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.total_eur).toBe(2);
    expect(skipped).toEqual([
      { line: 2, reason: "Month repeated later in the file; last one kept." },
    ]);
  });

  it("skips everything when the month or total column is missing", () => {
    expect(planNetWorth([["2024-02", "1"]], none).rows).toEqual([]);
  });
});

const sp = { month: 0, category: 1, amount: 2, currency: 3 };

describe("planSpend", () => {
  it("adds up rows of the same month and category, with positive amounts", () => {
    const { rows } = planSpend(
      [
        ["2024-02", "Groceries", "10,50", "EUR"],
        ["2024-02", "supermercato", "-4.5", "€"],
        ["2024-03", "Rent", "500", ""],
      ],
      sp,
    );
    expect(rows).toEqual([
      { month: "2024-02-01", category: "Groceries", spend_eur: 15 },
      { month: "2024-03-01", category: "Housing", spend_eur: 500 },
    ]);
  });

  it("skips other currencies, income, transfers, zero and unreadable rows", () => {
    const { rows, skipped } = planSpend(
      [
        ["2024-02", "Groceries", "10", "USD"],
        ["2024-02", "Income", "900", "EUR"],
        ["2024-02", "Transfer", "5", "EUR"],
        ["2024-02", "Rent", "0", "EUR"],
        ["x", "Rent", "1", "EUR"],
        ["2024-02", "Rent", "abc", "EUR"],
      ],
      sp,
    );
    expect(rows).toEqual([]);
    expect(skipped.map((s) => s.line)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it("works without a currency column, and skips all when month or amount is unmapped", () => {
    expect(planSpend([["2024-02", "Rent", "5"]], { ...sp, currency: null }).rows).toHaveLength(1);
    expect(planSpend([["2024-02", "Rent", "5"]], { ...sp, amount: null }).rows).toEqual([]);
  });
});
