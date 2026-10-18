import { describe, expect, it } from "vitest";
import { categorizeRow, ruleTextFor, type UserRule } from "./splitwise-categorize";

const rule = (over: Partial<UserRule>): UserRule => ({
  match_text: "x",
  set_category: "Others",
  priority: 100,
  ...over,
});

describe("categorizeRow", () => {
  // protects=the user's own rules win over every guess; fails_when=a keyword or the Splitwise
  // category overrides a rule the user wrote
  it("uses a user rule on the description before anything else", () => {
    const rules = [rule({ match_text: "trader joe", set_category: "Dine Out" })];
    expect(categorizeRow({ description: "Trader Joe run", category: "Groceries" }, rules)).toEqual({
      category: "Dine Out",
      source: "rule",
    });
  });

  it("applies rules in order, ignoring rules that set no category", () => {
    const rules = [
      rule({ match_text: "target", set_category: null }),
      rule({ match_text: "target", set_category: "Shopping" }),
      rule({ match_text: "target", set_category: "Housing" }),
    ];
    expect(categorizeRow({ description: "Target", category: "General" }, rules).category).toBe(
      "Shopping",
    );
  });

  it("ignores a rule with empty text instead of matching everything", () => {
    const rules = [rule({ match_text: "  ", set_category: "Health" })];
    expect(categorizeRow({ description: "Spesa", category: "General" }, rules).source).not.toBe(
      "rule",
    );
  });

  // protects=the words from the real Splitwise file; fails_when=a description that used to fall
  // in Others is not recognised
  it.each([
    ["goodwill shop", "General", "Shopping"],
    ["Target seconda spesa", "General", "Groceries"],
    ["trader’s joe 17", "General", "Groceries"],
    ["tj", "General", "Groceries"],
    ["Spesa tjoe", "General", "Groceries"],
    ["Oil + toilet paper", "Groceries", "Housing"],
    ["pods e toilet paper", "Household supplies", "Housing"],
    ["Brita filter e scottex ", "Household supplies", "Housing"],
    ["Paper towels and Handsoap", "Household supplies", "Housing"],
    ["Washing machine", "Home - Other", "Housing"],
    ["IKEA", "Furniture", "Housing"],
    ["uber august 22", "Taxi", "Transports"],
    ["waymo", "General", "Transports"],
    ["airbear", "General", "Transports"],
    ["Campus burger", "Dining out", "Dine Out"],
    ["Ramen", "General", "Dine Out"],
    ["grill @stan", "General", "Dine Out"],
    ["Drinks ", "Liquor", "Dine Out"],
    ["movie theatre", "Movies", "Entertainment"],
    ["rave tickets ", "General", "Entertainment"],
    ["Hike @ pinnacles", "General", "Experiences"],
    ["Cake", "Gifts", "Shopping"],
    ["banane e macinato", "General", "Groceries"],
    ["celsius", "General", "Groceries"],
    ["serata giovedi ", "General", "Entertainment"],
    ["super duper", "General", "Dine Out"],
    ["bici SF", "Bicycle", "Transports"],
  ])("reads %j (%s) as %s", (description, category, expected) => {
    expect(categorizeRow({ description, category }, []).category).toBe(expected);
  });

  it("falls back to the Splitwise category when the description says nothing", () => {
    expect(categorizeRow({ description: "zzz", category: "Groceries" }, [])).toEqual({
      category: "Groceries",
      source: "splitwise",
    });
  });

  // protects=unknown rows are shown for the user to choose; fails_when=they silently become Others
  it("returns no category when nothing recognises the row", () => {
    expect(categorizeRow({ description: "Send to isaac", category: "General" }, [])).toEqual({
      category: null,
      source: null,
    });
  });

  it("does not match a keyword inside another word", () => {
    expect(categorizeRow({ description: "Stjepan", category: "General" }, []).category).toBeNull();
  });
});

describe("ruleTextFor", () => {
  it("lower-cases, trims and limits the text a new rule will match", () => {
    expect(ruleTextFor("  Trader Joe  ")).toBe("trader joe");
    expect(ruleTextFor("x".repeat(200))).toHaveLength(60);
  });
});
