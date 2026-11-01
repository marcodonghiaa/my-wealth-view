import { describe, expect, it } from "vitest";
import { groupNames, newGroupProblem, type StoredGroupRow } from "./splitwise-group";

const stored = (group_name: string, ...fingerprints: Array<string>): Array<StoredGroupRow> =>
  fingerprints.map((fingerprint) => ({ group_name, fingerprint }));

describe("groupNames", () => {
  it("lists each stored group once, sorted", () => {
    expect(groupNames([...stored("trip", "a", "b"), ...stored("berkeley", "c")])).toEqual([
      "berkeley",
      "trip",
    ]);
  });
});

describe("newGroupProblem", () => {
  const rows = stored("berkeley", "a", "b", "c");

  it("accepts a new name for a file nothing stored knows", () => {
    expect(newGroupProblem("trip", ["x", "y"], rows)).toBeNull();
  });

  it("asks for a name", () => {
    expect(newGroupProblem("  ", ["x"], rows)).toMatch(/name/i);
  });

  // protects=a variant of a name cannot bypass the checkpoint; fails_when=the comparison is exact
  it.each(["Berkeley", " berkeley ", "BERKELEY"])("refuses %j, already stored", (name) => {
    expect(newGroupProblem(name, ["x"], rows)).toMatch(/berkeley.*already/i);
  });

  // protects=the same file under any new name; fails_when=the near miss with the file's own name
  it("refuses a new name when the file's rows are stored under another group", () => {
    const problem = newGroupProblem("berkeley 2026-11-01 export (1)", ["a", "b", "z"], rows);
    expect(problem).toMatch(/already imported.*berkeley/i);
  });

  it("refuses a one-row file whose row is stored elsewhere", () => {
    expect(newGroupProblem("trip", ["a"], rows)).toMatch(/berkeley/);
  });

  it("allows one chance match in a larger file", () => {
    expect(newGroupProblem("trip", ["a", "x", "y"], rows)).toBeNull();
  });
});
