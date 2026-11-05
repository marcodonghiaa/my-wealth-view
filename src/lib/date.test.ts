import { describe, expect, it } from "vitest";
import { asOf, axisDateFormatter } from "./date";

describe("axisDateFormatter", () => {
  it("shows day and month on a short range, so daily ticks stay distinct", () => {
    const fmt = axisDateFormatter("2026-09-26", "2026-10-15");
    expect(fmt("2026-09-26")).toBe("26 Sept");
    expect(fmt("2026-09-27")).not.toBe(fmt("2026-09-26"));
  });

  it("shows month and year on a range longer than six months", () => {
    const fmt = axisDateFormatter("2025-01-01", "2026-10-15");
    expect(fmt("2026-03-09")).toBe("Mar 26");
  });

  it("treats a missing range as short", () => {
    expect(axisDateFormatter(undefined, undefined)("2026-10-15")).toBe("15 Oct");
  });
});

// Regression: a weeks-old balance looked current on the Accounts page.
describe("asOf", () => {
  it("dates a balance from before today", () => {
    expect(asOf("2026-11-03", "2026-11-05")).toBe("as of 3 Nov");
    expect(asOf("2025-12-30", "2026-11-05")).toBe("as of 30 Dec 2025");
  });

  it("says nothing for today's balance or none", () => {
    expect(asOf("2026-11-05", "2026-11-05")).toBeNull();
    expect(asOf(null, "2026-11-05")).toBeNull();
  });
});
