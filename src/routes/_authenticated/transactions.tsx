import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Search,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getSupabase, isDemoRoute } from "@/integrations/supabase/client";
import { AccountBadge, CurrencyBadge } from "@/components/bank-badge";
import { formatISODate } from "@/lib/date";


export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — Finance Dashboard" },
      {
        name: "description",
        content:
          "Browse and search transactions month by month, newest first.",
      },
      { property: "og:title", content: "Transactions — Finance Dashboard" },
      {
        property: "og:description",
        content:
          "Browse and search transactions month by month, newest first.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransactionsPage,
});

interface TransactionRow {
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

// Mirrors the allowlist in the backend's notify-worth-it.js — kept in sync by hand,
// the two repos don't share code.
const WORTH_IT_CATEGORIES = ["Shopping", "Entertainment", "Dine Out", "Experiences"];
const WORTH_IT_MIN_AMOUNT = 15;
const WORTH_IT_MIN_AGE_HOURS = 3;

function isWorthItEligible(tx: TransactionRow): boolean {
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

interface AccountRow {
  uid: string;
  label: string | null;
  currency: string;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

async function fetchTransactionsForMonth(
  month: Date,
): Promise<Array<TransactionRow>> {
  const start = formatISODate(startOfMonth(month));
  const end = formatISODate(
    new Date(month.getFullYear(), month.getMonth() + 1, 1),
  );
  const { data, error } = await getSupabase()
    .from("v_transactions_eur")
    .select(
      "entry_reference,account_uid,booking_date,category,transaction_type,creditor_name,currency,amount,signed_amount_eur,credit_debit_indicator,created_at,worth_it,personal_amount,owed_by",
    )
    .gte("booking_date", start)
    .lt("booking_date", end)
    .eq("flow_type", "spend")
    .neq("amount", 0)
    .order("booking_date", { ascending: false })
    .order("entry_reference", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<TransactionRow>;
}

async function fetchAccounts(): Promise<Record<string, AccountRow>> {
  const { data, error } = await getSupabase()
    .from("accounts")
    .select("uid,label,currency");
  if (error) throw error;
  const map: Record<string, AccountRow> = {};
  for (const row of (data ?? []) as Array<AccountRow>) map[row.uid] = row;
  return map;
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Amount without a currency symbol — the Currency column states it instead. */
function formatAmountPlain(value: number): string {
  return new Intl.NumberFormat("en-IE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "never",
  }).format(Math.abs(value));
}

/** Signed amount in the transaction's own currency. */
function nativeSignedAmount(tx: TransactionRow): number | null {
  if (tx.amount == null) return null;
  const sign = (tx.signed_amount_eur ?? tx.amount) < 0 ? -1 : 1;
  return sign * Math.abs(tx.amount);
}

const CATEGORIES = [
  "Shopping",
  "Entertainment",
  "Groceries",
  "Dine Out",
  "Services",
  "Housing",
  "Transports",
  "Experiences",
  "Income",
  "Health",
  "Transfer",
  "Others",
] as const;

const UNCATEGORIZED = "__uncategorized__";

// Shared shape behind updateCategory/updateType/answerWorthIt: update one column
// on one transaction, with optimistic cache update + demo-mode guard + rollback.
function useTransactionFieldMutation<K extends "category" | "transaction_type" | "worth_it">(
  queryClient: ReturnType<typeof useQueryClient>,
  monthKey: string,
  column: K,
  opts: { errorMessage: string; successMessage?: (value: TransactionRow[K]) => string },
) {
  type Vars = { entryReference: string; value: TransactionRow[K] };
  type Context = { previous: Array<TransactionRow> | undefined };

  return useMutation<void, Error, Vars, Context>({
    mutationFn: async ({ entryReference, value }) => {
      if (isDemoRoute()) throw new Error("This is a read-only demo — sign up to make changes.");
      const { error } = await getSupabase()
        .from("transactions")
        .update({ [column]: value } as never)
        .eq("entry_reference", entryReference);
      if (error) throw error;
    },
    onMutate: async ({ entryReference, value }) => {
      await queryClient.cancelQueries({ queryKey: ["transactions", monthKey] });
      const previous = queryClient.getQueryData<Array<TransactionRow>>([
        "transactions",
        monthKey,
      ]);
      queryClient.setQueryData<Array<TransactionRow>>(
        ["transactions", monthKey],
        (old) =>
          old
            ? old.map((row) =>
                row.entry_reference === entryReference ? { ...row, [column]: value } : row,
              )
            : old,
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous)
        queryClient.setQueryData(["transactions", monthKey], context.previous);
      toast.error(opts.errorMessage, { description: error.message });
    },
    onSuccess: (_data, vars) => {
      if (opts.successMessage) toast.success(opts.successMessage(vars.value));
    },
  });
}

// Splitting updates personal_amount + owed_by together, so it's a separate
// mutation rather than another useTransactionFieldMutation call -- same
// optimistic-update/demo-guard/rollback shape either way.
function useSplitMutation(queryClient: ReturnType<typeof useQueryClient>, monthKey: string) {
  type Vars = { entryReference: string; personalAmount: number | null; owedBy: string | null };
  type Context = { previous: Array<TransactionRow> | undefined };

  return useMutation<void, Error, Vars, Context>({
    mutationFn: async ({ entryReference, personalAmount, owedBy }) => {
      if (isDemoRoute()) throw new Error("This is a read-only demo — sign up to make changes.");
      const { error } = await getSupabase()
        .from("transactions")
        .update({ personal_amount: personalAmount, owed_by: owedBy })
        .eq("entry_reference", entryReference);
      if (error) throw error;
    },
    onMutate: async ({ entryReference, personalAmount, owedBy }) => {
      await queryClient.cancelQueries({ queryKey: ["transactions", monthKey] });
      const previous = queryClient.getQueryData<Array<TransactionRow>>([
        "transactions",
        monthKey,
      ]);
      queryClient.setQueryData<Array<TransactionRow>>(
        ["transactions", monthKey],
        (old) =>
          old
            ? old.map((row) =>
                row.entry_reference === entryReference
                  ? { ...row, personal_amount: personalAmount, owed_by: owedBy }
                  : row,
              )
            : old,
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous)
        queryClient.setQueryData(["transactions", monthKey], context.previous);
      toast.error("Couldn't save split", { description: error.message });
    },
    onSuccess: () => toast.success("Split saved"),
  });
}

export function TransactionsPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const monthKey = useMemo(() => formatISODate(month), [month]);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const updateCategory = useTransactionFieldMutation(queryClient, monthKey, "category", {
    errorMessage: "Couldn't save category",
    successMessage: (value) => `Saved — ${value}`,
  });

  const updateType = useTransactionFieldMutation(queryClient, monthKey, "transaction_type", {
    errorMessage: "Couldn't save type",
    successMessage: (value) => `Saved — ${value}`,
  });

  const answerWorthIt = useTransactionFieldMutation(queryClient, monthKey, "worth_it", {
    errorMessage: "Couldn't save answer",
  });

  const updateSplit = useSplitMutation(queryClient, monthKey);

  const bulkUpdateCategory = useMutation({
    mutationFn: async ({
      entryReferences,
      category: next,
    }: {
      entryReferences: Array<string>;
      category: string;
    }) => {
      if (isDemoRoute()) throw new Error("This is a read-only demo — sign up to make changes.");
      const { error } = await getSupabase()
        .from("transactions")
        .update({ category: next })
        .in("entry_reference", entryReferences);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.setQueryData<Array<TransactionRow>>(
        ["transactions", monthKey],
        (old) =>
          old
            ? old.map((row) =>
                vars.entryReferences.includes(row.entry_reference)
                  ? { ...row, category: vars.category }
                  : row,
              )
            : old,
      );
      toast.success(
        `Set ${vars.entryReferences.length} transaction${vars.entryReferences.length === 1 ? "" : "s"} to ${vars.category}`,
      );
      setSelected(new Set());
    },
    onError: (error) => {
      toast.error("Couldn't update categories", {
        description: (error as Error).message,
      });
    },
  });

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
    staleTime: 5 * 60_000,
  });

  const txQuery = useQuery({
    queryKey: ["transactions", monthKey],
    queryFn: () => fetchTransactionsForMonth(month),
    staleTime: 60_000,
  });

  const transactions = txQuery.data ?? [];

  // Arrived via a "worth it?" push: force fresh data (the cache may be stale
  // from before this notification's transaction existed) and jump to it.
  const [highlightRef, setHighlightRef] = useState<string | null>(null);
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("highlight");
    if (!ref) return;
    setHighlightRef(ref);
    void queryClient.invalidateQueries({ queryKey: ["transactions", monthKey] });
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [spotlightTx, setSpotlightTx] = useState<TransactionRow | null>(null);

  useEffect(() => {
    if (!highlightRef || txQuery.isPending) return;
    const el = document.querySelector(`[data-entry-ref="${CSS.escape(highlightRef)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const tx = transactions.find((t) => t.entry_reference === highlightRef);
    if (tx && tx.worth_it == null) setSpotlightTx(tx);
    const timer = setTimeout(() => setHighlightRef(null), 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightRef, txQuery.isPending, transactions]);

  const categories = useMemo(() => {
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
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (category === UNCATEGORIZED && tx.category != null) return false;
      if (
        category !== "all" &&
        category !== UNCATEGORIZED &&
        tx.category !== category
      )
        return false;
      if (q && !(tx.creditor_name ?? "").toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [transactions, search, category]);

  const accounts = accountsQuery.data ?? {};

  const filteredRefs = useMemo(
    () => filtered.map((tx) => tx.entry_reference),
    [filtered],
  );
  const allFilteredSelected =
    filteredRefs.length > 0 && filteredRefs.every((ref) => selected.has(ref));

  function toggleOne(entryReference: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entryReference)) next.delete(entryReference);
      else next.add(entryReference);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        for (const ref of filteredRefs) next.delete(ref);
        return next;
      }
      return new Set([...prev, ...filteredRefs]);
    });
  }

  function goToMonth(next: Date) {
    setSelected(new Set());
    setMonth(next);
  }

  const monthLabel = month.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const currentMonthStart = startOfMonth(new Date());
  const canGoNext = month < currentMonthStart;

  function goToPrevMonth() {
    goToMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  }

  function goToNextMonth() {
    if (!canGoNext) return;
    goToMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <Dialog
        open={spotlightTx != null}
        onOpenChange={(open) => {
          if (!open) setSpotlightTx(null);
        }}
      >
        {spotlightTx && (
          <DialogContent className="max-w-sm text-center">
            <DialogHeader>
              <DialogTitle className="text-center text-xl">Worth it?</DialogTitle>
              <DialogDescription className="text-center">
                {spotlightTx.creditor_name ?? "A purchase"} · {spotlightTx.category}
              </DialogDescription>
            </DialogHeader>
            <p className="font-figure py-4 text-4xl font-semibold text-foreground">
              {formatMoney(Math.abs(spotlightTx.amount ?? 0), spotlightTx.currency ?? "EUR")}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  answerWorthIt.mutate({
                    entryReference: spotlightTx.entry_reference,
                    value: "no",
                  });
                  setSpotlightTx(null);
                }}
                className="min-h-11 flex-1 rounded-lg border border-negative/30 bg-negative/10 text-sm font-semibold text-negative transition-colors hover:bg-negative/20"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  answerWorthIt.mutate({
                    entryReference: spotlightTx.entry_reference,
                    value: "yes",
                  });
                  setSpotlightTx(null);
                }}
                className="min-h-11 flex-1 rounded-lg border border-positive/30 bg-positive/10 text-sm font-semibold text-positive transition-colors hover:bg-positive/20"
              >
                Yes
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Transactions
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Every transaction for the selected month, newest first.
        </p>
      </header>

      {txQuery.isError && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load transactions: {txQuery.error.message}
        </div>
      )}

      {/* Month selector */}
      <div className="mb-4 flex items-center justify-between rounded-xl border bg-card p-2 card-ring">
        <button
          type="button"
          onClick={goToPrevMonth}
          aria-label="Previous month"
          className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="text-sm font-medium text-foreground">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={goToNextMonth}
          disabled={!canGoNext}
          aria-label="Next month"
          className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by merchant…"
            aria-label="Search by merchant"
            className="h-10 w-full rounded-lg border bg-card pr-3 pl-9 text-base text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
          className="h-10 rounded-lg border bg-card px-3 text-base text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
        >
          <option value="all">All categories</option>
          {categories.hasUncategorized && (
            <option value={UNCATEGORIZED}>Uncategorized</option>
          )}
          {categories.list.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 card-ring">
          <span className="text-sm font-medium text-foreground">
            {selected.size} selected
          </span>
          <BulkCategoryPicker
            onSelect={(next) =>
              bulkUpdateCategory.mutate({
                entryReferences: Array.from(selected),
                category: next,
              })
            }
            disabled={bulkUpdateCategory.isPending}
          />
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      {/* Register — cards on mobile, table from md up */}
      <section className="overflow-hidden rounded-2xl border bg-card card-ring">
        {txQuery.isPending ? (
          <div className="space-y-3 p-4 md:hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground md:hidden">
            {transactions.length === 0
              ? `No transactions for ${monthLabel}.`
              : "No transactions match your filters."}
          </div>
        ) : (
          <ul className="divide-y md:hidden">
            {filtered.map((tx) => (
              <TransactionCardView
                key={tx.entry_reference}
                tx={tx}
                selected={selected.has(tx.entry_reference)}
                onToggleSelect={() => toggleOne(tx.entry_reference)}
                savingCategory={
                  updateCategory.isPending &&
                  updateCategory.variables?.entryReference === tx.entry_reference
                }
                onSelectCategory={(next) =>
                  updateCategory.mutate({
                    entryReference: tx.entry_reference,
                    value: next,
                  })
                }
                savingType={
                  updateType.isPending &&
                  updateType.variables?.entryReference === tx.entry_reference
                }
                onSelectType={(next) =>
                  updateType.mutate({
                    entryReference: tx.entry_reference,
                    value: next,
                  })
                }
                accountLabel={
                  tx.account_uid
                    ? (accounts[tx.account_uid]?.label ?? "Unknown account")
                    : "—"
                }
                onAnswerWorthIt={(worthIt) =>
                  answerWorthIt.mutate({ entryReference: tx.entry_reference, value: worthIt })
                }
                savingSplit={
                  updateSplit.isPending &&
                  updateSplit.variables?.entryReference === tx.entry_reference
                }
                onSaveSplit={(personalAmount, owedBy) =>
                  updateSplit.mutate({
                    entryReference: tx.entry_reference,
                    personalAmount,
                    owedBy,
                  })
                }
                highlighted={tx.entry_reference === highlightRef}
              />
            ))}
          </ul>
        )}

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="w-10 px-4 py-3">
                  <label className="-m-3.5 inline-flex size-11 cursor-pointer items-center justify-center p-3.5">
                    <input
                      type="checkbox"
                      aria-label="Select all filtered transactions"
                      checked={allFilteredSelected}
                      onChange={toggleAllFiltered}
                      className="size-4 rounded border-border accent-primary"
                    />
                  </label>
                </th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Merchant</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Split</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Currency</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {txQuery.isPending ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td colSpan={9} className="px-4 py-3">
                      <div className="h-5 animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    {transactions.length === 0
                      ? `No transactions for ${monthLabel}.`
                      : "No transactions match your filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => (
                  <TransactionRowView
                    key={tx.entry_reference}
                    tx={tx}
                    selected={selected.has(tx.entry_reference)}
                    onToggleSelect={() => toggleOne(tx.entry_reference)}
                    savingCategory={
                      updateCategory.isPending &&
                      updateCategory.variables?.entryReference ===
                        tx.entry_reference
                    }
                    onSelectCategory={(next) =>
                      updateCategory.mutate({
                        entryReference: tx.entry_reference,
                        value: next,
                      })
                    }
                    savingType={
                      updateType.isPending &&
                      updateType.variables?.entryReference ===
                        tx.entry_reference
                    }
                    onSelectType={(next) =>
                      updateType.mutate({
                        entryReference: tx.entry_reference,
                        value: next,
                      })
                    }
                    accountLabel={
                      tx.account_uid
                        ? (accounts[tx.account_uid]?.label ?? "Unknown account")
                        : "—"
                    }
                    onAnswerWorthIt={(worthIt) =>
                      answerWorthIt.mutate({ entryReference: tx.entry_reference, value: worthIt })
                    }
                    savingSplit={
                      updateSplit.isPending &&
                      updateSplit.variables?.entryReference === tx.entry_reference
                    }
                    onSaveSplit={(personalAmount, owedBy) =>
                      updateSplit.mutate({
                        entryReference: tx.entry_reference,
                        personalAmount,
                        owedBy,
                      })
                    }
                    highlighted={tx.entry_reference === highlightRef}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}

function CategoryPicker({
  tx,
  onSelect,
  saving,
}: {
  tx: TransactionRow;
  onSelect: (category: string) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Change category for ${tx.creditor_name ?? "transaction"}`}
          disabled={saving}
          className="-m-2 inline-flex min-h-11 cursor-pointer items-center p-2 disabled:opacity-60"
        >
          {tx.category ? (
            <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20">
              {tx.category}
            </span>
          ) : (
            <span className="inline-flex rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent">
              Uncategorized
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        <div className="max-h-72 overflow-y-auto">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setOpen(false);
                if (c !== tx.category) onSelect(c);
              }}
              className={`block min-h-11 w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                c === tx.category
                  ? "font-medium text-primary"
                  : "text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BulkCategoryPicker({
  onSelect,
  disabled,
}: {
  onSelect: (category: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
        >
          {disabled ? "Saving…" : "Set category…"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        <div className="max-h-72 overflow-y-auto">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setOpen(false);
                onSelect(c);
              }}
              className="block min-h-11 w-full rounded-md px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent"
            >
              {c}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const TYPES = ["Subscription", "One-time"] as const;

function TypePicker({
  tx,
  onSelect,
  saving,
}: {
  tx: TransactionRow;
  onSelect: (type: string) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Change type for ${tx.creditor_name ?? "transaction"}`}
          disabled={saving}
          className="-m-2 inline-flex min-h-11 cursor-pointer items-center p-2 disabled:opacity-60"
        >
          {tx.transaction_type ? (
            <span className="inline-flex rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent">
              {tx.transaction_type}
            </span>
          ) : (
            <span className="inline-flex rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent">
              —
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        <div className="max-h-72 overflow-y-auto">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setOpen(false);
                if (t !== tx.transaction_type) onSelect(t);
              }}
              className={`block min-h-11 w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                t === tx.transaction_type
                  ? "font-medium text-primary"
                  : "text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Lets you record that only part of a transaction was actually yours (e.g.
// you fronted a group flight booking) -- personal_amount is what counts
// toward your spend analytics, the rest shows on the Owed dashboard as a
// receivable from whoever owed_by names.
function SplitEditor({
  tx,
  onSave,
  saving,
}: {
  tx: TransactionRow;
  onSave: (personalAmount: number | null, owedBy: string | null) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const fullAmount = Math.abs(tx.amount ?? 0);
  const [shareInput, setShareInput] = useState(() =>
    String(tx.personal_amount ?? fullAmount),
  );
  const [owedByInput, setOwedByInput] = useState(tx.owed_by ?? "");

  const isSplit = tx.personal_amount != null && tx.personal_amount < fullAmount;
  const owed = isSplit ? fullAmount - (tx.personal_amount as number) : 0;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setShareInput(String(tx.personal_amount ?? fullAmount));
          setOwedByInput(tx.owed_by ?? "");
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Split ${tx.creditor_name ?? "transaction"}`}
          disabled={saving}
          className="-m-2 inline-flex min-h-11 cursor-pointer items-center p-2 disabled:opacity-60"
        >
          {isSplit ? (
            <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20">
              Split · owed {formatMoney(owed, tx.currency ?? "EUR")}
            </span>
          ) : (
            <span className="inline-flex rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent">
              Split…
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2.5 p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Your share ({tx.currency ?? "EUR"}, full amount {formatAmountPlain(fullAmount)})
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max={fullAmount}
            value={shareInput}
            onChange={(e) => setShareInput(e.target.value)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Owed by (optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Anna, Luca"
            value={owedByInput}
            onChange={(e) => setOwedByInput(e.target.value)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
          />
        </div>
        <div className="flex gap-2 pt-1">
          {isSplit && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSave(null, null);
              }}
              className="min-h-9 flex-1 rounded-lg border px-3 text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const parsed = Number(shareInput);
              if (!Number.isFinite(parsed) || parsed < 0 || parsed > fullAmount) return;
              setOpen(false);
              // Full amount = same as unset, keeps the "NULL means whole
              // thing is mine" convention the schema/views rely on.
              onSave(
                parsed === fullAmount ? null : parsed,
                parsed === fullAmount ? null : owedByInput.trim() || null,
              );
            }}
            className="min-h-9 flex-1 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Save
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function WorthItPrompt({
  tx,
  onAnswer,
}: {
  tx: TransactionRow;
  onAnswer: (worthIt: "yes" | "no") => void;
}) {
  if (tx.worth_it) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        {tx.worth_it === "yes" ? (
          <ThumbsUp className="size-3 text-positive" />
        ) : (
          <ThumbsDown className="size-3 text-negative" />
        )}
        {tx.worth_it === "yes" ? "Worth it" : "Not worth it"}
      </span>
    );
  }
  if (!isWorthItEligible(tx)) return null;
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      Worth it?
      <button
        type="button"
        onClick={() => onAnswer("yes")}
        className="min-h-11 rounded-md px-2 py-1 font-medium text-positive transition-colors hover:bg-positive/10"
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => onAnswer("no")}
        className="min-h-11 rounded-md px-2 py-1 font-medium text-negative transition-colors hover:bg-negative/10"
      >
        No
      </button>
    </span>
  );
}

function TransactionRowView({
  tx,
  accountLabel,
  onSelectCategory,
  savingCategory,
  onSelectType,
  savingType,
  selected,
  onToggleSelect,
  onAnswerWorthIt,
  savingSplit,
  onSaveSplit,
  highlighted,
}: {
  tx: TransactionRow;
  accountLabel: string;
  onSelectCategory: (category: string) => void;
  savingCategory: boolean;
  onSelectType: (type: string) => void;
  savingType: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onAnswerWorthIt: (worthIt: "yes" | "no") => void;
  savingSplit: boolean;
  onSaveSplit: (personalAmount: number | null, owedBy: string | null) => void;
  highlighted?: boolean;
}) {
  const native = nativeSignedAmount(tx);
  const currency = tx.currency ?? "EUR";
  const positive = (native ?? 0) >= 0;
  const eur = tx.signed_amount_eur;
  const showEur = currency !== "EUR" && eur != null;

  return (
    <tr
      data-entry-ref={tx.entry_reference}
      className={`border-b transition-colors last:border-0 hover:bg-accent/40 ${selected ? "bg-primary/5" : ""} ${highlighted ? "ring-2 ring-inset ring-primary" : ""}`}
    >
      <td className="px-4 py-3">
        <label className="-m-3.5 inline-flex size-11 cursor-pointer items-center justify-center p-3.5">
          <input
            type="checkbox"
            aria-label={`Select ${tx.creditor_name ?? "transaction"}`}
            checked={selected}
            onChange={onToggleSelect}
            className="size-4 rounded border-border accent-primary"
          />
        </label>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
        {tx.booking_date
          ? new Date(`${tx.booking_date}T00:00:00`).toLocaleDateString(
              "en-GB",
              { day: "numeric", month: "short", year: "numeric" },
            )
          : "—"}
      </td>
      <td className="max-w-48 px-4 py-3">
        <div className="truncate font-medium text-foreground">
          {tx.creditor_name ?? "—"}
        </div>
        <WorthItPrompt tx={tx} onAnswer={onAnswerWorthIt} />
      </td>
      <td className="px-4 py-3">
        <CategoryPicker tx={tx} onSelect={onSelectCategory} saving={savingCategory} />
      </td>
      <td className="px-4 py-3">
        <TypePicker tx={tx} onSelect={onSelectType} saving={savingType} />
      </td>
      <td className="px-4 py-3">
        <SplitEditor tx={tx} onSave={onSaveSplit} saving={savingSplit} />
      </td>
      <td className="px-4 py-3">
        <AccountBadge label={accountLabel} />
      </td>
      <td className="px-4 py-3">
        <CurrencyBadge currency={currency} />
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {native == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span
            className={`inline-flex items-center justify-end gap-1 font-figure font-medium ${
              positive ? "text-positive" : "text-negative"
            }`}
          >
            {positive ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownLeft className="size-3.5" />
            )}
            {formatAmountPlain(native)}
            {showEur && (
              <span className="ml-0.5 text-sm opacity-80">
                ({formatMoney(eur as number, "EUR")})
              </span>
            )}
          </span>
        )}
      </td>
    </tr>
  );
}

function TransactionCardView({
  tx,
  accountLabel,
  onSelectCategory,
  savingCategory,
  onSelectType,
  savingType,
  selected,
  onToggleSelect,
  onAnswerWorthIt,
  savingSplit,
  onSaveSplit,
  highlighted,
}: {
  tx: TransactionRow;
  accountLabel: string;
  onSelectCategory: (category: string) => void;
  savingCategory: boolean;
  onSelectType: (type: string) => void;
  savingType: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onAnswerWorthIt: (worthIt: "yes" | "no") => void;
  savingSplit: boolean;
  onSaveSplit: (personalAmount: number | null, owedBy: string | null) => void;
  highlighted?: boolean;
}) {
  const native = nativeSignedAmount(tx);
  const currency = tx.currency ?? "EUR";
  const positive = (native ?? 0) >= 0;
  const eur = tx.signed_amount_eur;
  const showEur = currency !== "EUR" && eur != null;

  return (
    <li
      data-entry-ref={tx.entry_reference}
      className={`px-4 py-3 ${selected ? "bg-primary/5" : ""} ${highlighted ? "ring-2 ring-inset ring-primary" : ""}`}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <label className="-m-3.5 -mt-3 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center p-3.5">
          <input
            type="checkbox"
            aria-label={`Select ${tx.creditor_name ?? "transaction"}`}
            checked={selected}
            onChange={onToggleSelect}
            className="size-4 rounded border-border accent-primary"
          />
        </label>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {tx.creditor_name ?? "—"}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            {tx.booking_date
              ? new Date(`${tx.booking_date}T00:00:00`).toLocaleDateString(
                  "en-GB",
                  { day: "numeric", month: "short", year: "numeric" },
                )
              : "—"}
            <AccountBadge label={accountLabel} />
          </p>
          <div className="mt-0.5">
            <WorthItPrompt tx={tx} onAnswer={onAnswerWorthIt} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          {native == null ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            <>
              <div
                className={`inline-flex items-center justify-end gap-1 font-figure text-sm font-medium ${
                  positive ? "text-positive" : "text-negative"
                }`}
              >
                {positive ? (
                  <ArrowUpRight className="size-3.5" />
                ) : (
                  <ArrowDownLeft className="size-3.5" />
                )}
                {formatAmountPlain(native)}
              </div>
              {showEur && (
                <div className="font-figure text-xs text-muted-foreground">
                  {formatMoney(eur as number, "EUR")}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <CategoryPicker tx={tx} onSelect={onSelectCategory} saving={savingCategory} />
        <TypePicker tx={tx} onSelect={onSelectType} saving={savingType} />
        <SplitEditor tx={tx} onSave={onSaveSplit} saving={savingSplit} />
        <CurrencyBadge currency={currency} />
      </div>
    </li>
  );
}
