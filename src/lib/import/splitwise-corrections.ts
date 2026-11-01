import type { ClassifiedRow } from "./splitwise-classify";
import type { RateToEur } from "./splitwise-match";
import type { RpcClient } from "./splitwise-commit";

// Compares a Splitwise file with what earlier imports stored, inside the dates the file covers,
// and turns the rows the user ticks into one database call. Pure except runCorrections.

const MAX_DESCRIPTION = 300;
const MAX_FINGERPRINT = 500;

/** A row an earlier import stored for this group. */
export interface StoredShare {
  id: string;
  fingerprint: string;
  booking_date: string;
  description: string;
  amount: number;
  currency: string;
  linked_entry_reference: string | null;
}

export interface FileRow {
  row: ClassifiedRow;
  fingerprint: string;
}

/** A stored row gone from the file, and the file row that replaces it. */
export interface EditedRow extends FileRow {
  stored: StoredShare;
}

export interface StoredDiff {
  edited: Array<EditedRow>;
  /** Stored rows gone from the file, inside its dates, with no sure replacement. */
  removed: Array<StoredShare>;
}

export const isShareRow = (r: ClassifiedRow): boolean =>
  (r.kind === "paid_by_other" || r.kind === "paid_by_me") && (r.shareCents ?? 0) > 0;

/** The id's own fields, which keep what Splitwise said even if the description was edited here. */
export function readFingerprint(
  fingerprint: string,
): { date: string; description: string; costCents: number } | null {
  const body = fingerprint.slice(0, fingerprint.lastIndexOf("#"));
  const parts = body.split("|");
  if (parts.length < 5) return null;
  return {
    date: parts[0] ?? "",
    description: parts.slice(1, -3).join("|"),
    costCents: Number(parts[parts.length - 3]),
  };
}

// An edit in place keeps its date and one of description or cost. A monthly bill with a new date,
// or a new expense on another day, must not read as an edit, so a moved date shows as two rows.
function couldBeEdit(s: StoredShare, r: ClassifiedRow): boolean {
  const old = readFingerprint(s.fingerprint);
  if (!old || old.date !== r.date) return false;
  if (s.linked_entry_reference !== null && r.kind !== "paid_by_me") return false;
  return old.description === r.description || old.costCents === r.costCents;
}

/**
 * Finds stored rows gone from the file and pairs each with its edit. A pair is made only when
 * each side has exactly one candidate; when unsure they stay separate.
 */
export function diffStored(
  rows: Array<ClassifiedRow>,
  fingerprints: Array<string>,
  stored: Array<StoredShare>,
): StoredDiff {
  const dates = rows.map((r) => r.date).sort();
  const first = dates[0] ?? "";
  const last = dates[dates.length - 1] ?? "";
  const inFile = new Set(fingerprints);
  const known = new Set(stored.map((s) => s.fingerprint));

  const gone = stored.filter(
    (s) => !inFile.has(s.fingerprint) && s.booking_date >= first && s.booking_date <= last,
  );
  const unstored: Array<FileRow> = rows.flatMap((row, i) => {
    const fingerprint = fingerprints[i] ?? "";
    return isShareRow(row) && !known.has(fingerprint) ? [{ row, fingerprint }] : [];
  });

  const candidates = gone.map((s) => unstored.filter((u) => couldBeEdit(s, u.row)));
  const edited: Array<EditedRow> = [];
  const removed: Array<StoredShare> = [];
  gone.forEach((s, i) => {
    const only = candidates[i]?.length === 1 ? candidates[i]?.[0] : undefined;
    const taken = only && candidates.filter((c) => c.includes(only)).length === 1;
    if (only && taken) edited.push({ ...only, stored: s });
    else removed.push(s);
  });
  return { edited, removed };
}

interface AddItem {
  fingerprint: string;
  booking_date: string;
  description: string;
  category: string | null;
  amount: number;
  currency: string;
}

interface EditItem {
  id: string;
  old_fingerprint: string;
  fingerprint: string;
  booking_date: string;
  description: string;
  amount: number;
  currency: string;
  cost: number;
}

interface RemoveItem {
  id: string;
  old_fingerprint: string;
}

export interface CorrectionPlan {
  add: Array<AddItem>;
  edit: Array<EditItem>;
  remove: Array<RemoveItem>;
  problems: Array<string>;
}

export interface CorrectionInput {
  older: Array<FileRow>;
  edited: Array<EditedRow>;
  removed: Array<StoredShare>;
  /** An added row is named by its fingerprint, a stored row by its id. */
  ticked: Set<string>;
  rate: RateToEur;
  categoryFor: (row: ClassifiedRow) => string | null;
}

const euros = (cents: number) => cents / 100;

/** Builds the database call for the ticked rows only. */
export function planCorrections(input: CorrectionInput): CorrectionPlan {
  const problems: Array<string> = [];
  const check = (r: ClassifiedRow, fingerprint: string, needsRate: boolean) => {
    if (fingerprint.length > MAX_FINGERPRINT) {
      problems.push(`Row ${r.row} is too long to be identified.`);
    }
    if (needsRate && input.rate(r.currency, r.date) === null) {
      problems.push(`No exchange rate for ${r.currency} on ${r.date} (row ${r.row}).`);
    }
  };

  const add = input.older
    .filter((o) => input.ticked.has(o.fingerprint))
    .map(({ row, fingerprint }) => {
      check(row, fingerprint, true);
      return {
        fingerprint,
        booking_date: row.date,
        description: row.description.slice(0, MAX_DESCRIPTION),
        category: input.categoryFor(row),
        amount: euros(row.shareCents ?? 0),
        currency: row.currency,
      };
    });

  const edit = input.edited
    .filter((e) => input.ticked.has(e.stored.id))
    .map(({ row, fingerprint, stored }) => {
      check(row, fingerprint, stored.linked_entry_reference === null);
      // A description changed here survives unless Splitwise changed it too.
      const renamed = readFingerprint(stored.fingerprint)?.description !== row.description;
      return {
        id: stored.id,
        old_fingerprint: stored.fingerprint,
        fingerprint,
        booking_date: row.date,
        description: renamed ? row.description.slice(0, MAX_DESCRIPTION) : stored.description,
        amount: euros(row.shareCents ?? 0),
        currency: row.currency,
        cost: euros(Math.abs(row.costCents)),
      };
    });

  const remove = input.removed
    .filter((s) => input.ticked.has(s.id))
    .map((s) => ({ id: s.id, old_fingerprint: s.fingerprint }));

  return { add, edit, remove, problems };
}

export interface CorrectionCounts {
  added: number;
  edited: number;
  removed: number;
}

/** Applies a plan in one all-or-nothing database call. */
export async function runCorrections(
  client: RpcClient,
  group: string,
  plan: CorrectionPlan,
): Promise<CorrectionCounts> {
  if (plan.problems.length > 0) throw new Error(plan.problems.join(" "));
  const { data, error } = await client.rpc("apply_splitwise_corrections", {
    p_batch: crypto.randomUUID(),
    p_group: group.trim(),
    p_add: plan.add,
    p_edit: plan.edit,
    p_remove: plan.remove,
  });
  if (error) {
    throw new Error(
      /could not find the function|does not exist/i.test(error.message)
        ? "This needs a database update that is not applied yet (20261109000000_splitwise_corrections). Apply it and try again. Nothing was changed."
        : error.message,
    );
  }
  const d = data as Partial<Record<keyof CorrectionCounts, unknown>> | null;
  if (
    typeof d?.added !== "number" ||
    typeof d.edited !== "number" ||
    typeof d.removed !== "number"
  ) {
    throw new Error("The database gave an unexpected answer. Check your data before trying again.");
  }
  return { added: d.added, edited: d.edited, removed: d.removed };
}
