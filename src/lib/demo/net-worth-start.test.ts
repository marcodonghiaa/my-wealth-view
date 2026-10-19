import { afterEach, describe, expect, it, vi } from "vitest";
import { allocationHistory, periodBaseline } from "@/lib/net-worth";
import { enterDemoMode, exitDemoMode } from "./mode";

// The owner's own start date (VITE_NET_WORTH_START) must not cut the public demo's history.
const snaps = ["2026-07-22", "2026-08-01", "2026-10-02"].map((d) => ({
  snapshot_date: d,
  total_eur: 1,
  bank_total_eur: 1,
  portfolio_total_eur: 0,
  crypto_total_eur: 0,
}));

afterEach(() => {
  exitDemoMode();
  vi.unstubAllEnvs();
});

describe("net worth start date", () => {
  it("is honoured for real data", () => {
    vi.stubEnv("VITE_NET_WORTH_START", "2026-10-01");
    expect(periodBaseline(snaps)?.snapshot_date).toBe("2026-10-02");
  });

  it("is ignored in demo mode", () => {
    vi.stubEnv("VITE_NET_WORTH_START", "2026-10-01");
    enterDemoMode();
    expect(periodBaseline(snaps)?.snapshot_date).toBe("2026-07-22");
    expect(allocationHistory([], snaps)).toHaveLength(3);
  });
});
