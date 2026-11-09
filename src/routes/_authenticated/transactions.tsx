import { fetchSplitContacts } from "@/lib/splits";
import { EmptyState } from "@/components/empty-state";
import { createFileRoute } from "@tanstack/react-router";
import { accountName, bankOf } from "@/components/bank-badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatISODate } from "@/lib/date";
import {
  UNCATEGORIZED,
  filterTransactions,
  selectedOnly,
  isSplitwiseShare,
  shareId,
  listCategories,
  mergeShares,
  nameRefunds,
  startOfMonth,
  type AccountRow,
  type SplitwiseShare,
  type TransactionRow,
  isSameTx,
  txId,
} from "@/lib/transactions";
import { BulkCategoryPicker } from "@/components/transactions/pickers";
import { TransfersSection } from "@/components/transactions/transfers-section";
import { AddTransaction } from "@/components/transactions/add-transaction";
import { ImportStatement } from "@/components/transactions/import-statement";
import {
  useBulkCategoryMutation,
  useDeleteMutation,
  useFlowMutation,
  useManualAmountMutation,
  useRenameMerchantMutation,
  useShareMutation,
  useSplitMutation,
  useTransactionFieldMutation,
} from "@/components/transactions/mutations";
import {
  TransactionCardView,
  TransactionRowView,
  type TransactionViewProps,
} from "@/components/transactions/transaction-views";
import { WorthItSpotlight } from "@/components/transactions/worth-it";
import { MonthSwitcher } from "@/components/month-switcher";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — Alopex" },
      {
        name: "description",
        content: "Browse and search transactions month by month, newest first.",
      },
      { property: "og:title", content: "Transactions — Alopex" },
      {
        property: "og:description",
        content: "Browse and search transactions month by month, newest first.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransactionsPage,
});

async function fetchTransactionsForMonth(month: Date): Promise<Array<TransactionRow>> {
  const start = formatISODate(startOfMonth(month));
  const end = formatISODate(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const { data, error } = await supabase
    .from("v_transactions_eur")
    .select(
      "entry_reference,account_uid,booking_date,category,transaction_type,creditor_name,currency,amount,signed_amount_eur,credit_debit_indicator,created_at,worth_it,personal_amount,owed_by,flow_type,refund_of",
    )
    .gte("booking_date", start)
    .lt("booking_date", end)
    .in("flow_type", ["spend", "refunded"])
    .neq("amount", 0)
    .order("booking_date", { ascending: false })
    .order("entry_reference", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<TransactionRow>;
}

// Transfers are left out of spending and income; they are listed on request so a wrong one can be moved back.
async function fetchTransfersForMonth(month: Date): Promise<Array<TransactionRow>> {
  const start = formatISODate(startOfMonth(month));
  const end = formatISODate(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const { data, error } = await supabase
    .from("v_transactions_eur")
    .select(
      "entry_reference,account_uid,booking_date,category,transaction_type,creditor_name,currency,amount,signed_amount_eur,credit_debit_indicator,created_at,worth_it,personal_amount,owed_by,flow_type,refund_of",
    )
    .gte("booking_date", start)
    .lt("booking_date", end)
    .eq("flow_type", "transfer")
    .neq("amount", 0)
    .order("booking_date", { ascending: false })
    .order("entry_reference", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<TransactionRow>;
}

// My share of Splitwise expenses in the month (shares already paid by card are bank rows).
async function fetchSharesForMonth(month: Date): Promise<Array<SplitwiseShare>> {
  const start = formatISODate(startOfMonth(month));
  const end = formatISODate(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const { data, error } = await supabase
    .from("v_splitwise_eur")
    .select("id,booking_date,category,description,group_name,currency,amount,amount_eur")
    .gte("booking_date", start)
    .lt("booking_date", end);
  if (error) throw error;
  return (data ?? []) as Array<SplitwiseShare>;
}

async function fetchAccounts(): Promise<Record<string, AccountRow>> {
  const { data, error } = await supabase.from("accounts").select("*");
  if (error) throw error;
  const map: Record<string, AccountRow> = {};
  for (const row of (data ?? []) as Array<AccountRow>) map[row.uid] = row;
  return map;
}

function TransactionsPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [bank, setBank] = useState<string>("all");
  const [day, setDay] = useState("");
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

  const renameTx = useRenameMerchantMutation(queryClient);

  const updateSplit = useSplitMutation(queryClient, monthKey);

  const updateShare = useShareMutation(queryClient, monthKey);

  const restoreTransfer = useFlowMutation(queryClient, monthKey);
  const changeAmount = useManualAmountMutation(queryClient);
  const [showTransfers, setShowTransfers] = useState(false);

  const bulkUpdateCategory = useBulkCategoryMutation(queryClient, monthKey, () =>
    setSelected(new Set()),
  );

  const deleteTxs = useDeleteMutation(queryClient, () => setSelected(new Set()));

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

  const transfersQuery = useQuery({
    queryKey: ["transfers", monthKey],
    queryFn: () => fetchTransfersForMonth(month),
    staleTime: 60_000,
  });
  const transfers = transfersQuery.data ?? [];

  const contactsQuery = useQuery({
    queryKey: ["split-contacts"],
    queryFn: fetchSplitContacts,
    staleTime: 5 * 60_000,
  });

  const sharesQuery = useQuery({
    queryKey: ["splitwise-shares", monthKey],
    queryFn: () => fetchSharesForMonth(month),
    staleTime: 60_000,
  });

  const extraError = [sharesQuery, accountsQuery, transfersQuery].find((q) => q.isError)?.error;

  const transactions = useMemo(
    () => mergeShares(nameRefunds(txQuery.data ?? []), sharesQuery.data ?? []),
    [txQuery.data, sharesQuery.data],
  );

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
  }, [highlightRef, txQuery.isPending, transactions]);

  const categories = useMemo(() => listCategories(transactions), [transactions]);

  const accounts = useMemo(() => accountsQuery.data ?? {}, [accountsQuery.data]);
  const bankFor = useCallback(
    (uid: string | null) => {
      const account = uid ? accounts[uid] : undefined;
      return account ? bankOf(account) : "—";
    },
    [accounts],
  );
  // Only banks that appear this month, so every option matches something.
  const banks = useMemo(
    () =>
      [...new Set(transactions.filter((tx) => tx.account_uid).map((tx) => bankFor(tx.account_uid)))]
        .filter((b) => b !== "—")
        .sort(),
    [transactions, bankFor],
  );

  const filtered = useMemo(
    () => filterTransactions(transactions, search, category, { bank, bankFor, day }),
    [transactions, search, category, bank, bankFor, day],
  );

  // Shares cannot be bulk edited or deleted: they are not rows of the transactions table.
  const filteredIds = useMemo(
    () => filtered.filter((tx) => !isSplitwiseShare(tx)).map(txId),
    [filtered],
  );
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  // Bulk actions touch only rows you can see: a row selected before a filter hid it stays out.
  const selectedVisible = useMemo(() => selectedOnly(filtered, selected), [filtered, selected]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        for (const id of filteredIds) next.delete(id);
        return next;
      }
      return new Set([...prev, ...filteredIds]);
    });
  }

  function goToMonth(next: Date) {
    setSelected(new Set());
    setDay(""); // a day belongs to one month
    setMonth(next);
  }

  const savingShare = (tx: TransactionRow) =>
    updateShare.isPending && updateShare.variables?.id === shareId(tx);

  const labelFor = (uid: string | null) => {
    if (!uid) return "—";
    const account = accounts[uid];
    return account ? accountName(account) : "Unknown account";
  };
  const viewProps = (tx: TransactionRow): TransactionViewProps => ({
    tx,
    selected: selected.has(txId(tx)),
    onToggleSelect: () => toggleOne(txId(tx)),
    savingCategory: isSplitwiseShare(tx)
      ? savingShare(tx)
      : updateCategory.isPending && isSameTx(updateCategory.variables?.tx, tx),
    onSelectCategory: (next) =>
      isSplitwiseShare(tx)
        ? updateShare.mutate({ id: shareId(tx), patch: { category: next } })
        : updateCategory.mutate({ tx, value: next }),
    savingType: updateType.isPending && isSameTx(updateType.variables?.tx, tx),
    onSelectType: (next) => updateType.mutate({ tx, value: next }),
    accountLabel: labelFor(tx.account_uid),
    onAnswerWorthIt: (worthIt) => answerWorthIt.mutate({ tx, value: worthIt }),
    savingSplit: updateSplit.isPending && isSameTx(updateSplit.variables?.tx, tx),
    onSaveSplit: (personalAmount, owedBy) => updateSplit.mutate({ tx, personalAmount, owedBy }),
    splitContacts: contactsQuery.data ?? [],
    savingRename: isSplitwiseShare(tx)
      ? savingShare(tx)
      : renameTx.isPending && isSameTx(renameTx.variables?.tx, tx),
    onRename: (name) =>
      isSplitwiseShare(tx)
        ? name && updateShare.mutate({ id: shareId(tx), patch: { description: name } })
        : renameTx.mutate({ tx, name }),
    highlighted: tx.entry_reference === highlightRef,
    ...(tx.account_uid && accounts[tx.account_uid]?.manual
      ? {
          onSaveAmount: (amount: number) => changeAmount.mutate({ tx, amount }),
          savingAmount: changeAmount.isPending && isSameTx(changeAmount.variables?.tx, tx),
        }
      : {}),
  });

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
      <WorthItSpotlight
        tx={spotlightTx}
        onAnswer={(tx, value) => answerWorthIt.mutate({ tx, value })}
        onClose={() => setSpotlightTx(null)}
      />

      <header className="mb-8 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="ios-large-title">Transactions</h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <ImportStatement />
          <AddTransaction today={formatISODate(new Date())} />
        </div>
      </header>

      {txQuery.isError && (
        <Alert className="mb-6">Couldn't load transactions: {txQuery.error.message}</Alert>
      )}

      {extraError && <Alert className="mb-6">List may be incomplete: {extraError.message}</Alert>}

      <MonthSwitcher
        className="mb-4"
        label={monthLabel}
        onPrev={goToPrevMonth}
        onNext={goToNextMonth}
        canGoNext={canGoNext}
      />

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            onGround
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label="Search by merchant"
            className="pr-4 pl-10"
          />
        </div>
        <Select
          onGround
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
          className="w-auto px-4"
        >
          <option value="all">All categories</option>
          {categories.hasUncategorized && <option value={UNCATEGORIZED}>Uncategorized</option>}
          {categories.list.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        {banks.length > 1 && (
          <Select
            onGround
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            aria-label="Filter by bank"
            className="w-auto px-4"
          >
            <option value="all">All banks</option>
            {banks.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        )}
        <Input
          onGround
          type="date"
          value={day}
          min={formatISODate(month)}
          max={formatISODate(new Date(month.getFullYear(), month.getMonth() + 1, 0))}
          onChange={(e) => setDay(e.target.value)}
          aria-label="Filter by day"
          className="w-auto px-4"
        />
      </div>

      {/* Bulk action bar */}
      {selectedVisible.length > 0 && (
        <div className="sticky top-[calc(2.75rem+env(safe-area-inset-top)+0.5rem)] z-20 mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-card p-3 shadow-[0_8px_24px_-12px_oklch(0_0_0/0.25)] md:top-4">
          <span className="text-sm font-medium text-foreground">
            {selectedVisible.length} selected
          </span>
          <BulkCategoryPicker
            onSelect={(next) =>
              bulkUpdateCategory.mutate({
                txs: selectedVisible,
                category: next,
              })
            }
            disabled={bulkUpdateCategory.isPending}
          />
          <Button
            variant="destructive"
            size="md"
            onClick={() =>
              deleteTxs.mutate({
                txs: selectedVisible,
                deleted: true,
              })
            }
            disabled={deleteTxs.isPending}
            className="gap-1.5 px-3"
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
          <Button variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto px-3">
            Clear
          </Button>
        </div>
      )}

      {/* Register — cards on mobile, table from md up */}
      <section className="overflow-hidden rounded-lg bg-card">
        {txQuery.isPending ? (
          <div className="space-y-3 p-4 md:hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : txQuery.isError ? null : filtered.length === 0 ? (
          <EmptyState
            className="md:hidden"
            title={
              transactions.length === 0
                ? `No transactions for ${monthLabel}.`
                : "No transactions match your filters."
            }
          />
        ) : (
          <ul className="divide-y md:hidden">
            {filtered.map((tx) => (
              <TransactionCardView key={txId(tx)} {...viewProps(tx)} />
            ))}
          </ul>
        )}

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
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
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="w-12 px-2 py-3">
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {txQuery.isPending ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td colSpan={5} className="px-4 py-3">
                      <Skeleton className="h-5" />
                    </td>
                  </tr>
                ))
              ) : txQuery.isError ? null : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      title={
                        transactions.length === 0
                          ? `No transactions for ${monthLabel}.`
                          : "No transactions match your filters."
                      }
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => <TransactionRowView key={txId(tx)} {...viewProps(tx)} />)
              )}
            </tbody>
          </table>
        </div>
      </section>

      {transfers.length > 0 && (
        <Button
          variant="quiet"
          size="sm"
          onClick={() => setShowTransfers((v) => !v)}
          className="mt-4 px-4"
        >
          {showTransfers ? "Hide" : "Show"} {transfers.length} transfer
          {transfers.length === 1 ? "" : "s"}
        </Button>
      )}
      {showTransfers && transfers.length > 0 && (
        <TransfersSection
          rows={transfers}
          savingId={restoreTransfer.isPending ? txId(restoreTransfer.variables.tx) : undefined}
          onRestore={(tx) => restoreTransfer.mutate({ tx })}
        />
      )}
    </div>
  );
}
