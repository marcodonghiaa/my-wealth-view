import { describe, expect, it, vi } from "vitest";

const result = vi.hoisted(() => ({
  current: { data: null as unknown, error: null as unknown },
}));
vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq"]) q[m] = () => q;
  q["maybeSingle"] = () => Promise.resolve(result.current);
  return { supabase: q };
});

import { fetchIncomeExpenses, netAfterSpending } from "./income-expenses";

// protects=Income and Reports show the same net, and an empty month shows no net;
// fails_when=a month with no row reads as "+€0.00"
describe("netAfterSpending", () => {
  it("is income minus spending", () => {
    expect(netAfterSpending({ income_eur: 2450, expenses_eur: 1382.34 })).toBeCloseTo(1067.66);
    expect(netAfterSpending({ income_eur: null, expenses_eur: 20 })).toBe(-20);
  });
  it("is null for a month with nothing recorded", () => {
    expect(netAfterSpending(null)).toBeNull();
    expect(netAfterSpending(undefined)).toBeNull();
  });
});

describe("fetchIncomeExpenses", () => {
  it("returns the month's row", async () => {
    result.current = { data: { income_eur: 1, expenses_eur: 2 }, error: null };
    await expect(fetchIncomeExpenses("2026-11-01")).resolves.toEqual({
      income_eur: 1,
      expenses_eur: 2,
    });
  });
  it("throws the database error", async () => {
    result.current = { data: null, error: new Error("boom") };
    await expect(fetchIncomeExpenses("2026-11-01")).rejects.toThrow("boom");
  });
});
