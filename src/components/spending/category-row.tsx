import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { categoryColor } from "@/lib/categories";
import { formatISODate } from "@/lib/date";
import { formatEur } from "@/lib/transactions";

interface BankRow {
  entry_reference: string;
  booking_date: string | null;
  creditor_name: string | null;
  personal_signed_amount_eur: number | null;
}

interface ShareRow {
  id: string;
  booking_date: string;
  description: string;
  amount_eur: number | null;
}

interface CategoryTx {
  key: string;
  booking_date: string | null;
  label: string;
  amountEur: number;
}

const UNCATEGORIZED = "Uncategorized";

// Same rows the category total is built from, for one month: the personal share of real bank
// spend, plus my Splitwise shares that are not already inside a bank transaction.
async function fetchCategoryTransactions(
  category: string,
  month: Date,
): Promise<Array<CategoryTx>> {
  const start = formatISODate(month);
  const end = formatISODate(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const bankQuery = supabase
    .from("v_transactions_eur")
    .select("entry_reference,booking_date,creditor_name,personal_signed_amount_eur")
    .eq("flow_type", "spend")
    .lt("personal_signed_amount_eur", 0)
    .gte("booking_date", start)
    .lt("booking_date", end)
    .order("booking_date", { ascending: false });
  const shareQuery = supabase
    .from("v_splitwise_eur")
    .select("id,booking_date,description,amount_eur")
    .gte("booking_date", start)
    .lt("booking_date", end);
  const isNone = category === UNCATEGORIZED;
  const [bank, shares] = await Promise.all([
    isNone ? bankQuery.is("category", null) : bankQuery.eq("category", category),
    isNone ? shareQuery.is("category", null) : shareQuery.eq("category", category),
  ]);
  if (bank.error) throw bank.error;
  if (shares.error) throw shares.error;

  const fromBank = ((bank.data ?? []) as Array<BankRow>).map((tx) => ({
    key: tx.entry_reference,
    booking_date: tx.booking_date,
    label: tx.creditor_name ?? "—",
    amountEur: Math.abs(tx.personal_signed_amount_eur ?? 0),
  }));
  const fromShares = ((shares.data ?? []) as Array<ShareRow>).map((s) => ({
    key: `share-${s.id}`,
    booking_date: s.booking_date,
    label: `Splitwise: ${s.description}`,
    amountEur: s.amount_eur ?? 0,
  }));
  return [...fromBank, ...fromShares].sort((a, b) =>
    (b.booking_date ?? "").localeCompare(a.booking_date ?? ""),
  );
}

export function CategoryRow({
  category,
  total,
  month,
}: {
  category: string;
  total: number;
  month: Date;
}) {
  const [open, setOpen] = useState(false);
  const txQuery = useQuery({
    queryKey: ["category-transactions", category, formatISODate(month)],
    queryFn: () => fetchCategoryTransactions(category, month),
    enabled: open,
  });

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-accent/40 sm:px-5"
      >
        <span className="flex items-center gap-2 font-medium text-foreground">
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
          />
          <span
            aria-hidden
            className="inline-block size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: categoryColor(category) }}
          />
          {category}
        </span>
        <span className="font-figure text-foreground">{formatEur(total)}</span>
      </button>
      {open && (
        <ul className="border-t bg-muted/30 px-4 py-1 sm:px-5">
          {txQuery.isPending && <li className="py-2 text-xs text-muted-foreground">Loading…</li>}
          {txQuery.isError && (
            <li className="py-2 text-xs text-negative">Couldn't load transactions.</li>
          )}
          {txQuery.data?.length === 0 && (
            <li className="py-2 text-xs text-muted-foreground">
              No individual transactions: this month's total was imported.
            </li>
          )}
          {txQuery.data?.map((tx) => (
            <li key={tx.key} className="flex items-center gap-3 py-2 text-[0.8125rem]">
              <span className="w-14 shrink-0 text-muted-foreground">
                {tx.booking_date
                  ? new Date(`${tx.booking_date}T00:00:00`).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })
                  : "—"}
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">{tx.label}</span>
              <span className="font-figure shrink-0 text-foreground">
                {formatEur(tx.amountEur)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
