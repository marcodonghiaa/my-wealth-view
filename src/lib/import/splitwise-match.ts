import type { ClassifiedRow } from "./splitwise-classify";

// Two helpers for the import review: a stable id per Splitwise row, and suggestions that link
// my Splitwise rows to bank transactions I already have. Suggestions only; nothing is written.

export interface BankTx {
  entryReference: string;
  accountUid: string;
  bookingDate: string;
  amountCents: number;
  currency: string;
  direction: "DBIT" | "CRDT";
  personalAmountCents: number | null;
  flowType: string | null;
}

export interface BankMatch {
  row: number;
  entryReference: string;
  accountUid: string;
  action: "set_personal_amount" | "mark_transfer";
  confidence: "likely" | "ambiguous";
  personalAmountCents?: number;
}

/** Converts an amount in `currency` on a date to euros per unit, or null when no rate is known. */
export type RateToEur = (currency: string, date: string) => number | null;

// A card payment or a bank transfer lands in the bank a little after the date in Splitwise.
const DAYS_BEFORE = 1;
const DAYS_AFTER = 7;
// Card fees and rates differ from the ones used here.
const AMOUNT_TOLERANCE = 0.04;
const DAY_PENALTY = 0.002;
// An expense is sometimes entered in Splitwise weeks after it was paid. Such a transaction is
// only proposed when the amount is practically identical, and always left for the user to confirm.
const EARLY_DAYS = 30;
const EARLY_TOLERANCE = 0.005;

/**
 * One id per row, the same on every import of the same file. It uses only my own column, so a
 * new member joining the group does not change it. Identical rows get a counter.
 */
export function fingerprintRows(rows: Array<ClassifiedRow>): Array<string> {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = [r.date, r.description, r.costCents, r.currency, r.myNetCents].join("|");
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return `${base}#${count}`;
  });
}

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

function wantedDirection(r: ClassifiedRow): BankTx["direction"] | null {
  if (r.kind === "paid_by_me" || r.kind === "settle_out") return "DBIT";
  if (r.kind === "settle_in") return "CRDT";
  return null;
}

interface Candidate {
  rowIndex: number;
  txIndex: number;
  score: number;
  early: boolean;
}

function candidateFor(
  r: ClassifiedRow,
  rowIndex: number,
  bank: Array<BankTx>,
  rate: RateToEur,
): Array<Candidate> {
  const direction = wantedDirection(r);
  const rowRate = rate(r.currency, r.date);
  if (!direction || rowRate === null) return [];
  const rowEur = Math.abs(r.costCents) * rowRate;

  return bank.flatMap((tx, txIndex) => {
    if (
      tx.direction !== direction ||
      tx.personalAmountCents !== null ||
      tx.flowType === "transfer"
    ) {
      return [];
    }
    const days = dayNumber(tx.bookingDate) - dayNumber(r.date);
    const txRate = rate(tx.currency, tx.bookingDate);
    if (
      !Number.isFinite(days) ||
      days < -EARLY_DAYS ||
      days > DAYS_AFTER ||
      txRate === null ||
      rowEur === 0
    )
      return [];
    const early = days < -DAYS_BEFORE;
    const gap = Math.abs(rowEur - tx.amountCents * txRate) / rowEur;
    if (gap > (early ? EARLY_TOLERANCE : AMOUNT_TOLERANCE)) return [];
    return [{ rowIndex, txIndex, score: gap + DAY_PENALTY * Math.abs(days), early }];
  });
}

const countBy = (keys: Array<number>): Map<number, number> =>
  keys.reduce((counts, k) => counts.set(k, (counts.get(k) ?? 0) + 1), new Map<number, number>());

/** Suggests, for each row of mine that has a bank counterpart, which transaction it is. */
export function matchBank(
  rows: Array<ClassifiedRow>,
  bank: Array<BankTx>,
  rate: RateToEur,
): Array<BankMatch> {
  const all = rows.flatMap((r, i) => candidateFor(r, i, bank, rate));
  const perRow = countBy(all.map((c) => c.rowIndex));
  const perTx = countBy(all.map((c) => c.txIndex));

  const usedRows = new Set<number>();
  const usedTx = new Set<number>();
  const matches: Array<BankMatch> = [];

  for (const c of [...all].sort((a, b) => a.score - b.score)) {
    const r = rows[c.rowIndex];
    const tx = bank[c.txIndex];
    if (!r || !tx || usedRows.has(c.rowIndex) || usedTx.has(c.txIndex)) continue;
    usedRows.add(c.rowIndex);
    usedTx.add(c.txIndex);

    const isExpense = r.kind === "paid_by_me";
    matches.push({
      row: r.row,
      entryReference: tx.entryReference,
      accountUid: tx.accountUid,
      action: isExpense ? "set_personal_amount" : "mark_transfer",
      confidence:
        !c.early && perRow.get(c.rowIndex) === 1 && perTx.get(c.txIndex) === 1
          ? "likely"
          : "ambiguous",
      ...(isExpense
        ? {
            personalAmountCents: Math.round(
              (tx.amountCents * (r.shareCents ?? 0)) / Math.abs(r.costCents),
            ),
          }
        : {}),
    });
  }
  return matches.sort((a, b) => a.row - b.row);
}
