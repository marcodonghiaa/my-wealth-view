import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ASSET_COLORS, colorForHoldingType } from "./asset-colors";

describe("asset colours", () => {
  // protects=Bonds, stocks etc. keep one colour across Net Worth and Portfolio (Marco 2026-11-11);
  // fails_when=Portfolio falls back to the grey chart scale or a type maps to another class's hue
  it("maps each holding type to its own asset-class hue", () => {
    expect(colorForHoldingType("Bond")).toBe(ASSET_COLORS.bond);
    expect(colorForHoldingType("Stock")).toBe(ASSET_COLORS.stock);
    expect(colorForHoldingType("ETF")).toBe(ASSET_COLORS.etf);
    expect(colorForHoldingType("Fund")).toBe(ASSET_COLORS.fund);
    const hues = ["Stock", "ETF", "Fund", "Bond"].map(colorForHoldingType);
    expect(new Set(hues).size).toBe(4);
  });

  it("gives unknown types the muted other colour", () => {
    expect(colorForHoldingType("Other")).toBe(ASSET_COLORS.other);
    expect(colorForHoldingType("Warrant")).toBe(ASSET_COLORS.other);
  });

  it("defines every token in light and dark", () => {
    const css = readFileSync("src/styles.css", "utf8");
    for (const v of Object.values(ASSET_COLORS)) {
      const token = v.match(/var\((--alloc-[a-z]+)\)/)?.[1];
      if (!token) continue;
      expect(css.split(`${token}:`).length - 1, token).toBe(2);
    }
  });
});
