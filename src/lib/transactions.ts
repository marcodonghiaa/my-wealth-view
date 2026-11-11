import { dateLocale, numberFormat } from "@/lib/locale";

export interface TransactionRow {
  entry_reference: string;
  account_uid: string | null;
  booking_date: string | null;
  category: string | null;
  transaction_type: string | null;
  creditor_name: string | null;
  currency: string | null;
  amount: number | null;
  signed_amount_eur: number | null;
  credit_debit_indicator: string | null;
  created_at: string | null;
  worth_it: string | null;
  personal_amount: number | null;
  owed_by: string | null;
  flow_type: string | null;
  refund_of: string | null;
  /** The user's own words and labels. Only the dashboard writes them; the bank sync never does. */
  note: string | null;
  tags: Array<string>;
}

// A row in the Transfers list, which never shows notes or tags, so doesn't fetch them.
export type TransferRow = Omit<TransactionRow, "note" | "tags">;

// The euro columns of v_transactions_eur; `amount` and `personal_amount` are in the card's own currency.
export interface EurRow {
  personal_signed_amount_eur: number | null;
  signed_amount_eur: number | null;
}

// A transaction's identity is the pair: the same reference can occur in two accounts.
export type TxKey = Pick<TransactionRow, "account_uid" | "entry_reference">;

export const txId = (tx: TxKey): string => `${tx.account_uid ?? ""}|${tx.entry_reference}`;

export const isSameTx = (a: TxKey | undefined, b: TxKey): boolean => !!a && txId(a) === txId(b);

// Income rows have no merchant name when the bank sends none; never show a bare dash.
export const incomeTitle = (tx: Pick<TransactionRow, "creditor_name" | "category">): string =>
  tx.creditor_name?.trim() || tx.category?.trim() || "Unlabelled income";

// A card refund arrives without a merchant; name it after the charge it reverses so the
// pair reads as two linked entries.
export function nameRefunds(rows: Array<TransactionRow>): Array<TransactionRow> {
  const byRef = new Map(rows.map((r) => [r.entry_reference, r]));
  return rows.map((r) => {
    if (r.flow_type !== "refunded" || r.creditor_name || !r.refund_of) {
      // Only the credit names a charge it reverses; the charge itself isn't a refund.
      return r.flow_type === "refunded" && !r.creditor_name && r.refund_of
        ? { ...r, creditor_name: "Refund" }
        : r;
    }
    const original = byRef.get(r.refund_of)?.creditor_name;
    return { ...r, creditor_name: original ? `Refund: ${original}` : "Refund" };
  });
}

// My share of a Splitwise expense (view v_splitwise_eur), shown next to bank transactions.
export interface SplitwiseShare {
  id: string;
  booking_date: string;
  category: string | null;
  description: string;
  group_name: string;
  currency: string;
  amount: number;
  amount_eur: number;
}

const SHARE_PREFIX = "sw:";

export const isSplitwiseShare = (tx: Pick<TransactionRow, "entry_reference">): boolean =>
  tx.entry_reference.startsWith(SHARE_PREFIX);

export const shareId = (tx: Pick<TransactionRow, "entry_reference">): string =>
  tx.entry_reference.slice(SHARE_PREFIX.length);

export function shareToRow(s: SplitwiseShare): TransactionRow {
  return {
    entry_reference: `${SHARE_PREFIX}${s.id}`,
    account_uid: null,
    booking_date: s.booking_date,
    category: s.category,
    transaction_type: null,
    creditor_name: s.description,
    currency: s.currency,
    amount: s.amount,
    signed_amount_eur: -s.amount_eur,
    credit_debit_indicator: "DBIT",
    created_at: null,
    worth_it: null,
    personal_amount: null,
    owed_by: null,
    flow_type: "spend",
    refund_of: null,
    note: null,
    tags: [],
  };
}

/** Bank rows plus shares, newest first (rows on the same day keep their order). */
export function mergeShares(
  rows: Array<TransactionRow>,
  shares: Array<SplitwiseShare>,
): Array<TransactionRow> {
  if (shares.length === 0) return rows;
  return [...rows, ...shares.map(shareToRow)].sort((a, b) =>
    (b.booking_date ?? "").localeCompare(a.booking_date ?? ""),
  );
}

export interface AccountRow {
  uid: string;
  label: string | null;
  currency: string;
  bank_name?: string | null; // absent on a database without the column
  manual?: boolean; // transactions added by hand; absent before the backend migration
}

// Mirrors the allowlist in the backend's notify-worth-it.js — kept in sync by hand,
// the two repos don't share code.
const WORTH_IT_CATEGORIES = ["Shopping", "Entertainment", "Dine Out", "Experiences"];
const WORTH_IT_MIN_AMOUNT = 15;
const WORTH_IT_MIN_AGE_HOURS = 3;

export function isWorthItEligible(tx: TransactionRow): boolean {
  return (
    tx.credit_debit_indicator === "DBIT" &&
    tx.worth_it == null &&
    tx.category != null &&
    WORTH_IT_CATEGORIES.includes(tx.category) &&
    (tx.amount ?? 0) >= WORTH_IT_MIN_AMOUNT &&
    tx.created_at != null &&
    Date.now() - new Date(tx.created_at).getTime() >= WORTH_IT_MIN_AGE_HOURS * 3600_000
  );
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Deep-link filters for /transactions, e.g. from a Spending category row. */
export interface TransactionsSearch {
  /** A category name, or UNCATEGORIZED for rows without one. */
  category?: string;
  /** "YYYY-MM". */
  month?: string;
}

const MONTH_PARAM = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Keeps only well-formed params, so a hand-edited URL never breaks the page. */
export function parseTransactionsSearch(raw: Record<string, unknown>): TransactionsSearch {
  const out: TransactionsSearch = {};
  const category = raw["category"];
  if (typeof category === "string" && category.trim()) out.category = category.trim();
  const month = raw["month"];
  if (typeof month === "string" && MONTH_PARAM.test(month)) out.month = month;
  return out;
}

/** The "YYYY-MM" param for a month. */
export function monthParam(month: Date): string {
  return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
}

/** The month a "YYYY-MM" param names; the current month when absent or in the future. */
export function monthFromParam(param: string | undefined, now = new Date()): Date {
  const current = startOfMonth(now);
  const match = param ? MONTH_PARAM.exec(param) : null;
  if (!match) return current;
  const month = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return month > current ? current : month;
}

export function formatMoney(value: number, currency: string): string {
  try {
    return numberFormat({
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // A code Intl rejects ("", "EURO") stays as text instead of blanking the page.
    return `${numberFormat({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`.trim();
  }
}

export const formatEur = (value: number): string => formatMoney(value, "EUR");

/** A change in euros with its sign spelled out: "+€1.00", "−€1.00" (true minus). */
export const formatSignedEur = (value: number): string =>
  `${value >= 0 ? "+" : "−"}${formatEur(Math.abs(value))}`;

export const formatUsd = (value: number): string => formatMoney(value, "USD");

/** Amount without a currency symbol — the Currency column states it instead. */
export function formatAmountPlain(value: number): string {
  return numberFormat({
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "never",
  }).format(Math.abs(value));
}

/** "+€40.00" / "−€25.00": an explicit plus and a real minus, as in the transaction list. */
export const formatSignedMoney = (value: number, currency: string): string =>
  `${value >= 0 ? "+" : "−"}${formatMoney(Math.abs(value), currency)}`;

/** Signed amount in the transaction's own currency. */
export function nativeSignedAmount(tx: TransferRow): number | null {
  if (tx.amount == null) return null;
  // Without a EUR value yet (no exchange rate), debit/credit says which way the money went.
  const ind = tx.credit_debit_indicator;
  const fallback = ind === "DBIT" ? -1 : ind === "CRDT" ? 1 : tx.amount;
  const sign = (tx.signed_amount_eur ?? fallback) < 0 ? -1 : 1;
  return sign * Math.abs(tx.amount);
}

/** Where a transaction marked as a transfer goes back to: spending if money left, income otherwise. */
export const restoredFlow = (
  tx: Pick<TransactionRow, "credit_debit_indicator">,
): "spend" | "income" => (tx.credit_debit_indicator === "DBIT" ? "spend" : "income");

/** My share of a charge in euros, as a positive number: the split share if there is one. */
export const personalAmountEur = (
  tx: Pick<EurRow, "personal_signed_amount_eur" | "signed_amount_eur">,
): number => Math.abs(tx.personal_signed_amount_eur ?? tx.signed_amount_eur ?? 0);

/** "18 Oct", with the year only when it is not the current one. */
export function formatBookingDateShort(bookingDate: string | null, now: Date = new Date()): string {
  if (!bookingDate) return "—";
  const date = new Date(`${bookingDate}T00:00:00`);
  return date.toLocaleDateString(dateLocale(), {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

export function formatBookingDate(bookingDate: string | null): string {
  return bookingDate
    ? new Date(`${bookingDate}T00:00:00`).toLocaleDateString(dateLocale(), {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
}

export const UNCATEGORIZED = "__uncategorized__";

export function listCategories(transactions: Array<TransactionRow>) {
  const set = new Set<string>();
  let hasUncategorized = false;
  for (const tx of transactions) {
    if (tx.category) set.add(tx.category);
    else hasUncategorized = true;
  }
  return {
    list: Array.from(set).sort((a, b) => a.localeCompare(b)),
    hasUncategorized,
  };
}

export type TransactionFilters = {
  /** Bank name to keep, or "all". */
  bank?: string;
  /** Bank name of an account uid; needed only with a bank filter. */
  bankFor?: (accountUid: string | null) => string;
  /** YYYY-MM-DD to keep only that day, or "" for every day. */
  day?: string;
  /** Tag to keep, or "all". */
  tag?: string;
};

export function filterTransactions(
  transactions: Array<TransactionRow>,
  search: string,
  category: string,
  { bank = "all", bankFor, day = "", tag = "all" }: TransactionFilters = {},
): Array<TransactionRow> {
  const q = search.trim().toLowerCase();
  return transactions.filter((tx) => {
    if (category === UNCATEGORIZED && tx.category != null) return false;
    if (category !== "all" && category !== UNCATEGORIZED && tx.category !== category) return false;
    if (
      q &&
      !(tx.creditor_name ?? "").toLowerCase().includes(q) &&
      !(tx.note ?? "").toLowerCase().includes(q)
    )
      return false;
    if (tag !== "all" && !(tx.tags ?? []).some((t) => sameTag(t, tag))) return false;
    if (bank !== "all" && bankFor?.(tx.account_uid) !== bank) return false;
    if (day && tx.booking_date !== day) return false;
    return true;
  });
}

/** The selected rows among those shown, leaving out Splitwise shares (not transactions rows). */
export function selectedOnly(
  shown: Array<TransactionRow>,
  selected: ReadonlySet<string>,
): Array<TransactionRow> {
  return shown.filter((tx) => !isSplitwiseShare(tx) && selected.has(txId(tx)));
}

/** Queries to refresh after adding transactions: a new source is also a new account. */
export const ADDED_TRANSACTION_QUERIES = [
  "transactions",
  "transfers",
  "income",
  "spend-by-category",
  "category-transactions",
  "accounts",
] as const;
/** Rows in their given order, cut into runs that share a booking date (the phone list's day groups). */
export function groupByDay(
  rows: Array<TransactionRow>,
): Array<{ day: string | null; rows: Array<TransactionRow> }> {
  const groups: Array<{ day: string | null; rows: Array<TransactionRow> }> = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last && last.day === row.booking_date) last.rows.push(row);
    else groups.push({ day: row.booking_date, rows: [row] });
  }
  return groups;
}

/** A day group's heading: "Today", "Yesterday", else "Mon 9 Nov" (with the year when not this one). */
export function formatDayHeading(bookingDate: string | null, now: Date = new Date()): string {
  if (!bookingDate) return "No date";
  const date = new Date(`${bookingDate}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date
    .toLocaleDateString(dateLocale(), {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    })
    .replace(",", "");
}

/** How many of the sheet's filters (category, bank, day, tag) narrow the list; search is counted apart. */
export function activeFilterCount({
  category,
  bank,
  day,
  tag = "all",
}: {
  category: string;
  bank: string;
  day: string;
  tag?: string;
}): number {
  return [category !== "all", bank !== "all", day !== "", tag !== "all"].filter(Boolean).length;
}

/** True when an income row's category only repeats its title ("Income · Income"). */
export const categoryRepeatsTitle = (
  tx: Pick<TransactionRow, "creditor_name" | "category">,
): boolean =>
  !!tx.category?.trim() && incomeTitle(tx).toLowerCase() === tx.category.trim().toLowerCase();
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;
export const MAX_NOTE_LENGTH = 2000;

/** The first `max` characters (code points, like Postgres char_length): never half an emoji. */
const cutChars = (s: string, max: number): string => Array.from(s).slice(0, max).join("");

/** One tag as typed: composed (NFC), invisible format characters dropped, trimmed, inner spaces collapsed, cut to the length limit. */
export const cleanTag = (raw: string): string =>
  cutChars(
    raw
      .normalize("NFC")
      .replace(/\p{Cf}/gu, "")
      .trim()
      .replace(/\s+/g, " "),
    MAX_TAG_LENGTH,
  ).trim();

/** Tags to save: split at commas, cleaned, no blanks, no repeats (ignoring case, first spelling wins), at most 20. */
export function normalizeTags(raw: Array<string>): Array<string> {
  const seen = new Set<string>();
  const out: Array<string> = [];
  for (const t of raw.flatMap((r) => r.split(",")).map(cleanTag)) {
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.slice(0, MAX_TAGS);
}

/** Note to save: composed (NFC, so search finds "café" however it was typed), trimmed, null when empty. */
export function normalizeNote(raw: string): string | null {
  const note = cutChars(raw.normalize("NFC").trim(), MAX_NOTE_LENGTH).trim();
  return note === "" ? null : note;
}

/** Tags that differ only in case ("Trip", "trip") are one tag. */
export const sameTag = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** Tags used by these rows, once each ignoring case (first spelling seen), sorted, for the tag filter. */
export function listTags(transactions: Array<{ tags?: Array<string> | null }>): Array<string> {
  const byKey = new Map<string, string>();
  for (const tx of transactions)
    for (const t of tx.tags ?? []) if (!byKey.has(t.toLowerCase())) byKey.set(t.toLowerCase(), t);
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}
