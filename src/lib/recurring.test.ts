import { describe, expect, it } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { effectiveCadence, groupStreams, monthlyEur } from "./recurring";

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
    // next 2026-09-01 + 7d + 30.4d = 2026-10-08.4 is past; use 2026-10-10 -> window ends 2026-11-17
    const g = group(stream({ detected_status: "suggested", next_expected: "2026-10-10" }));
    expect(g.toReview).toHaveLength(1);
  });
  it("drops a stale suggestion from the queue", () => {
    const g = group(stream({ detected_status: "suggested", next_expected: "2026-09-01" }));
    expect(g.toReview).toHaveLength(0);
  });
  it("uses last_charged age when next_expected is null: recent", () => {
    const g = group(stream({ detected_status: "suggested", next_expected: null }));
    expect(g.toReview).toHaveLength(1);
  });
  it("uses last_charged age when next_expected is null: older than 400 days", () => {
    const g = group(
      stream({ detected_status: "suggested", next_expected: null, last_charged: "2025-01-01" }),
    );
    expect(g.toReview).toHaveLength(0);
  });
  it("treats null next_expected and null last_charged as not stale", () => {
    const g = group(
      stream({ detected_status: "suggested", next_expected: null, last_charged: null }),
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
});
