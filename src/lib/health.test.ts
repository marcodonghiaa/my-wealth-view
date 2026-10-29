import { describe, expect, it } from "vitest";
import {
  accessRows,
  attentionCount,
  bySeverity,
  originRow,
  pushRow,
  syncAgeHours,
  syncRows,
  syncState,
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
