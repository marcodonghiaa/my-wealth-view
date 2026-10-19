import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// protects=each page loads as its own small file instead of all pages in one 940 KB bundle;
// fails_when=a route file exports its page component, which stops TanStack from splitting it out
describe("route files", () => {
  const dir = join(__dirname, "_authenticated");
  const files = readdirSync(dir).filter((f) => f.endsWith(".tsx"));

  it.each(files)("%s does not export its page component", (file) => {
    const source = readFileSync(join(dir, file), "utf8");
    expect(source).not.toMatch(/^export (async )?function \w+Page\b/m);
  });
});
