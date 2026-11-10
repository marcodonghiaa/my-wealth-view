import { describe, expect, it } from "vitest";
import { biggestMover, categorySpend, sharePercent, spendChange } from "./spending";

describe("categorySpend", () => {
  // protects=rows and percentages only show real spend; fails_when=null, zero or refund-only
  // categories reach the list, or the list is not largest first
  it("drops empty and net-refund rows, names null, sorts largest first", () => {
    expect(
      categorySpend([
        { category: "Shopping", spend_eur: 20 },
        { category: null, spend_eur: 50 },
        { category: "Health", spend_eur: 0 },
        { category: "Travel", spend_eur: -5 },
        { category: "Dine Out", spend_eur: null },
      ]),
    ).toEqual([
      { category: "Uncategorized", spend_eur: 50 },
      { category: "Shopping", spend_eur: 20 },
    ]);
  });
});

describe("biggestMover", () => {
  it("picks the category that grew most, counting new categories from zero", () => {
    expect(
      biggestMover(
        [
          { category: "Shopping", spend_eur: 120 },
          { category: "Health", spend_eur: 40 },
          { category: null, spend_eur: 10 },
        ],
        [
          { category: "Shopping", spend_eur: 100 },
          { category: null, spend_eur: 2 },
        ],
      ),
    ).toEqual({ category: "Health", delta: 40 });
  });

  it("is null when nothing grew", () => {
    expect(
      biggestMover(
        [{ category: "Shopping", spend_eur: 80 }],
        [{ category: "Shopping", spend_eur: 100 }],
      ),
    ).toBeNull();
  });
});

describe("spendChange", () => {
  it("reads spending less as positive", () => {
    expect(spendChange(800, 1000)).toEqual({ delta: -200, tone: "positive" });
  });

  it("reads spending more as negative", () => {
    expect(spendChange(1200, 1000)).toEqual({ delta: 200, tone: "negative" });
  });

  it("keeps a move under €1 neutral", () => {
    expect(spendChange(1000.5, 1000)?.tone).toBe("neutral");
  });

  // fails_when=a month after an empty one claims "€900 more than September"
  it("is null when last month has no spend", () => {
    expect(spendChange(900, 0)).toBeNull();
  });
});

describe("sharePercent", () => {
  it("rounds to a whole percent", () => {
    expect(sharePercent(58.04, 100)).toBe("58%");
  });

  it("shows slivers as <1%, not 0%", () => {
    expect(sharePercent(0.4, 100)).toBe("<1%");
  });

  it("is empty when there is no total", () => {
    expect(sharePercent(0, 0)).toBe("");
  });
});
