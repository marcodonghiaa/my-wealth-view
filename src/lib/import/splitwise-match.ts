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
  /** Who was paid, as the bank names it; only shown to the user. */
  name?: string | null;
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

// Find in bank: the user picks the payment by hand, so any amount is fine; the window is a bit
// wider before the expense date than the matcher's, since people log a bill a few days late.
const PICK_DAYS_BEFORE = 3;
const PICK_DAYS_AFTER = 7;

const txKey = (t: { accountUid: string; entryReference: string }) =>
  `${t.accountUid}|${t.entryReference}`;

/**
 * Payments out of my accounts around an expense I paid, closest date first, leaving out the ones
 * already split, marked as transfers, or taken by another row of this import (`taken` keys are
 * "accountUid|entryReference").
 */
export function nearbyPayments(
  r: ClassifiedRow,
  bank: Array<BankTx>,
  taken: Set<string>,
): Array<BankTx> {
  const day = dayNumber(r.date);
  return bank
    .filter((tx) => {
      const days = dayNumber(tx.bookingDate) - day;
      return (
        tx.direction === "DBIT" &&
        tx.personalAmountCents === null &&
        tx.flowType !== "transfer" &&
        !taken.has(txKey(tx)) &&
        days >= -PICK_DAYS_BEFORE &&
        days <= PICK_DAYS_AFTER
      );
    })
    .sort(
      (a, b) =>
        Math.abs(dayNumber(a.bookingDate) - day) - Math.abs(dayNumber(b.bookingDate) - day) ||
        b.amountCents - a.amountCents,
    );
}

export interface ManualSplit {
  /** What the others owe me for this expense, in the bank transaction's currency. */
  othersOweCents: number;
  /** What stays my spending: the bank amount minus what the others owe, never below zero. */
  personalAmountCents: number;
}

/**
 * My part of a payment the user linked by hand: what left the bank minus what the others owe me
 * on Splitwise. The amounts may differ (tip, a split entered differently), so the bank amount is
 * the truth and Splitwise only says how much comes back. Null when a rate is missing.
 */
export function manualSplit(r: ClassifiedRow, tx: BankTx, rate: RateToEur): ManualSplit | null {
  const rowRate = rate(r.currency, r.date);
  const txRate = rate(tx.currency, tx.bookingDate);
  if (rowRate === null || txRate === null || txRate === 0) return null;
  const owedInRow = Math.max(0, Math.abs(r.costCents) - (r.shareCents ?? 0));
  const othersOweCents = Math.round((owedInRow * rowRate) / txRate);
  return {
    othersOweCents,
    personalAmountCents: Math.max(0, tx.amountCents - othersOweCents),
  };
}

/** The link the plan writes when the user picks a payment by hand. */
export function manualMatch(r: ClassifiedRow, tx: BankTx, split: ManualSplit): BankMatch {
  return {
    row: r.row,
    entryReference: tx.entryReference,
    accountUid: tx.accountUid,
    action: "set_personal_amount",
    confidence: "likely",
    personalAmountCents: split.personalAmountCents,
  };
}
