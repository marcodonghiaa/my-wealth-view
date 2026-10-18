import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { guessColumns } from "./guess-columns";
import { parseCsv } from "./parse-csv";
import { planNetWorth, planSpend } from "./plan";

const load = (name: string) => parseCsv(readFileSync(`docs/examples/${name}`, "utf8"));

describe("example CSVs in docs/examples", () => {
  // protects=the files the README points to really import; fails_when=a header or format change
  // makes an example skip rows; no_claim=every real-world file
  it("net-worth.csv imports every row", () => {
    const { headers, rows } = load("net-worth.csv");
    const plan = planNetWorth(rows, guessColumns(headers));
    expect(plan.rows).toHaveLength(3);
    expect(plan.skipped).toEqual([]);
  });

  it("spending.csv imports every row into app categories", () => {
    const { headers, rows } = load("spending.csv");
    const plan = planSpend(rows, guessColumns(headers));
    expect(plan.skipped).toEqual([]);
    expect(plan.rows.map((r) => r.category).sort()).toEqual([
      "Dine Out",
      "Groceries",
      "Groceries",
      "Housing",
      "Housing",
    ]);
  });
});
