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
}

// A transaction's identity is the pair: the same reference can occur in two accounts.
export type TxKey = Pick<TransactionRow, "account_uid" | "entry_reference">;

export const txId = (tx: TxKey): string => `${tx.account_uid ?? ""}|${tx.entry_reference}`;

export const isSameTx = (a: TxKey | undefined, b: TxKey): boolean => !!a && txId(a) === txId(b);

// Income rows have no merchant name when the bank sends none; never show a bare dash.
export const incomeTitle = (tx: Pick<TransactionRow, "creditor_name" | "category">): string =>
  tx.creditor_name?.trim() || tx.category?.trim() || "Unlabelled income";

export interface AccountRow {
  uid: string;
  label: string | null;
  currency: string;
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

export function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Amount without a currency symbol — the Currency column states it instead. */
export function formatAmountPlain(value: number): string {
  return new Intl.NumberFormat("en-IE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "never",
  }).format(Math.abs(value));
}

/** Signed amount in the transaction's own currency. */
export function nativeSignedAmount(tx: TransactionRow): number | null {
  if (tx.amount == null) return null;
  const sign = (tx.signed_amount_eur ?? tx.amount) < 0 ? -1 : 1;
  return sign * Math.abs(tx.amount);
}

export function formatBookingDate(bookingDate: string | null): string {
  return bookingDate
    ? new Date(`${bookingDate}T00:00:00`).toLocaleDateString("en-GB", {
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

export function filterTransactions(
  transactions: Array<TransactionRow>,
  search: string,
  category: string,
): Array<TransactionRow> {
  const q = search.trim().toLowerCase();
  return transactions.filter((tx) => {
    if (category === UNCATEGORIZED && tx.category != null) return false;
    if (category !== "all" && category !== UNCATEGORIZED && tx.category !== category) return false;
    if (q && !(tx.creditor_name ?? "").toLowerCase().includes(q)) return false;
    return true;
  });
}
