import { describe, expect, it } from "vitest";
import { colorsForAssets } from "./crypto-colors";

describe("colorsForAssets", () => {
  it("ranks coins by position on the lightness ramp, darkest first", () => {
    expect(colorsForAssets(["BTC", "ETH", "SOL"])).toEqual([
      "var(--color-chart-1)",
      "var(--color-chart-2)",
      "var(--color-chart-3)",
    ]);
  });

  it("repeats the five-step ramp past five coins", () => {
    const colors = colorsForAssets(["A", "B", "C", "D", "E", "F"]);
    expect(colors[5]).toBe("var(--color-chart-1)");
  });
});
