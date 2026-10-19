import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_EXEMPT_TABLES, generateDemoData } from "./generate";

// Keeps the demo in step with the app: every table or view a screen reads, and every column it
// asks for, must exist in the demo data. Add a query or a column and forget the demo data: red.

const SRC = path.resolve(__dirname, "../..");

function sourceFiles(dir: string): Array<string> {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    const isSource = /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name);
    return isSource && !full.endsWith("routeTree.gen.ts") && !full.includes("/integrations/")
      ? [full]
      : [];
  });
}

// .from("table") followed by .select("a,b,c"), with literal strings only.
const READS = /\.from\(\s*"(\w+)"[^)]*\)\s*\.select\(\s*"([^"]+)"/g;
const FROMS = /\.from\(\s*"(\w+)"/g;

const files = sourceFiles(SRC).map((f) => ({
  file: path.relative(SRC, f),
  text: readFileSync(f, "utf8"),
}));
const db = generateDemoData(new Date(2026, 9, 19, 12)) as unknown as Record<
  string,
  Array<Record<string, unknown>>
>;

describe("demo data covers what the screens read", () => {
  it("finds the screens' queries (guards against the scan silently matching nothing)", () => {
    const tables = new Set(files.flatMap((f) => [...f.text.matchAll(FROMS)].map((m) => m[1])));
    expect(tables.size).toBeGreaterThan(15);
  });

  it("has rows for every table or view any screen reads", () => {
    for (const { file, text } of files) {
      for (const [, table] of text.matchAll(FROMS)) {
        const rows = db[table!];
        expect(rows, `${file} reads "${table}", which has no demo data`).toBeDefined();
        if (!(DEMO_EXEMPT_TABLES as ReadonlyArray<string>).includes(table!)) {
          expect(
            rows!.length,
            `${file} reads "${table}", which is empty in the demo`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it("has every column a screen selects", () => {
    for (const { file, text } of files) {
      for (const [, table, cols] of text.matchAll(READS)) {
        const sample = db[table!]?.[0];
        if (!sample) continue;
        for (const col of cols!.split(",").map((c) => c.trim())) {
          if (col === "*" || col.includes("(")) continue;
          expect(
            Object.keys(sample),
            `${file}: "${table}" has no column "${col}" in the demo`,
          ).toContain(col);
        }
      }
    }
  });

  it("has a page for every table in the sidebar's data (each demo section is non-empty)", () => {
    const empty = Object.entries(db)
      .filter(([, rows]) => rows.length === 0)
      .map(([t]) => t);
    expect(empty.sort()).toEqual([...DEMO_EXEMPT_TABLES].sort());
  });
});
