import { describe, expect, it } from "vitest";
import { estimatedMonthlyEur, isStopped, splitSubscriptions } from "./subscriptions";

const sub = (over: Partial<Parameters<typeof splitSubscriptions>[0][number]> = {}) => ({
  charge_count: 3,
  billing_frequency_is_manual: false,
  monthly_equivalent_eur: -10,
  billing_frequency: "Monthly" as string | null,
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

const TODAY = new Date("2026-11-05T12:00:00");

// Regression: a cancelled subscription stayed "recurring" and kept counting in the monthly total.
describe("stopped subscriptions", () => {
  it("a monthly charge not seen for over two months is stopped and leaves the total", () => {
    const netflix = sub({ last_charged: "2026-01-10" });
    const spotify = sub({ last_charged: "2026-10-20" });
    const { recurring, stopped } = splitSubscriptions([netflix, spotify], TODAY);
    expect(recurring).toEqual([spotify]);
    expect(stopped).toEqual([netflix]);
  });

  it("a yearly charge is still current eleven months later", () => {
    expect(isStopped(sub({ billing_frequency: "Yearly", last_charged: "2025-12-20" }), TODAY)).toBe(
      false,
    );
    expect(isStopped(sub({ billing_frequency: "Yearly", last_charged: "2025-08-01" }), TODAY)).toBe(
      true,
    );
  });

  it("a custom interval uses its own length", () => {
    const every2Weeks = {
      billing_frequency: "Custom",
      custom_interval_value: 2,
      custom_interval_unit: "weeks",
    };
    expect(isStopped(sub({ ...every2Weeks, last_charged: "2026-10-25" }), TODAY)).toBe(false);
    expect(isStopped(sub({ ...every2Weeks, last_charged: "2026-09-01" }), TODAY)).toBe(true);
  });

  it("without a known frequency nothing is called stopped", () => {
    expect(isStopped(sub({ billing_frequency: null, last_charged: "2020-01-01" }), TODAY)).toBe(
      false,
    );
  });
});

// Regression: a charge with no recognised frequency (e.g. every two weeks) was priced as monthly.
describe("unknown frequency", () => {
  it("is left out of the monthly total until a frequency is set", () => {
    expect(
      estimatedMonthlyEur([
        sub({ monthly_equivalent_eur: -10 }),
        sub({ billing_frequency: null, monthly_equivalent_eur: -10 }),
      ]),
    ).toBe(10);
  });
});
