import { describe, expect, it, vi } from "vitest";
import {
  LOOSE_MATCH_HINT,
  isLooseMatch,
  makeRuleAction,
  previewLine,
  quoteText,
  ruleCondition,
  textMatches,
} from "./rules";

describe("textMatches (same as the sync's matcher)", () => {
  it("word: the text on its own, never inside another word", () => {
    expect(textMatches("barclays uk", "bar", "word")).toBe(false);
    expect(textMatches("paypal *bar-roma", "bar", "word")).toBe(true);
    expect(textMatches("café roma", "caf", "word")).toBe(false);
    expect(textMatches("élan vital", "lan", "word")).toBe(false);
  });

  it("word: a boundary only on letter or digit edges", () => {
    expect(textMatches("amazon.it", "amazon.", "word")).toBe(true);
    expect(textMatches("axb", "a.b", "word")).toBe(false);
  });

  it("exact: the whole field, outer spaces ignored", () => {
    expect(textMatches("netflix ", " netflix ", "exact")).toBe(true);
    expect(textMatches("netflix.com", "netflix", "exact")).toBe(false);
  });

  it("contains (and older rules with no mode): anywhere, text as typed", () => {
    expect(textMatches("barclays uk", "bar", "contains")).toBe(true);
    expect(textMatches("barclays uk", "bar", null)).toBe(true);
    expect(textMatches("netflix", " netflix", "contains")).toBe(false);
  });

  it("blank text never matches", () => {
    expect(textMatches("anything", "  ", "contains")).toBe(false);
  });
});

describe("isLooseMatch", () => {
  it("warns about short text only when it can match inside other words", () => {
    expect(isLooseMatch("bar", "contains")).toBe(true);
    expect(isLooseMatch("bar", "word")).toBe(false);
    expect(isLooseMatch("netflix", "contains")).toBe(false);
    expect(isLooseMatch("  ", "contains")).toBe(false);
  });
});

describe("Make a rule shortcut", () => {
  it("opens Rules filled in with the name and the new category", () => {
    const navigate = vi.fn();
    const action = makeRuleAction(" BAR ROMA ", "Dine Out", navigate, []);
    expect(action?.label).toBe("Make a rule");
    action?.onClick();
    expect(navigate).toHaveBeenCalledWith({
      to: "/rules",
      search: { text: "BAR ROMA", category: "Dine Out" },
    });
  });

  // polish-1 #1 (#164): from the edit sheet, a push left the sheet's history entry under /rules,
  // so the first Back did nothing. fails_when=the sheet's shortcut pushes instead of replacing
  it("replaces the sheet's history entry when asked to", () => {
    const navigate = vi.fn();
    makeRuleAction("Bar Roma", "Dine Out", navigate, [], { replace: true })?.onClick();
    expect(navigate).toHaveBeenCalledWith({
      to: "/rules",
      search: { text: "Bar Roma", category: "Dine Out" },
      replace: true,
    });
  });

  // Polish pass 4 #14: it was offered even when a rule already sorts this name.
  it("offers nothing when a rule already sorts this name", () => {
    const rules = [
      {
        match_field: "creditor_name",
        match_text: "Café",
        match_mode: "word",
        set_category: "Dine Out",
      },
    ];
    expect(makeRuleAction("CAFE ROMA", "Dine Out", vi.fn(), rules)).toBeUndefined();
    expect(makeRuleAction("Bar Roma", "Dine Out", vi.fn(), rules)?.label).toBe("Make a rule");
    const typeOnly = [{ ...rules[0]!, set_category: null }];
    expect(makeRuleAction("CAFE ROMA", "Dine Out", vi.fn(), typeOnly)?.label).toBe("Make a rule");
    const descriptionOnly = [{ ...rules[0]!, match_field: "remittance_info" }];
    expect(makeRuleAction("CAFE ROMA", "Dine Out", vi.fn(), descriptionOnly)?.label).toBe(
      "Make a rule",
    );
  });

  it("offers nothing without a name or a category", () => {
    expect(makeRuleAction("  ", "Dine Out", vi.fn(), [])).toBeUndefined();
    expect(makeRuleAction("BAR", null, vi.fn(), [])).toBeUndefined();
  });

  // Rules left-open #3: while the rules load (or if they fail), "no data" was read as
  // "no rules", so the button showed for names a saved rule already sorts.
  it("offers nothing until the rules have loaded", () => {
    expect(makeRuleAction("BAR ROMA", "Dine Out", vi.fn(), undefined)).toBeUndefined();
  });
});

// Polish pass 3 #8: whole phrases live here, so a later translation edits one file.
describe("rule wording", () => {
  it("says each condition as one phrase", () => {
    expect(ruleCondition("creditor_name", "word")).toBe("Name has the word");
    expect(ruleCondition("any", "exact")).toBe("Name or description is exactly");
    expect(ruleCondition("remittance_info", "contains")).toBe("Description contains");
  });

  it("quotes the rule text", () => {
    expect(quoteText("Netflix")).toBe("“Netflix”");
  });

  it("says how many would change, with or without examples", () => {
    expect(previewLine(12, 5)).toBe("12 transactions would change, for example:");
    expect(previewLine(1, 1)).toBe("1 transaction would change:");
  });

  it("warns about short text in one sentence", () => {
    expect(LOOSE_MATCH_HINT).toBe(
      "Short text also matches inside other words (“bar” is in “Barclays”). Whole word avoids that.",
    );
  });
});
