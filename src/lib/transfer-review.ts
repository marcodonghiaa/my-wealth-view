import { restoredFlow, txId, type TxKey } from "@/lib/transactions";

// A pair of rows the bank sync guessed is one move between your own accounts.
export interface TransferPair {
  id: string;
  out_account_uid: string;
  out_ref: string;
  in_account_uid: string;
  in_ref: string;
}

/** Each side of each pair, by txId, mapped to the pair's id. */
export function pairIdByTx(pairs: Array<TransferPair>): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of pairs) {
    out.set(txId({ account_uid: p.out_account_uid, entry_reference: p.out_ref }), p.id);
    out.set(txId({ account_uid: p.in_account_uid, entry_reference: p.in_ref }), p.id);
  }
  return out;
}

// A row of the transactions table, as the "To review" list reads it.
export interface ReviewRow extends TxKey {
  booking_date: string | null;
  category: string | null;
  creditor_name: string | null;
  merchant_key: string | null;
  currency: string;
  amount: number;
  credit_debit_indicator: string | null;
  flow_type: string | null;
  flow_source: string | null;
}

// Like the views: a row with no flow yet counts by its direction.
const flowOf = (r: ReviewRow) => r.flow_type ?? restoredFlow(r);

/** The category says one thing and the flow another, and the user hasn't decided yet. */
export function needsReview(r: ReviewRow): boolean {
  if (r.flow_source === "user") return false;
  const flow = flowOf(r);
  if (r.category === "Transfer") return flow === "spend" || flow === "income";
  if (r.category === "Income") return flow === "transfer";
  return false;
}

export interface ReviewGroup {
  key: string;
  name: string | null; // the bank's name, also what a rule matches on
  rows: Array<ReviewRow>;
  totals: Array<{ currency: string; amount: number }>; // signed, one per currency
  direction: "spend" | "income" | "mixed";
}

/** Rows needing review, grouped by merchant (or name), biggest group first. */
export function reviewGroups(rows: Array<ReviewRow>): Array<ReviewGroup> {
  const byKey = new Map<string, Array<ReviewRow>>();
  for (const r of rows.filter(needsReview)) {
    const key = r.merchant_key ?? r.creditor_name ?? "";
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }
  return [...byKey]
    .map(([key, group]) => {
      const totals = new Map<string, number>();
      for (const r of group) {
        const signed = r.credit_debit_indicator === "DBIT" ? -r.amount : r.amount;
        totals.set(r.currency, (totals.get(r.currency) ?? 0) + signed);
      }
      const flows = new Set(group.map(restoredFlow));
      return {
        key,
        name: group.find((r) => r.creditor_name)?.creditor_name ?? null,
        rows: group,
        totals: [...totals].map(([currency, amount]) => ({ currency, amount })),
        direction: flows.size > 1 ? ("mixed" as const) : [...flows][0]!,
      };
    })
    .sort((a, b) => b.rows.length - a.rows.length || a.key.localeCompare(b.key));
}
