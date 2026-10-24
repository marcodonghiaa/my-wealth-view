import { describe, expect, it } from "vitest";
import { checklistSteps, shouldShowChecklist } from "./welcome";

const empty = { accounts: 0, holdings: 0, history: 0, notifications: 0, dismissed: false };

describe("checklistSteps", () => {
  it("lists the four steps in order, the last two optional, none done on a new instance", () => {
    expect(checklistSteps(empty)).toEqual([
      { id: "bank", done: false, optional: false },
      { id: "investments", done: false, optional: false },
      { id: "history", done: false, optional: true },
      { id: "notifications", done: false, optional: true },
    ]);
  });

  it("ticks each step from its own data", () => {
    const steps = checklistSteps({ ...empty, accounts: 2, history: 12 });
    expect(steps.filter((s) => s.done).map((s) => s.id)).toEqual(["bank", "history"]);
  });
});

describe("shouldShowChecklist", () => {
  // protects=new users get the guide and it goes away by itself once set up;
  // fails_when=a set-up instance keeps nagging, or a dismissed one comes back
  it("shows until a bank and investments are both in", () => {
    expect(shouldShowChecklist(empty)).toBe(true);
    expect(shouldShowChecklist({ ...empty, accounts: 1 })).toBe(true);
    expect(shouldShowChecklist({ ...empty, accounts: 1, holdings: 3 })).toBe(false);
  });

  it("does not wait for the optional steps", () => {
    expect(
      shouldShowChecklist({ ...empty, accounts: 1, holdings: 1, history: 0, notifications: 0 }),
    ).toBe(false);
  });

  it("hides after it was dismissed", () => {
    expect(shouldShowChecklist({ ...empty, dismissed: true })).toBe(false);
  });
});
