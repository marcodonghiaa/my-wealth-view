import { isPaymentRow, type SplitwiseFile, type SplitwiseRow } from "./splitwise-parse";

// Works out, for one chosen member ("me"), what each Splitwise row means: my share of an
// expense, or a settle-up between friends. Assumes one payer per expense; a row with more than
// one payer cannot be split reliably from the export, so it is marked unclear.

export type RowKind =
  | "paid_by_other"
  | "paid_by_me"
  | "not_involved"
  | "unclear"
  | "refund"
  | "settle_out"
  | "settle_in"
  | "settle_other";

export interface ClassifiedRow extends SplitwiseRow {
  kind: RowKind;
  /** My own column for this row (paid minus owed), in cents. */
  myNetCents: number;
  /** My share of the cost in cents, or null when the row is not an expense of mine. */
  shareCents: number | null;
}

const withKind = (
  r: SplitwiseRow,
  mine: number,
  kind: RowKind,
  shareCents: number | null,
): ClassifiedRow => ({ ...r, kind, myNetCents: mine, shareCents });

function classifyPayment(r: SplitwiseRow, mine: number): ClassifiedRow {
  if (mine > 0) return withKind(r, mine, "settle_out", null);
  if (mine < 0) return withKind(r, mine, "settle_in", null);
  return withKind(r, mine, "settle_other", null);
}

function classifyExpense(r: SplitwiseRow, mine: number): ClassifiedRow {
  if (r.costCents < 0) return withKind(r, mine, "refund", null);

  const payers = r.netCents.filter((n) => n > 0).length;
  if (payers !== 1) return withKind(r, mine, "unclear", null);

  if (mine < 0) return withKind(r, mine, "paid_by_other", -mine);
  if (mine > 0) return withKind(r, mine, "paid_by_me", r.costCents - mine);
  return withKind(r, mine, "not_involved", null);
}

/** Classifies every row for the member at `meIndex` (a position in `file.members`). */
export function classifyRows(file: SplitwiseFile, meIndex: number): Array<ClassifiedRow> {
  if (!Number.isInteger(meIndex) || meIndex < 0 || meIndex >= file.members.length) {
    throw new Error("Choose which member of the group you are.");
  }
  return file.rows.map((r) => {
    const mine = r.netCents[meIndex] ?? 0;
    return isPaymentRow(r) ? classifyPayment(r, mine) : classifyExpense(r, mine);
  });
}

export interface Summary {
  paidByOther: { count: number; shareCents: number };
  paidByMe: { count: number; costCents: number; shareCents: number };
  notInvolved: { count: number };
  unclear: { count: number };
  refunds: { count: number };
  settledOutCents: number;
  settledInCents: number;
}

/** Totals for the review screen and for checking against the user's own expectations. */
export function summarize(rows: Array<ClassifiedRow>): Summary {
  const of = (kind: RowKind) => rows.filter((r) => r.kind === kind);
  const add = (list: Array<ClassifiedRow>, pick: (r: ClassifiedRow) => number) =>
    list.reduce((total, r) => total + pick(r), 0);
  return {
    paidByOther: {
      count: of("paid_by_other").length,
      shareCents: add(of("paid_by_other"), (r) => r.shareCents ?? 0),
    },
    paidByMe: {
      count: of("paid_by_me").length,
      costCents: add(of("paid_by_me"), (r) => r.costCents),
      shareCents: add(of("paid_by_me"), (r) => r.shareCents ?? 0),
    },
    notInvolved: { count: of("not_involved").length },
    unclear: { count: of("unclear").length },
    refunds: { count: of("refund").length },
    settledOutCents: add(of("settle_out"), (r) => r.costCents),
    settledInCents: add(of("settle_in"), (r) => r.costCents),
  };
}
