import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatISODate } from "@/lib/date";

interface CategoryTx {
  entry_reference: string;
  booking_date: string | null;
  creditor_name: string | null;
  personal_signed_amount_eur: number | null;
}

const UNCATEGORIZED = "Uncategorized";

const formatEur = (value: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(value);

// Same rows the category total is built from (personal share of real spend), for one month.
async function fetchCategoryTransactions(
  category: string,
  month: Date,
): Promise<Array<CategoryTx>> {
  const start = formatISODate(month);
  const end = formatISODate(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const query = supabase
    .from("v_transactions_eur")
    .select("entry_reference,booking_date,creditor_name,personal_signed_amount_eur")
    .eq("flow_type", "spend")
    .lt("personal_signed_amount_eur", 0)
    .gte("booking_date", start)
    .lt("booking_date", end)
    .order("booking_date", { ascending: false });
  const { data, error } = await (category === UNCATEGORIZED
    ? query.is("category", null)
    : query.eq("category", category));
  if (error) throw error;
  return (data ?? []) as Array<CategoryTx>;
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
          {txQuery.data?.map((tx) => (
            <li key={tx.entry_reference} className="flex items-center gap-3 py-2 text-[0.8125rem]">
              <span className="w-14 shrink-0 text-muted-foreground">
                {tx.booking_date
                  ? new Date(`${tx.booking_date}T00:00:00`).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })
                  : "—"}
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">
                {tx.creditor_name ?? "—"}
              </span>
              <span className="font-figure shrink-0 text-foreground">
                {formatEur(Math.abs(tx.personal_signed_amount_eur ?? 0))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
