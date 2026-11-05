import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(__dirname, "../styles.css"), "utf8");

describe("figure-display (HeadlineFigure)", () => {
  // Regression: a total of about €10 billion ran past a 375px screen and made the
  // page scroll sideways. jsdom has no layout, so check the rule that fixes it.
  it("lets a very long amount wrap instead of widening the page", () => {
    const rule = css.match(/@utility figure-display\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(rule).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
