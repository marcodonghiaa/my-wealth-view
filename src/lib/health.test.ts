import { describe, expect, it } from "vitest";
import {
  accessRows,
  aiRow,
  attentionCount,
  bySeverity,
  originRow,
  pushRow,
  supabaseSecretsUrl,
  syncAgeHours,
  syncRows,
  syncState,
  syncStatus,
  type HealthAccount,
} from "./health";

const NOW = new Date("2026-10-28T12:00:00Z");
const acct = (over: Partial<HealthAccount>): HealthAccount => ({
  uid: "u1",
  label: "Revolut EUR",
  currency: "EUR",
  bank_name: "Revolut",
  consent_valid_until: "2027-03-01",
  snapshot_date: "2026-10-28",
  ...over,
});

describe("syncState", () => {
  it.each([
    [0, "ok"],
    [24, "ok"],
    [24.1, "warn"],
    [72, "warn"],
    [72.1, "bad"],
  ] as const)("%s h is %s", (h, state) => expect(syncState(h)).toBe(state));

  it("reads a snapshot from today as fresh, yesterday as amber, three days back as red", () => {
    const state = (d: string) => syncState(syncAgeHours(d, NOW));
    expect(state("2026-10-28")).toBe("ok");
    expect(state("2026-10-27")).toBe("warn");
    expect(state("2026-10-25")).toBe("bad");
  });
});

describe("syncRows", () => {
  it("skips accounts without a bank consent", () => {
    expect(syncRows([acct({ consent_valid_until: null })], NOW)).toEqual([]);
  });
  it("warns when an account never synced", () => {
    expect(syncRows([acct({ snapshot_date: null })], NOW)[0]?.state).toBe("warn");
  });
  it("offers a fix only when stale", () => {
    const [fresh, stale] = syncRows(
      [acct({}), acct({ uid: "u2", snapshot_date: "2026-10-20" })],
      NOW,
    );
    expect(fresh?.fix).toBeUndefined();
    expect(stale).toMatchObject({ state: "bad", detail: "Last synced 8 days ago." });
    expect(stale?.fix).toEqual({ label: "Check access", to: "/accounts" });
  });
});

describe("accessRows", () => {
  it("makes one row per bank, worst state for the bank's soonest consent", () => {
    const rows = accessRows(
      [
        acct({}),
        acct({ uid: "u2", currency: "USD", consent_valid_until: "2026-11-02" }),
        acct({
          uid: "u3",
          bank_name: "Wise",
          label: "Wise EUR",
          consent_valid_until: "2026-10-01",
        }),
        acct({
          uid: "u4",
          bank_name: "Fineco",
          label: "Fineco EUR",
          consent_valid_until: "2027-04-01",
        }),
        acct({ uid: "u5", bank_name: "Manual", consent_valid_until: null }),
      ],
      NOW,
    );
    expect(rows.map((r) => [r.title, r.state])).toEqual([
      ["Revolut access", "warn"],
      ["Wise access", "bad"],
      ["Fineco access", "ok"],
    ]);
    expect(rows[0]?.detail).toBe("Bank access ends in 5 days.");
    expect(rows[1]?.fix).toEqual({ label: "Renew access", to: "/accounts" });
    expect(rows[2]?.fix).toBeUndefined();
  });
  it("treats the last day as red", () => {
    expect(accessRows([acct({ consent_valid_until: "2026-10-28" })], NOW)[0]).toMatchObject({
      state: "bad",
      detail: "Bank access ends today.",
    });
  });
});

describe("pushRow", () => {
  it("is absent where push can't work", () => expect(pushRow("unsupported", false)).toBeNull());
  it("tells a browser tab to install the app", () => {
    expect(pushRow("install", false)).toMatchObject({ state: "warn" });
    expect(pushRow("install", false)?.detail).toContain("Install the app first");
  });
  it("offers the enable control until subscribed", () => {
    expect(pushRow("ok", false)).toMatchObject({ state: "warn", fix: { push: true } });
    expect(pushRow("ok", true)).toMatchObject({ state: "ok" });
  });
});

describe("originRow", () => {
  it("is absent when the table isn't readable", () => expect(originRow(null)).toBeNull());
  it("warns on none, passes on some", () => {
    expect(originRow(0)?.state).toBe("warn");
    expect(originRow(1)?.state).toBe("ok");
  });
});

describe("severity", () => {
  it("sorts worst first and counts what needs attention", () => {
    const rows = [
      { id: "a", title: "a", state: "ok", detail: "" },
      { id: "b", title: "b", state: "bad", detail: "" },
      { id: "c", title: "c", state: "warn", detail: "" },
    ] as const;
    expect([...rows].sort(bySeverity).map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(attentionCount([...rows])).toBe(2);
  });
});

describe("supabaseSecretsUrl", () => {
  it("links to the project's Edge Function secrets", () => {
    expect(supabaseSecretsUrl("https://abcdefghijklmnopqrst.supabase.co")).toBe(
      "https://supabase.com/dashboard/project/abcdefghijklmnopqrst/functions/secrets",
    );
  });
  it.each([undefined, "", "https://not-configured.invalid", "https://evil.com/x.supabase.co"])(
    "is null for %s",
    (url) => expect(supabaseSecretsUrl(url)).toBeNull(),
  );
});

describe("aiRow", () => {
  const url = "https://supabase.com/dashboard/project/x/functions/secrets";

  it("is skipped when there is nothing to judge or the counts are unknown", () => {
    expect(aiRow(null, url)).toBeNull();
    expect(aiRow({ ai: 0, stuck: 0 }, url)).toBeNull();
  });

  it("is healthy while Gemini sorts and nothing is left behind", () => {
    const row = aiRow({ ai: 1, stuck: 0 }, url)!;
    expect(row.state).toBe("ok");
    expect(row.detail).toBe("Gemini sorted 1 transaction in the last 30 days.");
    expect(row.fix).toBeUndefined();
  });

  it("warns when rows stay uncategorized, even if Gemini worked earlier (revoked key, quota)", () => {
    const row = aiRow({ ai: 40, stuck: 12 }, url)!;
    expect(row.state).toBe("warn");
    expect(row.detail).toMatch(/^12 transactions still have no category a day after syncing\./);
    expect(row.detail).toMatch(/GEMINI_API_KEY/);
    expect(row.detail).toMatch(/setup\.sh/);
    expect(row.detail).toMatch(/free tier may train on them/);
    expect(row.fix).toEqual({ label: "Open Supabase secrets", href: url });
  });

  it("uses the singular for one row and has no link when the project address is unknown", () => {
    const row = aiRow({ ai: 0, stuck: 1 }, null)!;
    expect(row.detail).toMatch(/^1 transaction still has no category/);
    expect(row.fix).toBeUndefined();
  });
});

describe("syncStatus", () => {
  // protects=the Net Worth freshness line; fails_when=it claims a sync for manual-only data
  it("is null without a connected bank", () => {
    expect(syncStatus([acct({ consent_valid_until: null })], NOW)).toBeNull();
  });
  it("reads fresh with nothing to fix", () => {
    expect(syncStatus([acct({})], NOW)).toEqual({ text: "Synced today", attention: 0 });
  });
  it("reports the stalest bank and counts the checks that need attention", () => {
    expect(syncStatus([acct({}), acct({ uid: "u2", snapshot_date: "2026-10-25" })], NOW)).toEqual({
      text: "Synced 3 days ago",
      attention: 1,
    });
  });
  it("says when no bank has synced yet", () => {
    expect(syncStatus([acct({ snapshot_date: null })], NOW)).toEqual({
      text: "Not synced yet",
      attention: 1,
    });
  });
});
