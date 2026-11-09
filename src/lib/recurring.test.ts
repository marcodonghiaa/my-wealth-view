import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { effectiveCadence, groupStreams, monthlyEur, romeToday } from "./recurring";

type Stream = Tables<"recurring_streams">;

const stream = (over: Partial<Stream> = {}): Stream => ({
  id: "s1",
  user_id: "u1",
  stream_key: "streamflix|acc|EUR",
  merchant_key: "streamflix",
  account_uid: null,
  currency: "EUR",
  display_name: "Streamflix",
  category: "Entertainment",
  cadence: "monthly",
  typical_amount: 10,
  typical_amount_eur: 10,
  charge_count: 4,
  first_charged: "2026-05-01",
  last_charged: "2026-10-01",
  next_expected: "2026-11-01",
  detected_status: "active",
  is_direct_debit: false,
  detected_at: null,
  user_status: null,
  user_cadence: null,
  custom_interval_value: null,
  custom_interval_unit: null,
  source: "bank",
  updated_at: null,
  ...over,
});

const today = new Date("2026-11-08T00:00:00");

describe("effectiveCadence", () => {
  it("uses the detected cadence by default", () => {
    expect(effectiveCadence(stream())).toBe("Monthly");
  });
  it("lets the user cadence win", () => {
    expect(effectiveCadence(stream({ user_cadence: "yearly" }))).toBe("Yearly");
  });
  it("maps custom to Custom", () => {
    expect(effectiveCadence(stream({ user_cadence: "custom" }))).toBe("Custom");
  });
  it("is null without any cadence", () => {
    expect(effectiveCadence(stream({ cadence: null }))).toBeNull();
  });
});

describe("monthlyEur", () => {
  it("is the amount for monthly", () => {
    expect(monthlyEur(stream())).toBeCloseTo(10);
  });
  it("divides a yearly amount", () => {
    expect(monthlyEur(stream({ cadence: "yearly", typical_amount_eur: 120 }))).toBeCloseTo(10, 0);
  });
  it("uses the custom interval", () => {
    const s = stream({
      user_cadence: "custom",
      custom_interval_value: 2,
      custom_interval_unit: "months",
    });
    expect(monthlyEur(s)).toBeCloseTo(5);
  });
  it("is null without a cadence", () => {
    expect(monthlyEur(stream({ cadence: null }))).toBeNull();
  });
  it("is null without an eur amount", () => {
    expect(monthlyEur(stream({ typical_amount_eur: null }))).toBeNull();
  });
  it("is null for an unusable custom interval", () => {
    expect(monthlyEur(stream({ user_cadence: "custom" }))).toBeNull();
  });
});

describe("groupStreams", () => {
  const group = (s: Stream) => groupStreams([s], today);

  it("puts a detected-active stream in active", () => {
    expect(group(stream()).active).toHaveLength(1);
  });
  it("puts a confirmed suggested stream in active", () => {
    const g = group(stream({ detected_status: "suggested", user_status: "confirmed" }));
    expect(g.active).toHaveLength(1);
    expect(g.toReview).toHaveLength(0);
  });
  it("puts an overdue stream in stopped", () => {
    const g = group(stream({ last_charged: "2026-06-01", next_expected: "2026-07-01" }));
    expect(g.stopped).toHaveLength(1);
    expect(g.active).toHaveLength(0);
  });
  it("does not stop a stream without a cadence", () => {
    expect(group(stream({ cadence: null })).active).toHaveLength(1);
  });
  it("puts a dismissed stream in dismissed only", () => {
    const g = group(stream({ user_status: "dismissed" }));
    expect(g.dismissed).toHaveLength(1);
    expect(g.active).toHaveLength(0);
  });
  it("queues a fresh suggested stream", () => {
    const g = group(stream({ detected_status: "suggested" }));
    expect(g.toReview).toHaveLength(1);
    expect(g.active).toHaveLength(0);
  });
  it("keeps a suggestion inside the grace window", () => {
    // monthly window: next_expected + 7d + 30.4d. 2026-10-10 -> 2026-11-16, still ahead of today.
    const g = group(stream({ detected_status: "suggested", next_expected: "2026-10-10" }));
    expect(g.toReview).toHaveLength(1);
  });
  it("drops a stale suggestion from the queue", () => {
    const g = group(stream({ detected_status: "suggested", next_expected: "2026-09-01" }));
    expect(g.toReview).toHaveLength(0);
  });
  it("never stale-filters a suggestion without next_expected", () => {
    const g = group(
      stream({ detected_status: "suggested", next_expected: null, last_charged: "2020-01-01" }),
    );
    expect(g.toReview).toHaveLength(1);
  });
  it("does not stale-filter a suggestion without a period", () => {
    const g = group(stream({ detected_status: "suggested", cadence: null }));
    expect(g.toReview).toHaveLength(1);
  });
  it("ignores a stream that is neither suggested nor active nor reviewed", () => {
    const g = group(stream({ detected_status: null }));
    expect(g.active.length + g.toReview.length + g.stopped.length + g.dismissed.length).toBe(0);
  });
  const weekly = (next: string) =>
    stream({ detected_status: "suggested", cadence: "weekly", next_expected: next });
  it("keeps a weekly suggestion exactly at the stale edge (7 + 7 days)", () => {
    expect(group(weekly("2026-10-25")).toReview).toHaveLength(1);
  });
  it("drops a weekly suggestion one day past the stale edge", () => {
    expect(group(weekly("2026-10-24")).toReview).toHaveLength(0);
  });
  it("keeps a confirmed stream with stale next_expected out of toReview (active)", () => {
    const g = group(stream({ user_status: "confirmed", next_expected: "2026-09-01" }));
    expect(g.toReview).toHaveLength(0);
    expect(g.active).toHaveLength(1);
  });
  it("keeps a confirmed stream with stale next_expected out of toReview (stopped)", () => {
    const g = group(
      stream({ user_status: "confirmed", next_expected: "2026-07-01", last_charged: "2026-06-01" }),
    );
    expect(g.toReview).toHaveLength(0);
    expect(g.stopped).toHaveLength(1);
  });
  it("stops an overdue suggested stream the user confirmed", () => {
    const g = group(
      stream({
        detected_status: "suggested",
        user_status: "confirmed",
        next_expected: "2026-07-01",
        last_charged: "2026-06-01",
      }),
    );
    expect(g.stopped).toHaveLength(1);
    expect(g.toReview).toHaveLength(0);
  });
});

describe("romeToday", () => {
  afterEach(() => vi.useRealTimers());
  it("uses the Rome calendar date, not UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-08T23:30:00Z")); // already 9 Nov in Rome
    expect(romeToday()).toEqual(new Date("2026-11-09T00:00:00"));
  });
  it("matches UTC date when both agree", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-08T12:00:00Z"));
    expect(romeToday()).toEqual(new Date("2026-11-08T00:00:00"));
  });
});
