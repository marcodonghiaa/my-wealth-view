// A group's stored rows are what the checkpoint protects, so importing a file under the wrong name
// bypasses it. These checks keep a file with its group whatever the file is called.

export interface StoredGroupRow {
  group_name: string;
  fingerprint: string;
}

const normalized = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export const groupNames = (stored: Array<StoredGroupRow>): Array<string> =>
  [...new Set(stored.map((s) => s.group_name))].sort();

/** Why a file cannot start a new group with this name, or null when it can. */
export function newGroupProblem(
  name: string,
  fingerprints: Array<string>,
  stored: Array<StoredGroupRow>,
): string | null {
  if (name.trim() === "") return "Give the new group a name.";

  const same = groupNames(stored).find((g) => normalized(g) === normalized(name));
  if (same) return `A group called ${same} already exists. Choose it from the list.`;

  const inFile = new Set(fingerprints);
  const overlap = new Map<string, number>();
  for (const s of stored) {
    if (inFile.has(s.fingerprint)) overlap.set(s.group_name, (overlap.get(s.group_name) ?? 0) + 1);
  }
  // Identical rows in two groups happen by chance once, not twice.
  const owner = [...overlap].find(([, n]) => n >= 2 || n === fingerprints.length);
  return owner
    ? `This file's expenses are already imported in ${owner[0]}. Choose that group instead.`
    : null;
}
