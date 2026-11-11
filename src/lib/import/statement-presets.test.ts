import { describe, expect, it } from "vitest";
import { findPreset, presetColumns } from "./statement-presets";

// polish-3 #22: presetColumns tested directly, not only through readStatement.
describe("presetColumns", () => {
  const headers = [
    "Type",
    "Product",
    "Started Date",
    "Completed Date",
    "Description",
    "Amount",
    "Fee",
    "Currency",
    "State",
    "Balance",
  ];
  const revolut = findPreset(headers)!;
  const p = presetColumns(revolut, headers);
  const row = (type: string, product: string, description: string, state = "COMPLETED") => [
    type,
    product,
    "",
    "",
    description,
    "1",
    "0",
    "EUR",
    state,
    "",
  ];

  it("maps the preset's columns to indexes in this header line, ignoring case", () => {
    expect(revolut.name).toBe("Revolut");
    expect(p.columns).toMatchObject({ date: 3, description: 4, amount: 5, in: null, out: null });
    expect(p.fee).toBe(6);
    expect(p.currency).toBe(7);
  });

  it("skips rows the preset says never happened", () => {
    expect(p.skip(row("CARD_PAYMENT", "Current", "Shop", "REVERTED"))).toBe(true);
    expect(p.skip(row("CARD_PAYMENT", "Current", "Shop"))).toBe(false);
  });

  it("marks own moves as transfers and leaves interest and payments alone", () => {
    expect(p.transfer(row("TRANSFER", "Savings", "To EUR Savings"))).toBe(true);
    expect(p.transfer(row("TRANSFER", "Current", "To EUR Savings"))).toBe(true);
    expect(p.transfer(row("INTEREST", "Savings", "Interest earned"))).toBe(false);
    expect(p.transfer(row("CARD_PAYMENT", "Current", "Shop"))).toBe(false);
  });

  it("gives null for a column the header line lacks", () => {
    expect(presetColumns(revolut, ["Type"]).columns.date).toBeNull();
  });
});
