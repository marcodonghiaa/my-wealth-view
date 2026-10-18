import { describe, expect, it } from "vitest";
import { colorForAsset } from "./crypto-colors";

describe("colorForAsset", () => {
  it("gives Bitcoin orange and Ethereum purple, whatever their position", () => {
    expect(colorForAsset("BTC", 3)).toBe(colorForAsset("btc", 0));
    expect(colorForAsset("BTC", 0)).not.toBe(colorForAsset("ETH", 0));
    expect(colorForAsset("BTC", 0)).toBe("#f7931a");
    expect(colorForAsset("ETH", 0)).toBe("#8b5cf6");
  });

  it("falls back to the rotating chart palette for other assets", () => {
    expect(colorForAsset("SOL", 1)).toBe("var(--color-chart-2)");
    expect(colorForAsset("SOL", 6)).toBe("var(--color-chart-2)");
  });
});
