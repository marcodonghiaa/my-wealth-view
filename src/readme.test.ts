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

  // polish-5 I1/I2/I5: "run it again in the same folder" sent people into the install folder (a
  // second install inside it), npx could reuse an old cached installer, and the npx path linked to
  // the backend's setup.sh steps. fails_when=the update wording or the npx link comes back
  it("says how to update and links the installer's own guide", () => {
    expect(readme).not.toMatch(/in the same folder/);
    expect(readme).toMatch(/npx create-alopex@latest/);
    expect(selfHost).toMatch(/alopex\/blob\/main\/installer\/README\.md/);
  });
});

