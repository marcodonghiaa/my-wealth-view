import { describe, expect, it } from "vitest";
import { currentValueEur, isEditableCryptoSource, parseQuantity, priceEur } from "./holdings";

describe("currentValueEur", () => {
  it("is the snapshot value when the quantity has not changed", () => {
    // 10 shares at 50: value_native 500, value_eur 460.
    expect(currentValueEur({ quantity: 10, price: 50, valueAtPrice: 500, valueEur: 460 })).toBe(
      460,
    );
  });

  it("follows a new quantity at the last known price and rate, before the next price sync", () => {
    expect(currentValueEur({ quantity: 15, price: 50, valueAtPrice: 500, valueEur: 460 })).toBe(
      690,
    );
  });

  it("is zero for a sold holding", () => {
    expect(currentValueEur({ quantity: 0, price: 50, valueAtPrice: 500, valueEur: 460 })).toBe(0);
  });

  it("falls back to the stored value when the snapshot can't be rescaled", () => {
    expect(currentValueEur({ quantity: 3, price: null, valueAtPrice: 0, valueEur: 12 })).toBe(12);
    expect(currentValueEur({ quantity: 3, price: 5, valueAtPrice: 15, valueEur: null })).toBe(0);
  });
});

// protects=the crypto price reads in the same currency as its value; fails_when=the EUR price
// uses a different rate than value_eur, or a missing rate shows a made-up price
describe("priceEur", () => {
  it("converts the price at the snapshot's own rate", () => {
    // 0.5 BTC at $60,000: value_usd 30,000, value_eur 27,000 -> rate 0.9.
    expect(priceEur({ price: 60000, valueAtPrice: 30000, valueEur: 27000 })).toBe(54000);
  });

  it("is null when there is no rate to use", () => {
    expect(priceEur({ price: null, valueAtPrice: 30000, valueEur: 27000 })).toBeNull();
    expect(priceEur({ price: 60000, valueAtPrice: 0, valueEur: 27000 })).toBeNull();
    expect(priceEur({ price: 60000, valueAtPrice: 30000, valueEur: null })).toBeNull();
  });
});

describe("parseQuantity", () => {
  it("reads dot and comma decimals", () => {
    expect(parseQuantity("3.5")).toBe(3.5);
    expect(parseQuantity(" 0,25 ")).toBe(0.25);
    expect(parseQuantity("12")).toBe(12);
  });

  it("rejects empty, zero, negative and non-numbers", () => {
    for (const bad of ["", "0", "-1", "abc", "1,2,3", "1e400"])
      expect(parseQuantity(bad)).toBeNull();
  });
});

describe("isEditableCryptoSource", () => {
  it("lets you edit coins you entered, not the ones Coinbase syncs", () => {
    expect(isEditableCryptoSource("Manual")).toBe(true);
    expect(isEditableCryptoSource("Ledger")).toBe(true);
    expect(isEditableCryptoSource("Coinbase")).toBe(false);
  });
});
