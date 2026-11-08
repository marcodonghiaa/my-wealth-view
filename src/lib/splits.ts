import { supabase } from "@/integrations/supabase/client";
import type { TxKey } from "@/lib/transactions";

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

/** What the others owe you on a split, in euros. */
export const owedEur = (r: SplitRow): number =>
  Math.max(0, Math.abs(r.signed_amount_eur ?? 0) - Math.abs(r.personal_signed_amount_eur ?? 0));

export async function fetchSplits(): Promise<Array<SplitRow>> {
  const { data, error } = await supabase
    .from("v_transactions_eur")
    .select(
      "entry_reference, account_uid, booking_date, creditor_name, owed_by, owed_settled, signed_amount_eur, personal_signed_amount_eur",
    )
    .gte("personal_amount", 0)
    .order("booking_date", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Array<SplitRow>).filter((r) => owedEur(r) > 0);
}

export const NO_NAME = "Not assigned";

/** Open (not yet paid back) amount per person; a split named after several people is shared evenly. */
export function owedByPerson(rows: Array<SplitRow>): Array<{ name: string; owed: number }> {
  const totals = new Map<string, { name: string; owed: number }>();
  for (const r of rows) {
    if (r.owed_settled) continue;
    const names = parseNames(r.owed_by);
    const people = names.length ? names : [NO_NAME];
    for (const name of people) {
      const key = name.toLowerCase();
      const t = totals.get(key) ?? { name, owed: 0 };
      t.owed += owedEur(r) / people.length;
      totals.set(key, t);
    }
  }
  return [...totals.values()].sort((a, b) => b.owed - a.owed);
}
