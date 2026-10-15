import { describe, expect, it } from "vitest";
import { estimatedMonthlyEur, splitSubscriptions } from "./subscriptions";

const sub = (over: Partial<Parameters<typeof splitSubscriptions>[0][number]> = {}) => ({
  charge_count: 3,
  billing_frequency_is_manual: false,
  monthly_equivalent_eur: -10,
  ...over,
});

describe("splitSubscriptions", () => {
  it("treats a merchant charged twice or more as recurring", () => {
    const { recurring, oneOff } = splitSubscriptions([sub({ charge_count: 2 })]);
    expect(recurring).toHaveLength(1);
    expect(oneOff).toHaveLength(0);
  });

  it("treats a single charge as one-off", () => {
    const { recurring, oneOff } = splitSubscriptions([sub({ charge_count: 1 })]);
    expect(recurring).toHaveLength(0);
    expect(oneOff).toHaveLength(1);
  });

  it("treats a single charge with a manually set frequency as recurring", () => {
    const { recurring } = splitSubscriptions([
      sub({ charge_count: 1, billing_frequency_is_manual: true }),
    ]);
    expect(recurring).toHaveLength(1);
  });

  it("treats a missing charge count as one-off", () => {
    const { oneOff } = splitSubscriptions([sub({ charge_count: null })]);
    expect(oneOff).toHaveLength(1);
  });
});

describe("estimatedMonthlyEur", () => {
  it("sums absolute monthly equivalents", () => {
    expect(
      estimatedMonthlyEur([
        sub({ monthly_equivalent_eur: -10 }),
        sub({ monthly_equivalent_eur: -5.5 }),
        sub({ monthly_equivalent_eur: null }),
      ]),
    ).toBe(15.5);
  });

  it("does not count a one-off charge toward the monthly total", () => {
    const { recurring } = splitSubscriptions([
      sub({ monthly_equivalent_eur: -13.99, charge_count: 5 }),
      sub({ monthly_equivalent_eur: -55.5, charge_count: 1 }),
    ]);
    expect(estimatedMonthlyEur(recurring)).toBeCloseTo(13.99);
  });
});
