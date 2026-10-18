import { describe, expect, it } from "vitest";
import { periodBaseline } from "./net-worth";

const snap = (snapshot_date: string, total_eur: number) => ({ snapshot_date, total_eur });

describe("periodBaseline", () => {
  it("skips snapshots from before accounts and investments were fully tracked", () => {
    const rows = [
      snap("2026-09-02", 2495),
      snap("2026-09-03", 2388),
      snap("2026-09-04", 74406),
      snap("2026-09-06", 81341),
    ];
    expect(periodBaseline(rows)?.snapshot_date).toBe("2026-09-04");
  });

  it("uses the first snapshot after the start date when the start day itself is missing", () => {
    expect(periodBaseline([snap("2026-09-03", 1), snap("2026-09-06", 2)])?.snapshot_date).toBe(
      "2026-09-06",
    );
  });

  it("is undefined when nothing is on or after the start date", () => {
    expect(periodBaseline([snap("2026-09-03", 1)])).toBeUndefined();
  });
});
