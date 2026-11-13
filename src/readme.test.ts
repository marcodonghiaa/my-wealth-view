import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Issue #149: the README only pointed to setup.sh, so a self-hoster landing here first missed the
// recommended installer. fails_when=the Self-host section doesn't lead with npx create-alopex
describe("README", () => {
  // Relative to this file, so it works whichever folder vitest starts in (polish-3 F8).
  const readme = readFileSync(join(import.meta.dirname, "../README.md"), "utf8");
  const selfHost = readme.slice(readme.indexOf("## Self-host it"), readme.indexOf("## Develop"));

  it("leads the Self-host section with npx create-alopex", () => {
    const npx = selfHost.indexOf("npx create-alopex");
    expect(npx).toBeGreaterThan(-1);
    expect(npx).toBeLessThan(selfHost.indexOf("setup.sh"));
  });

  // polish-3 F9: the Deploy button now sits inside the collapsed Older path.
  // fails_when=the Deploy section points "above" without saying where
  it("says where the Deploy button is", () => {
    expect(readme).not.toMatch(/Deploy button above/);
    expect(readme).toMatch(/Deploy button under \*\*Older path\*\*/);
  });
});
