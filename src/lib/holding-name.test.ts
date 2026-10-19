import { describe, expect, it } from "vitest";
import { shortHoldingName } from "./holding-name";

describe("shortHoldingName", () => {
  it("drops UCITS ETF, currency and accumulation tags", () => {
    expect(shortHoldingName("iShares Core MSCI World UCITS ETF USD (Acc)")).toBe(
      "iShares Core MSCI World",
    );
    expect(shortHoldingName("SPDR MSCI USA Small Cap Value Weighted UCITS ETF USD (Acc)")).toBe(
      "SPDR MSCI USA Small Cap Value Weighted",
    );
  });

  it("handles a tag without a currency", () => {
    expect(shortHoldingName("Xtrackers MSCI World Value UCITS ETF (Acc)")).toBe(
      "Xtrackers MSCI World Value",
    );
    expect(shortHoldingName("Xtrackers II EUR Overnight Rate Swap UCITS ETF (Acc)")).toBe(
      "Xtrackers II EUR Overnight Rate Swap",
    );
  });

  it("drops a trailing currency and distribution tag without UCITS ETF", () => {
    expect(shortHoldingName("JPMorgan Global Research Enhanced Index Equity ESG USD (Acc)")).toBe(
      "JPMorgan Global Research Enhanced Index Equity ESG",
    );
    expect(shortHoldingName("Vanguard FTSE All-World (Dist)")).toBe("Vanguard FTSE All-World");
  });

  it("leaves stock names untouched", () => {
    expect(shortHoldingName("Adobe Inc.")).toBe("Adobe Inc.");
    expect(shortHoldingName("ASML Holding N.V.")).toBe("ASML Holding N.V.");
  });

  it("keeps the original when stripping would leave nothing", () => {
    expect(shortHoldingName("(Acc)")).toBe("(Acc)");
    expect(shortHoldingName("")).toBe("");
  });
});
