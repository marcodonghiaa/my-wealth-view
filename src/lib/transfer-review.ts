import { supabase } from "@/integrations/supabase/client";
import { restoredFlow, txId, type TxKey } from "@/lib/transactions";

// Who decided a row's flow_type. "user", "rule", "pair" and "own_account" are decisions to keep;
// "legacy" is history from before flow_source, which automation also leaves alone.
export type FlowSource = "user" | "rule" | "own_account" | "pair" | "bank" | "default" | "legacy";

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

// Flows only a guess made: a row decided by the user, a rule or a pairing is not asked about.
const REVIEWABLE = new Set<string | null>([null, "legacy", "default", "bank"]);

/** The category says one thing and the flow another, and nobody decided the flow on purpose. */
export function needsReview(r: ReviewRow): boolean {
  if (!REVIEWABLE.has(r.flow_source)) return false;
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

// PostgREST returns at most this many rows per request.
const PAGE = 1000;

/** Every row whose category could disagree with how it counts (reviewGroups filters further).
 * The table, not the view: rules match the bank's name and rows group by merchant_key. */
export async function fetchReviewRows(): Promise<Array<ReviewRow>> {
  const rows: Array<ReviewRow> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("transactions")
      .select(
        "entry_reference,account_uid,booking_date,category,creditor_name,merchant_key,currency,amount,credit_debit_indicator,flow_type,flow_source",
      )
      .in("category", ["Transfer", "Income"])
      .is("deleted_at", null)
      .order("booking_date", { ascending: false })
      .order("account_uid", { ascending: true })
      .order("entry_reference", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return rows;
  }
}
