import { numberFormat } from "@/lib/locale";
import { supabase } from "@/integrations/supabase/client";
import { txId, type TxKey } from "@/lib/transactions";

export const money = (value: number, currency: string) =>
  numberFormat({ style: "currency", currency }).format(value);

// owed_by is free text; several people are stored comma-separated ("Anna, Luca M").
export const parseNames = (owedBy: string | null | undefined): Array<string> =>
  (owedBy ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

export const joinNames = (names: Array<string>): string | null =>
  names.length ? names.join(", ") : null;

/** Your share when the bill is split evenly between `ways` people, to the cent. */
export const evenShare = (full: number, ways: number): number =>
  Math.round((full / ways) * 100) / 100;

/** Everyone named on a past split, most used first: the saved contacts the split editor offers. */
export function contactsFrom(rows: Array<{ owed_by: string | null }>): Array<string> {
  const counts = new Map<string, { name: string; n: number }>();
  for (const r of rows)
    for (const name of parseNames(r.owed_by)) {
      const key = name.toLowerCase();
      const hit = counts.get(key);
      if (hit) hit.n++;
      else counts.set(key, { name, n: 1 });
    }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    .map((c) => c.name);
}

export async function fetchSplitContacts(): Promise<Array<string>> {
  // neq "" also drops NULLs (NULL <> '' is not true), so only named splits come back.
  const { data, error } = await supabase.from("transactions").select("owed_by").neq("owed_by", "");
  if (error) throw error;
  return contactsFrom(data ?? []);
}

export interface SplitRow extends TxKey {
  booking_date: string | null;
  creditor_name: string | null;
  owed_by: string | null;
  owed_settled: boolean | null;
  signed_amount_eur: number | null;
  personal_signed_amount_eur: number | null;
}

/**
 * What the others owe you on a split, in euros. Signed: a split refund (money in) gives back
 * their share, so it counts against what they owe.
 */
export const owedEur = (r: SplitRow): number =>
  (r.personal_signed_amount_eur ?? 0) - (r.signed_amount_eur ?? 0);

// A charge refunded in full or moved to transfers is no longer money anyone owes.
const SKIPPED_FLOWS = new Set(["refunded", "transfer"]);

export async function fetchSplits(): Promise<Array<SplitRow>> {
  const [view, imported] = await Promise.all([
    supabase
      .from("v_transactions_eur")
      .select(
        "entry_reference, account_uid, booking_date, creditor_name, owed_by, owed_settled, signed_amount_eur, personal_signed_amount_eur, flow_type",
      )
      .gte("personal_amount", 0)
      .order("booking_date", { ascending: false }),
    // A bank charge matched to a Splitwise expense gets my share as personal_amount, but who owes
    // me the rest is already in the Splitwise balances: listing it here would count it twice.
    supabase
      .from("transactions")
      .select("entry_reference, account_uid, import_batch_id")
      .gte("personal_amount", 0),
  ]);
  if (view.error) throw view.error;
  if (imported.error) throw imported.error;
  const fromSplitwise = new Set(
    (imported.data ?? []).filter((t) => t.import_batch_id != null).map((t) => txId(t)),
  );
  return ((view.data ?? []) as Array<SplitRow & { flow_type: string | null }>).filter(
    (r) => owedEur(r) !== 0 && !SKIPPED_FLOWS.has(r.flow_type ?? "") && !fromSplitwise.has(txId(r)),
  );
}

export const NO_NAME = "Not assigned";

export interface SplitPerson {
  name: string;
  rows: Array<SplitRow>;
  open: number;
}

/** Each person's bills, with their open share (a bill split among several counts evenly). */
export function peopleFrom(rows: Array<SplitRow>): Array<SplitPerson> {
  const people = new Map<string, SplitPerson>();
  for (const r of rows) {
    const names = parseNames(r.owed_by);
    for (const name of names.length ? names : [NO_NAME]) {
      const key = name.toLowerCase();
      const p = people.get(key) ?? { name, rows: [], open: 0 };
      p.rows.push(r);
      if (!r.owed_settled) p.open += owedEur(r) / Math.max(1, names.length);
      people.set(key, p);
    }
  }
  // Under a cent left after sharing is rounding, not money owed.
  for (const p of people.values()) if (Math.abs(p.open) < 0.005) p.open = 0;
  return [...people.values()].sort((a, b) => b.open - a.open);
}
