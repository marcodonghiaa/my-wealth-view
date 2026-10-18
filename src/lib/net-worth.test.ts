import { describe, expect, it } from "vitest";
import { periodBaseline } from "./net-worth";

const snap = (snapshot_date: string, total_eur: number) => ({ snapshot_date, total_eur });

describe("periodBaseline", () => {
  const rows = [snap("2026-09-02", 2495), snap("2026-09-03", 2388), snap("2026-09-04", 74406)];

  it("is the first snapshot when no start date is configured", () => {
    expect(periodBaseline(rows)?.snapshot_date).toBe("2026-09-02");
    expect(periodBaseline(rows, "")?.snapshot_date).toBe("2026-09-02");
  });

  it("skips snapshots from before the configured start date", () => {
    expect(periodBaseline(rows, "2026-09-04")?.snapshot_date).toBe("2026-09-04");
  });

  it("uses the first snapshot after the start date when that day itself is missing", () => {
    expect(periodBaseline(rows, "2026-09-03T12")?.snapshot_date).toBe("2026-09-04");
  });

  it("is undefined when nothing is on or after the start date", () => {
    expect(periodBaseline(rows, "2027-01-01")).toBeUndefined();
  });
});
