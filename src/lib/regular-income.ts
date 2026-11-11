import { formatISODate } from "@/lib/date";
import { foldText, textMatches } from "@/lib/rules";

// Regular income: money from a sender who paid you in at least REGULAR_MONTHS of the last
// WINDOW_MONTHS months, whatever the amount (a salary with a 13th month, a steady client). A
// rule (category_rules.set_income_kind) overrides the guess for the names it matches.

export const WINDOW_MONTHS = 6;
export const REGULAR_MONTHS = 3;

/** The rule in words, for the screens that explain it. */
export const REGULAR_RULE = `paid you in at least ${REGULAR_MONTHS} of the last ${WINDOW_MONTHS} months`;

export type IncomeKind = "regular" | "one_off";

/** A credit counted as income, as read from `transactions` (the original bank name, not a rename). */
export interface IncomeTx {
  account_uid: string;
  entry_reference: string;
  booking_date: string | null;
  merchant_key: string | null;
  creditor_name: string | null;
  remittance_info: string | null;
  amount: number | null;
  currency: string | null;
}

export interface IncomeRule {
  id: string;
  match_field: string;
  match_text: string;
  match_mode: string | null;
  set_income_kind: string | null;
}

export const txKey = (t: { account_uid: string | null; entry_reference: string | null }) =>
  `${t.account_uid}:${t.entry_reference}`;

/** Who paid: the sync's normalised name, else the bank's name folded; null when there is neither. */
export function senderKey(t: Pick<IncomeTx, "merchant_key" | "creditor_name">): string | null {
  if (t.merchant_key) return t.merchant_key;
  const name = foldText(t.creditor_name ?? "").trim();
  return name || null;
}

const monthOf = (date: string) => date.slice(0, 7);

/** The months a regular sender is judged over: `month` and the five before it, as ISO dates. */
export function incomeWindow(month: Date): { start: string; end: string } {
  return {
    start: formatISODate(new Date(month.getFullYear(), month.getMonth() - (WINDOW_MONTHS - 1), 1)),
    end: formatISODate(new Date(month.getFullYear(), month.getMonth() + 1, 1)),
  };
}

/** The first of `rules` (in priority order) that matches the row: same fields and modes as the
 * sync, folded like the dashboard's other rule checks (case and accents ignored). */
export function ruleFor(
  t: Pick<IncomeTx, "creditor_name" | "remittance_info">,
  rules: ReadonlyArray<IncomeRule>,
): IncomeRule | undefined {
  const name = foldText(t.creditor_name ?? "");
  const description = foldText(t.remittance_info ?? "");
  return rules.find((r) => {
    if (r.set_income_kind !== "regular" && r.set_income_kind !== "one_off") return false;
    const text = foldText(r.match_text);
    const fields =
      r.match_field === "any"
        ? [name, description]
        : r.match_field === "remittance_info"
          ? [description]
          : [name];
    return fields.some((f) => textMatches(f, text, r.match_mode));
  });
}

/** Senders with income in at least REGULAR_MONTHS distinct months among `rows`. */
export function regularSenders(rows: ReadonlyArray<IncomeTx>): Set<string> {
  const months = new Map<string, Set<string>>();
  for (const t of rows) {
    const key = senderKey(t);
    if (!key || !t.booking_date) continue;
    const seen = months.get(key) ?? new Set<string>();
    seen.add(monthOf(t.booking_date));
    months.set(key, seen);
  }
  return new Set([...months].filter(([, m]) => m.size >= REGULAR_MONTHS).map(([k]) => k));
}

/** Each row's kind: its rule when one matches, else whether its sender is regular. */
export function classifyIncome(
  rows: ReadonlyArray<IncomeTx>,
  rules: ReadonlyArray<IncomeRule>,
): Map<string, IncomeKind> {
  const regular = regularSenders(rows);
  const kinds = new Map<string, IncomeKind>();
  for (const t of rows) {
    const rule = ruleFor(t, rules);
    const key = senderKey(t);
    kinds.set(
      txKey(t),
      rule ? (rule.set_income_kind as IncomeKind) : key && regular.has(key) ? "regular" : "one_off",
    );
  }
  return kinds;
}

export interface RegularSource {
  key: string;
  name: string;
  /** The day of the month it usually arrives (the median of its days). */
  day: number;
  /** Its usual amount (the median), in `currency`. */
  amount: number;
  currency: string;
  /** Its rows, newest first. */
  rows: Array<IncomeTx>;
}

const median = (values: Array<number>) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/**
 * The senders whose newest payment counts as regular, with when and how much they usually pay.
 * A rule that marks a name one-off takes it off; one that marks it regular puts it on.
 */
export function regularSources(
  rows: ReadonlyArray<IncomeTx>,
  rules: ReadonlyArray<IncomeRule>,
): Array<RegularSource> {
  const kinds = classifyIncome(rows, rules);
  const bySender = new Map<string, Array<IncomeTx>>();
  for (const t of rows) {
    const key = senderKey(t);
    if (!key || !t.booking_date) continue;
    bySender.set(key, [...(bySender.get(key) ?? []), t]);
  }
  const out: Array<RegularSource> = [];
  for (const [key, list] of bySender) {
    list.sort((a, b) => b.booking_date!.localeCompare(a.booking_date!));
    const newest = list[0]!;
    if (kinds.get(txKey(newest)) !== "regular") continue;
    // The usual amount in the newest payment's currency; other currencies don't mix into it.
    const currency = newest.currency ?? "EUR";
    const same = list.filter((t) => (t.currency ?? "EUR") === currency);
    out.push({
      key,
      name: newest.creditor_name ?? key,
      day: Math.round(median(list.map((t) => Number(t.booking_date!.slice(8, 10))))),
      amount: median(same.map((t) => Math.abs(t.amount ?? 0))),
      currency,
      rows: list,
    });
  }
  return out.sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
}
