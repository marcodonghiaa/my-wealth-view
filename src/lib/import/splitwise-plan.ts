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
  /** The dates the file covers: the group's rows inside them are replaced. */
  from: string;
  to: string;
  shares: Array<ShareRow>;
  links: Array<LinkRow>;
  /** Anything here blocks the import. */
  problems: Array<string>;
}

export interface PlanInput {
  group: string;
  rows: Array<ClassifiedRow>;
  /** One id per row, same order as `rows`. */
  fingerprints: Array<string>;
  confirmed: Array<BankMatch>;
  /** Links made by an earlier import of this group, by row id. */
  existingLinks: Map<string, { accountUid: string; entryReference: string }>;
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

function checkMatches(input: PlanInput): {
  problems: Array<string>;
  byRow: Map<number, BankMatch>;
} {
  const problems: Array<string> = [];
  const byRow = new Map<number, BankMatch>();
  const usedTx = new Set<string>();
  const kinds = new Map(input.rows.map((r) => [r.row, r.kind]));

  for (const m of input.confirmed) {
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
  const { problems, byRow } = checkMatches(input);
  if (group === "" || group.length > MAX_GROUP) {
    problems.push(`The group name must be between 1 and ${MAX_GROUP} characters.`);
  }

  const shares: Array<ShareRow> = [];
  const links: Array<LinkRow> = [];

  input.rows.forEach((r, i) => {
    const fingerprint = input.fingerprints[i] ?? "";
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
    const link = match
      ? { accountUid: match.accountUid, entryReference: match.entryReference }
      : input.existingLinks.get(fingerprint);

    const wanted =
      r.kind === "paid_by_other" ||
      (r.kind === "paid_by_me" && (link !== undefined || input.includeUnmatchedPaidByMe));
    if (!wanted || !r.shareCents || r.shareCents <= 0) return;

    if (fingerprint.length > MAX_FINGERPRINT) {
      problems.push(`Row ${r.row} is too long to be identified.`);
      return;
    }
    if (!link && input.rate(r.currency, r.date) === null) {
      problems.push(`No exchange rate for ${r.currency} on ${r.date} (row ${r.row}).`);
    }
    shares.push({
      fingerprint,
      booking_date: r.date,
      description: r.description.slice(0, MAX_DESCRIPTION),
      category: input.categoryFor(r),
      amount: euros(r.shareCents),
      currency: r.currency,
      linked_account_uid: link?.accountUid ?? null,
      linked_entry_reference: link?.entryReference ?? null,
    });
  });

  const dates = input.rows.map((r) => r.date).sort();
  return {
    group,
    from: dates[0] ?? "",
    to: dates[dates.length - 1] ?? "",
    shares,
    links,
    problems,
  };
}
