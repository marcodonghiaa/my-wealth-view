import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(__dirname, "styles.css"), "utf8");

describe("global styles", () => {
  // Regression: iOS Safari gives <input type="date"> a wide built-in minimum
  // width, so in the trades dialog's two-column grid the Date field ran past
  // the dialog's edge. jsdom has no layout, so check the rule that fixes it.
  it("lets date inputs shrink to their column on iOS", () => {
    const rule = css.match(/input\[type="date"\]\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(rule).toMatch(/min-width:\s*0/);
    expect(rule).toMatch(/-webkit-appearance:\s*none/);
  });
});
