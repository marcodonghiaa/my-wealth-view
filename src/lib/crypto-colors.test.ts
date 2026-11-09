import { describe, expect, it } from "vitest";
import { colorsForAssets } from "./crypto-colors";

describe("colorsForAssets", () => {
  it("gives Bitcoin orange and Ethereum purple, whatever their position", () => {
    const [a, b] = colorsForAssets(["ETH", "btc"]);
    expect(a).toBe("#8b5cf6");
    expect(b).toBe("#f7931a");
  });

  it("gives every asset its own colour, so none is confused with Bitcoin or Ethereum", () => {
    const symbols = ["BTC", "SOL", "ETH", "ADA", "XRP", "DOT", "LINK", "AVAX"];
    const colors = colorsForAssets(symbols);
    expect(new Set(colors).size).toBe(symbols.length);
  });
});
