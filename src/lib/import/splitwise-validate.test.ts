import { describe, expect, it } from "vitest";
import type { SplitwiseFile, SplitwiseRow } from "./splitwise-parse";
import { hasErrors, validateSplitwise } from "./splitwise-validate";

const row = (over: Partial<SplitwiseRow> = {}): SplitwiseRow => ({
  row: 1,
  date: "2026-08-16",
  description: "Uber",
  category: "Taxi",
  costCents: 900,
  currency: "USD",
  netCents: [600, -300, -300],
  ...over,
});

const file = (rows: Array<SplitwiseRow>, over: Partial<SplitwiseFile> = {}): SplitwiseFile => ({
  members: ["Ann", "Ben", "Cy"],
  rows,
  total: { currency: "USD", netCents: [600, -300, -300] },
  ...over,
});

const messages = (f: SplitwiseFile, level: "error" | "warning") =>
  validateSplitwise(f)
    .filter((i) => i.level === level)
    .map((i) => i.message);

describe("validateSplitwise", () => {
  // protects=refusing or flagging a Splitwise file whose numbers do not add up; fails_when=a
  // broken file passes silently or a clean file is blocked; no_claim=how a row is classified
  it("passes a clean file with no issues", () => {
    expect(validateSplitwise(file([row()]))).toEqual([]);
  });

  it("tolerates a Payment row with two opposite amounts equal to its cost", () => {
    const payment = row({
      category: "Payment",
      description: "Ann paid Ben",
      costCents: 3169,
      netCents: [3169, -3169, 0],
    });
    const f = file([payment], { total: { currency: "USD", netCents: [3169, -3169, 0] } });
    expect(validateSplitwise(f)).toEqual([]);
  });

  describe("errors", () => {
    it("when a row's amounts do not add up to zero", () => {
      const f = file([row({ netCents: [600, -300, -100] })], {
        total: { currency: "USD", netCents: [600, -300, -100] },
      });
      expect(messages(f, "error")).toEqual([expect.stringMatching(/row 1.*add up/i)]);
    });

    it("when a person's amount is larger than the cost", () => {
      const f = file([row({ netCents: [1000, -500, -500] })], {
        total: { currency: "USD", netCents: [1000, -500, -500] },
      });
      expect(messages(f, "error")).toEqual([expect.stringMatching(/row 1.*Ann.*more than/i)]);
    });

    it("when a Payment row does not have exactly two opposite amounts", () => {
      const f = file([row({ category: "Payment", costCents: 900, netCents: [600, -300, -300] })]);
      expect(messages(f, "error")).toEqual([expect.stringMatching(/row 1.*payment/i)]);
    });

    it("when a Payment in another language does not have two opposite amounts", () => {
      const f = file([row({ category: "Zahlung", costCents: 900, netCents: [600, -300, -300] })]);
      expect(messages(f, "error")).toEqual([expect.stringMatching(/row 1.*payment/i)]);
    });

    it("when a Payment amount differs from its cost", () => {
      const f = file([row({ category: "Payment", costCents: 900, netCents: [800, -800, 0] })], {
        total: { currency: "USD", netCents: [800, -800, 0] },
      });
      expect(messages(f, "error")).toEqual([expect.stringMatching(/row 1.*payment/i)]);
    });

    it("when a person's column does not match the totals row, naming the person", () => {
      const f = file([row()], { total: { currency: "USD", netCents: [600, -299, -301] } });
      const found = messages(f, "error");
      expect(found).toHaveLength(2);
      expect(found[0]).toMatch(/Ben.*total/i);
      expect(found[1]).toMatch(/Cy.*total/i);
    });

    it("when the file mixes currencies", () => {
      const f = file([row(), row({ row: 2, currency: "EUR" })], {
        total: { currency: "USD", netCents: [1200, -600, -600] },
      });
      expect(messages(f, "error")).toEqual([expect.stringMatching(/more than one currency/i)]);
    });

    it("when the totals row has another currency than the rows", () => {
      const f = file([row()], { total: { currency: "EUR", netCents: [600, -300, -300] } });
      expect(messages(f, "error")).toEqual([expect.stringMatching(/more than one currency/i)]);
    });
  });

  describe("warnings", () => {
    it("when a row is off by one cent from rounding", () => {
      const f = file([row({ netCents: [600, -300, -299] })], {
        total: { currency: "USD", netCents: [600, -300, -299] },
      });
      expect(messages(f, "error")).toEqual([]);
      expect(messages(f, "warning")).toEqual([expect.stringMatching(/row 1.*rounding/i)]);
    });

    it("when there is no totals row, because nothing can be reconciled", () => {
      expect(messages(file([row()], { total: null }), "warning")).toEqual([
        expect.stringMatching(/no totals row/i),
      ]);
    });

    it("when every amount in a row is zero", () => {
      const f = file([row(), row({ row: 2, description: "Mystery", netCents: [0, 0, 0] })]);
      expect(messages(f, "warning")).toEqual([
        expect.stringMatching(/row 2.*every amount is zero/i),
      ]);
    });

    it("when a cost is negative", () => {
      const f = file([row({ costCents: -900, netCents: [-600, 300, 300] })], {
        total: { currency: "USD", netCents: [-600, 300, 300] },
      });
      expect(messages(f, "warning")).toEqual([expect.stringMatching(/row 1.*negative/i)]);
    });

    it("when two rows look identical", () => {
      const f = file([row(), row({ row: 2 })], {
        total: { currency: "USD", netCents: [1200, -600, -600] },
      });
      expect(messages(f, "warning")).toEqual([expect.stringMatching(/rows 1 and 2.*identical/i)]);
    });

    it("when two members share a name", () => {
      const f = file([row()], { members: ["Ann", "Ben", "Ben"] });
      expect(messages(f, "warning")).toEqual([expect.stringMatching(/Ben.*more than one column/i)]);
    });
  });

  it("hasErrors is true only when an error is present", () => {
    expect(hasErrors(validateSplitwise(file([row()])))).toBe(false);
    expect(hasErrors(validateSplitwise(file([row()], { total: null })))).toBe(false);
    expect(hasErrors(validateSplitwise(file([row({ netCents: [1, 2, 3] })])))).toBe(true);
  });
});
