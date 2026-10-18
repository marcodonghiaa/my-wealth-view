import { describe, expect, it } from "vitest";
import { shouldShowWelcome } from "./welcome";

const empty = { accounts: 0, snapshots: 0, history: 0, dismissed: false };

describe("shouldShowWelcome", () => {
  // protects=only a brand-new empty instance sees the welcome; fails_when=someone with any data
  // or who dismissed it sees it again; no_claim=how the counts are fetched
  it("shows for an instance with no accounts, snapshots or history", () => {
    expect(shouldShowWelcome(empty)).toBe(true);
  });

  it.each([{ accounts: 1 }, { snapshots: 1 }, { history: 1 }])(
    "hides when data exists %j",
    (data) => {
      expect(shouldShowWelcome({ ...empty, ...data })).toBe(false);
    },
  );

  it("hides after it was dismissed", () => {
    expect(shouldShowWelcome({ ...empty, dismissed: true })).toBe(false);
  });
});
