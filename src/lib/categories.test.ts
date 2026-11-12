import { describe, expect, it } from "vitest";
import { CATEGORIES, categoriesFor, categoryCode, categoryColor, categoryTone } from "./categories";

describe("categoryColor", () => {
  it("gives every built-in its own fixed colour", () => {
    expect(categoryColor("Shopping")).toBe("#ec4899");
    expect(categoryColor("Dine Out")).toBe("#f97316");
    const colors = CATEGORIES.map((c) => categoryColor(c));
    for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
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
  it("gives a custom category a colour, the same every time", () => {
    expect(categoryColor("Gym")).toMatch(/^#[0-9a-f]{6}$/);
    expect(categoryColor("Gym")).toBe(categoryColor("Gym"));
  });
});

describe("categoryTone", () => {
  it("maps rank 0 to the darkest tone and clamps ranks past 4 to the lightest", () => {
    expect(categoryTone(0)).toBe("var(--color-chart-1)");
    expect(categoryTone(3)).toBe("var(--color-chart-4)");
    expect(categoryTone(4)).toBe("var(--color-chart-5)");
    expect(categoryTone(12)).toBe("var(--color-chart-5)");
    expect(categoryTone(-1)).toBe("var(--color-chart-1)");
  });
});

describe("categoryCode", () => {
  it("gives each built-in its two-letter code", () => {
    const expected: Record<string, string> = {
      Housing: "HO",
      Shopping: "SH",
      Health: "HE",
      "Dine Out": "DO",
      Groceries: "GR",
      Transports: "TR",
      Entertainment: "EN",
      Experiences: "EX",
      Services: "SE",
      Income: "IN",
      Transfer: "TF",
      Taxes: "TX",
      Others: "OT",
    };
    for (const [c, code] of Object.entries(expected)) expect(categoryCode(c)).toBe(code);
  });

  it("is -- when there is no category", () => {
    expect(categoryCode(null)).toBe("--");
    expect(categoryCode(undefined)).toBe("--");
    expect(categoryCode("Uncategorized")).toBe("--");
  });

  it("derives a code for your own categories", () => {
    expect(categoryCode("Gym")).toBe("GY");
    expect(categoryCode("Pet Care")).toBe("PC");
    expect(categoryCode("x")).toBe("X-");
  });
});

// Polish 2 #2: a category named like an Object key still gets a colour string.
describe("categoryColor with prototype names", () => {
  it.each(["constructor", "toString", "hasOwnProperty", "__proto__"])("%s hashes", (name) => {
    expect(categoryColor(name)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
