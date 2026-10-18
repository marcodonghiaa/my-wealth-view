import { describe, expect, it } from "vitest";
import { guessColumns } from "./guess-columns";

describe("guessColumns", () => {
  // protects=the wizard opens with the right column already chosen; fails_when=an English or
  // Italian header is missed or a column is claimed twice; no_claim=headers in other languages
  it("finds net worth columns from English headers", () => {
    expect(guessColumns(["Month", "Total", "Stocks", "Bonds", "Crypto", "Cash"])).toMatchObject({
      month: 0,
      total: 1,
      stocks: 2,
      bonds: 3,
      crypto: 4,
      cash: 5,
    });
  });

  it("finds spend columns from Italian headers", () => {
    expect(guessColumns(["Mese", "Categoria", "Importo", "Valuta"])).toMatchObject({
      month: 0,
      category: 1,
      amount: 2,
      currency: 3,
    });
  });

  it("ignores case, accents and extra spaces", () => {
    expect(guessColumns(["  MESE ", "LIQUIDITÀ"])).toMatchObject({ month: 0, cash: 1 });
  });

  it("matches a header that starts with a known word", () => {
    expect(guessColumns(["Date", "Total (EUR)", "Amount in euro"])).toMatchObject({
      month: 0,
      total: 1,
      amount: 2,
    });
  });

  it("leaves unknown headers unassigned", () => {
    const out = guessColumns(["Notes", "Month"]);
    expect(out.month).toBe(1);
    expect(out.total).toBeNull();
    expect(out.category).toBeNull();
  });

  it("never gives one column to two roles", () => {
    const out = guessColumns(["Total", "Total"]);
    const used = Object.values(out).filter((i) => i !== null);
    expect(new Set(used).size).toBe(used.length);
    expect(out.total).toBe(0);
  });

  it("returns every role as null for an empty header list", () => {
    expect(Object.values(guessColumns([])).every((i) => i === null)).toBe(true);
  });
});
