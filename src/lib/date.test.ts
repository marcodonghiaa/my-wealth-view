import { describe, expect, it } from "vitest";
import { axisDateFormatter } from "./date";

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
