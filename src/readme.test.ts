import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Issue #149: the README only pointed to setup.sh, so a self-hoster landing here first missed the
// recommended installer. fails_when=the Self-host section doesn't lead with npx create-alopex
describe("README", () => {
  const readme = readFileSync("README.md", "utf8");
  const selfHost = readme.slice(readme.indexOf("## Self-host it"), readme.indexOf("## Develop"));

  it("leads the Self-host section with npx create-alopex", () => {
    const npx = selfHost.indexOf("npx create-alopex");
    expect(npx).toBeGreaterThan(-1);
    expect(npx).toBeLessThan(selfHost.indexOf("setup.sh"));
  });
});
