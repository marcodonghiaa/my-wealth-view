import type { ImportKind } from "./commit";

/** The spreadsheet kinds, plus the Splitwise import, which has its own undo memory. */
export type ImportSource = ImportKind | "splitwise";

export interface LastImport {
  batchId: string;
  count: number;
}

const key = (userId: string, kind: ImportSource) => `import:last:${userId}:${kind}`;

/** Browser storage can be missing or full (private mode); the import itself never depends on it. */
export function browserStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function saveLastImport(
  store: Storage | null,
  userId: string,
  kind: ImportSource,
  last: LastImport,
): void {
  try {
    store?.setItem(key(userId, kind), JSON.stringify(last));
  } catch {
    // Undo after leaving the page is lost; the import already succeeded.
  }
}

export function loadLastImport(
  store: Storage | null,
  userId: string,
  kind: ImportSource,
): LastImport | null {
  try {
    const parsed: unknown = JSON.parse(store?.getItem(key(userId, kind)) ?? "null");
    if (typeof parsed !== "object" || parsed === null) return null;
    const { batchId, count } = parsed as Record<string, unknown>;
    return typeof batchId === "string" && typeof count === "number" ? { batchId, count } : null;
  } catch {
    return null;
  }
}

export function clearLastImport(store: Storage | null, userId: string, kind: ImportSource): void {
  try {
    store?.removeItem(key(userId, kind));
  } catch {
    // Nothing to do: a stale entry only offers an Undo that removes zero rows.
  }
}

/** The queries an import changes, so the app refreshes those and nothing else. */
export function refreshKeys(kind: ImportSource): Array<Array<string>> {
  if (kind === "net_worth") {
    return [["net-worth-history"], ["reports-net-worth-boundary"], ["welcome-facts"]];
  }
  const spend = [["spend-by-category"], ["reports-spend"], ["welcome-facts"]];
  if (kind === "spend") return spend;
  return [
    ...spend,
    ["category-transactions"],
    ["income-vs-expenses"],
    ["reports-income-expenses"],
    ["transactions"],
  ];
}
