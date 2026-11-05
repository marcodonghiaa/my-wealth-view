import { describe, expect, it } from "vitest";
import { CATEGORIES, categoriesFor, categoryColor } from "./categories";

describe("categoryColor", () => {
  it("gives every category its own colour", () => {
    const colors = CATEGORIES.map((c) => categoryColor(c));
    expect(new Set(colors).size).toBe(CATEGORIES.length);
  });

  it("falls back to the muted token for missing categories", () => {
    expect(categoryColor("Uncategorized")).toBe("var(--color-muted-foreground)");
    expect(categoryColor(null)).toBe("var(--color-muted-foreground)");
    expect(categoryColor(undefined)).toBe("var(--color-muted-foreground)");
  });
});

// A self-hoster wanted their own categories instead of the built-in ones.
describe("categoriesFor", () => {
  it("drops the built-ins you hid and adds your own at the end", () => {
    const list = categoriesFor([
      { name: "Taxes", hidden: true },
      { name: "Gym", hidden: false },
    ]);
    expect(list).not.toContain("Taxes");
    expect(list.at(-1)).toBe("Gym");
    expect(list).toContain("Transfer");
  });

  it("is the built-in list with no settings", () => {
    expect(categoriesFor([])).toEqual([...CATEGORIES]);
  });
});

describe("categoryColor for your own categories", () => {
  it("gives a custom category a real colour, the same every time", () => {
    expect(categoryColor("Gym")).toMatch(/^#[0-9a-f]{6}$/);
    expect(categoryColor("Gym")).toBe(categoryColor("Gym"));
  });
});
