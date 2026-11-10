import { describe, expect, it, vi } from "vitest";
import { isLooseMatch, makeRuleAction, textMatches } from "./rules";

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
    const action = makeRuleAction(" BAR ROMA ", "Dine Out", navigate);
    expect(action?.label).toBe("Make a rule");
    action?.onClick();
    expect(navigate).toHaveBeenCalledWith({
      to: "/rules",
      search: { text: "BAR ROMA", category: "Dine Out" },
    });
  });

  it("offers nothing without a name or a category", () => {
    expect(makeRuleAction("  ", "Dine Out", vi.fn())).toBeUndefined();
    expect(makeRuleAction("BAR", null, vi.fn())).toBeUndefined();
  });
});
