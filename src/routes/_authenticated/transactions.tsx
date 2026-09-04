import { createFileRoute } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getSupabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — Finance Dashboard" },
      {
        name: "description",
        content:
          "Browse and search all transactions across your accounts, newest first.",
      },
      { property: "og:title", content: "Transactions — Finance Dashboard" },
      {
        property: "og:description",
        content:
          "Browse and search all transactions across your accounts, newest first.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransactionsPage,
});

const PAGE_SIZE = 50;

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
}

interface AccountRow {
  uid: string;
  label: string | null;
  currency: string;
}

async function fetchTransactionsPage(
  page: number,
): Promise<Array<TransactionRow>> {
  const from = page * PAGE_SIZE;
  const { data, error } = await getSupabase()
    .from("v_transactions_eur")
    .select(
      "entry_reference,account_uid,booking_date,category,transaction_type,creditor_name,currency,amount,signed_amount_eur",
    )
    .order("booking_date", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
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


function TransactionsPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const queryClient = useQueryClient();

  const updateCategory = useMutation({
    mutationFn: async ({
      entryReference,
      category: next,
    }: {
      entryReference: string;
      category: string;
    }) => {
      const { error } = await getSupabase()
        .from("transactions")
        .update({ category: next })
        .eq("entry_reference", entryReference);
      if (error) throw error;
    },
    onMutate: async ({ entryReference, category: next }) => {
      await queryClient.cancelQueries({ queryKey: ["transactions"] });
      const previous = queryClient.getQueryData<
        InfiniteData<Array<TransactionRow>>
      >(["transactions"]);
      queryClient.setQueryData<InfiniteData<Array<TransactionRow>>>(
        ["transactions"],
        (old) =>
          old
            ? {
                ...old,
                pages: old.pages.map((page) =>
                  page.map((row) =>
                    row.entry_reference === entryReference
                      ? { ...row, category: next }
                      : row,
                  ),
                ),
              }
            : old,
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous)
        queryClient.setQueryData(["transactions"], context.previous);
      toast.error("Couldn't save category", {
        description: (error as Error).message,
      });
    },
    onSuccess: (_data, vars) => {
      toast.success(`Saved — ${vars.category}`);
    },
  });

  const updateType = useMutation({
    mutationFn: async ({
      entryReference,
      transactionType,
    }: {
      entryReference: string;
      transactionType: string;
    }) => {
      const { error } = await getSupabase()
        .from("transactions")
        .update({ transaction_type: transactionType })
        .eq("entry_reference", entryReference);
      if (error) throw error;
    },
    onMutate: async ({ entryReference, transactionType: next }) => {
      await queryClient.cancelQueries({ queryKey: ["transactions"] });
      const previous = queryClient.getQueryData<
        InfiniteData<Array<TransactionRow>>
      >(["transactions"]);
      queryClient.setQueryData<InfiniteData<Array<TransactionRow>>>(
        ["transactions"],
        (old) =>
          old
            ? {
                ...old,
                pages: old.pages.map((page) =>
                  page.map((row) =>
                    row.entry_reference === entryReference
                      ? { ...row, transaction_type: next }
                      : row,
                  ),
                ),
              }
            : old,
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous)
        queryClient.setQueryData(["transactions"], context.previous);
      toast.error("Couldn't save type", {
        description: (error as Error).message,
      });
    },
    onSuccess: (_data, vars) => {
      toast.success(`Saved — ${vars.transactionType}`);
    },
  });


  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
    staleTime: 5 * 60_000,
  });

  const txQuery = useInfiniteQuery({
    queryKey: ["transactions"],
    queryFn: ({ pageParam }) => fetchTransactionsPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === PAGE_SIZE ? pages.length : undefined,
  });

  const transactions = useMemo(
    () => txQuery.data?.pages.flat() ?? [],
    [txQuery.data],
  );

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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Transactions
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Every transaction across your accounts, newest first.
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
            className="h-10 w-full rounded-lg border bg-card pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
          className="h-10 rounded-lg border bg-card px-3 text-sm text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
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

      {/* Register */}
      <section className="overflow-hidden rounded-2xl border bg-card card-ring">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Merchant</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {txQuery.isPending ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-5 animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    {transactions.length === 0
                      ? "No transactions yet."
                      : "No transactions match your filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => (
                  <TransactionRowView
                    key={tx.entry_reference}
                    tx={tx}
                    saving={
                      updateCategory.isPending &&
                      updateCategory.variables?.entryReference ===
                        tx.entry_reference
                    }
                    onSelectCategory={(next) =>
                      updateCategory.mutate({
                        entryReference: tx.entry_reference,
                        category: next,
                      })
                    }
                    accountLabel={
                      tx.account_uid
                        ? (accounts[tx.account_uid]?.label ?? "Unknown account")
                        : "—"
                    }
                  />
                ))

              )}
            </tbody>
          </table>
        </div>

        {txQuery.hasNextPage && (
          <div className="border-t p-3 text-center">
            <button
              type="button"
              onClick={() => void txQuery.fetchNextPage()}
              disabled={txQuery.isFetchingNextPage}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {txQuery.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
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
          className="cursor-pointer disabled:opacity-60"
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
              className={`block w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
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

function TransactionRowView({
  tx,
  accountLabel,
  onSelectCategory,
  saving,
}: {
  tx: TransactionRow;
  accountLabel: string;
  onSelectCategory: (category: string) => void;
  saving: boolean;
}) {
  const native = nativeSignedAmount(tx);
  const currency = tx.currency ?? "EUR";
  const positive = (native ?? 0) >= 0;
  const eur = tx.signed_amount_eur;
  const showEur = currency !== "EUR" && eur != null;

  return (
    <tr className="border-b transition-colors last:border-0 hover:bg-accent/40">
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
        {tx.booking_date
          ? new Date(`${tx.booking_date}T00:00:00`).toLocaleDateString(
              "en-GB",
              { day: "numeric", month: "short", year: "numeric" },
            )
          : "—"}
      </td>
      <td className="max-w-48 truncate px-4 py-3 font-medium text-foreground">
        {tx.creditor_name ?? "—"}
      </td>
      <td className="px-4 py-3">
        <CategoryPicker tx={tx} onSelect={onSelectCategory} saving={saving} />
      </td>
      <td className="px-4 py-3">
        {tx.transaction_type ? (
          <span className="inline-flex rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground">
            {tx.transaction_type}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </td>
      <td className="max-w-36 truncate px-4 py-3 text-muted-foreground">
        {accountLabel}
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
            {formatMoney(native, currency)}
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
