import type { ClassifiedRow } from "./splitwise-classify";
import type { BankMatch, RateToEur } from "./splitwise-match";

// Turns a reviewed Splitwise import into exactly what will be written: my shares, and the
// confirmed changes to bank transactions. Pure; the caller sends the result to the database.
// Limits mirror the database checks so a bad plan is reported here, in plain words.

const MAX_GROUP = 100;
const MAX_DESCRIPTION = 300;
const MAX_FINGERPRINT = 500;

export interface ShareRow {
  fingerprint: string;
  booking_date: string;
  description: string;
  category: string | null;
  amount: number;
  currency: string;
  linked_account_uid: string | null;
  linked_entry_reference: string | null;
}

export interface LinkRow {
  account_uid: string;
  entry_reference: string;
  action: "set_personal_amount" | "mark_transfer";
  personal_amount: number | null;
}

export interface WritePlan {
  group: string;
  /** The group's stored rows inside these dates that are not in this import get deleted. */
  from: string;
  to: string;
  shares: Array<ShareRow>;
  links: Array<LinkRow>;
  /** Anything here blocks the import. */
  problems: Array<string>;
}

/** A row an earlier import stored for this group. */
export interface StoredShare {
  fingerprint: string;
  booking_date: string;
}

export interface CheckpointSplit {
  /** The newest date stored for the group; null on a first import. */
  checkpoint: string | null;
  /** The rows this import may touch, and their ids. */
  rows: Array<ClassifiedRow>;
  fingerprints: Array<string>;
  /** Expenses of mine before the checkpoint that are not stored. Shown, never imported. */
  older: Array<ClassifiedRow>;
}

export const isShareRow = (r: ClassifiedRow): boolean =>
  (r.kind === "paid_by_other" || r.kind === "paid_by_me") && (r.shareCents ?? 0) > 0;

/**
 * The last import is a checkpoint: nothing before it, and nothing already stored on its day, is
 * reviewed or written. Takes the whole file's ids, since the #counter depends on every row.
 */
export function splitAtCheckpoint(
  rows: Array<ClassifiedRow>,
  fingerprints: Array<string>,
  stored: Array<StoredShare>,
): CheckpointSplit {
  const checkpoint =
    stored
      .map((s) => s.booking_date)
      .sort()
      .at(-1) ?? null;
  const known = new Set(stored.map((s) => s.fingerprint));
  const split: CheckpointSplit = { checkpoint, rows: [], fingerprints: [], older: [] };

  rows.forEach((r, i) => {
    const fingerprint = fingerprints[i] ?? "";
    if (known.has(fingerprint)) return;
    if (checkpoint !== null && r.date < checkpoint) {
      if (isShareRow(r)) split.older.push(r);
      return;
    }
    split.rows.push(r);
    split.fingerprints.push(fingerprint);
  });
  return split;
}

const nextDay = (iso: string) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export interface PlanInput {
  group: string;
  /** The whole file. */
  rows: Array<ClassifiedRow>;
  /** One id per row, same order as `rows`. */
  fingerprints: Array<string>;
  confirmed: Array<BankMatch>;
  stored: Array<StoredShare>;
  /** Add expenses I paid that have no bank transaction as shares. */
  includeUnmatchedPaidByMe: boolean;
  categoryFor: (row: ClassifiedRow) => string | null;
  rate: RateToEur;
}

const ACTION_FOR_KIND: Record<string, LinkRow["action"] | undefined> = {
  paid_by_me: "set_personal_amount",
  settle_out: "mark_transfer",
  settle_in: "mark_transfer",
};

const euros = (cents: number) => cents / 100;
const txKey = (m: BankMatch) => `${m.accountUid}|${m.entryReference}`;

function checkMatches(
  rows: Array<ClassifiedRow>,
  confirmed: Array<BankMatch>,
): {
  problems: Array<string>;
  byRow: Map<number, BankMatch>;
} {
  const problems: Array<string> = [];
  const byRow = new Map<number, BankMatch>();
  const usedTx = new Set<string>();
  const kinds = new Map(rows.map((r) => [r.row, r.kind]));

  for (const m of confirmed) {
    const expected = ACTION_FOR_KIND[kinds.get(m.row) ?? ""];
    if (!expected || m.action !== expected) {
      problems.push(`Row ${m.row} cannot be linked to a bank transaction.`);
    } else if (expected === "set_personal_amount" && m.personalAmountCents === undefined) {
      problems.push(`Row ${m.row} has no amount for the bank transaction.`);
    } else if (usedTx.has(txKey(m))) {
      problems.push(`Bank transaction ${m.entryReference} is chosen for more than one row.`);
    } else {
      usedTx.add(txKey(m));
      byRow.set(m.row, m);
    }
  }
  return { problems, byRow };
}

/** Builds the shares and bank changes for one reviewed import. */
export function planWrite(input: PlanInput): WritePlan {
  const group = input.group.trim();
  const { checkpoint, rows, fingerprints } = splitAtCheckpoint(
    input.rows,
    input.fingerprints,
    input.stored,
  );
  const { problems, byRow } = checkMatches(rows, input.confirmed);
  if (group === "" || group.length > MAX_GROUP) {
    problems.push(`The group name must be between 1 and ${MAX_GROUP} characters.`);
  }

  const shares: Array<ShareRow> = [];
  const links: Array<LinkRow> = [];

  rows.forEach((r, i) => {
    const fingerprint = fingerprints[i] ?? "";
    const match = byRow.get(r.row);

    if (match) {
      links.push({
        account_uid: match.accountUid,
        entry_reference: match.entryReference,
        action: match.action,
        personal_amount:
          match.action === "set_personal_amount" ? euros(match.personalAmountCents ?? 0) : null,
      });
    }
    const wanted =
      r.kind === "paid_by_other" ||
      (r.kind === "paid_by_me" && (match !== undefined || input.includeUnmatchedPaidByMe));
    if (!wanted || !r.shareCents || r.shareCents <= 0) return;

    if (fingerprint.length > MAX_FINGERPRINT) {
      problems.push(`Row ${r.row} is too long to be identified.`);
      return;
    }
    if (!match && input.rate(r.currency, r.date) === null) {
      problems.push(`No exchange rate for ${r.currency} on ${r.date} (row ${r.row}).`);
    }
    shares.push({
      fingerprint,
      booking_date: r.date,
      description: r.description.slice(0, MAX_DESCRIPTION),
      category: input.categoryFor(r),
      amount: euros(r.shareCents),
      currency: r.currency,
      linked_account_uid: match?.accountUid ?? null,
      linked_entry_reference: match?.entryReference ?? null,
    });
  });

  // After a checkpoint the range starts the next day, so the delete step cannot reach a stored
  // row; a checkpoint-day addition is inserted regardless, since inserts ignore the range.
  const dates = rows.map((r) => r.date).sort();
  const from = checkpoint === null ? (dates[0] ?? "") : nextDay(checkpoint);
  const last = dates[dates.length - 1] ?? "";
  return {
    group,
    from,
    to: last > from ? last : from,
    shares,
    links,
    problems,
  };
}
