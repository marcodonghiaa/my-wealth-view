import { describe, expect, it } from "vitest";
import { shareSummary, trendSummary } from "./chart-summary";

describe("shareSummary", () => {
  it("lists each slice with its rounded share, largest first", () => {
    expect(
      shareSummary("Allocation by type", [
        { label: "ETF", value: 30 },
        { label: "Stock", value: 70 },
      ]),
    ).toBe("Allocation by type: Stock 70%, ETF 30%.");
  });

  it("says so when there is nothing to chart", () => {
    expect(shareSummary("Allocation", [])).toBe("Allocation: no data.");
    expect(shareSummary("Allocation", [{ label: "A", value: 0 }])).toBe("Allocation: no data.");
  });
});

describe("trendSummary", () => {
  it("describes start, end and direction in words", () => {
    expect(trendSummary("Net worth", 1000, 1500, (v) => `€${v}`)).toBe(
      "Net worth: rose from €1000 to €1500.",
    );
    expect(trendSummary("Net worth", 1500, 1000, (v) => `€${v}`)).toBe(
      "Net worth: fell from €1500 to €1000.",
    );
    expect(trendSummary("Net worth", 1000, 1000, (v) => `€${v}`)).toBe(
      "Net worth: unchanged at €1000.",
    );
  });
});
