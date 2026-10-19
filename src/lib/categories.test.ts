import { describe, expect, it } from "vitest";
import { CATEGORIES, categoryColor } from "./categories";

describe("categoryColor", () => {
  it("gives every category its own colour", () => {
    const colors = CATEGORIES.map((c) => categoryColor(c));
    expect(new Set(colors).size).toBe(CATEGORIES.length);
  });

  it("falls back to the muted token for unknown or missing categories", () => {
    expect(categoryColor("Uncategorized")).toBe("var(--color-muted-foreground)");
    expect(categoryColor(null)).toBe("var(--color-muted-foreground)");
    expect(categoryColor(undefined)).toBe("var(--color-muted-foreground)");
  });
});
