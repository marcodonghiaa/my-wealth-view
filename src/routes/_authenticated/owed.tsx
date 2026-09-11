import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSupabase, isDemoRoute } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/owed")({
  head: () => ({
    meta: [
      { title: "Owed — Finance Dashboard" },
      {
        name: "description",
        content: "Money fronted for others, split off transactions you paid in full.",
      },
      { property: "og:title", content: "Owed — Finance Dashboard" },
      {
        property: "og:description",
        content: "Money fronted for others, split off transactions you paid in full.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OwedPage,
});

interface OwedRow {
  entry_reference: string;
  booking_date: string | null;
  creditor_name: string | null;
  currency: string | null;
  amount: number | null;
  personal_amount: number | null;
  owed_by: string | null;
  owed_settled: boolean;
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

async function fetchOwed(): Promise<Array<OwedRow>> {
  const { data, error } = await getSupabase()
    .from("transactions")
    .select("entry_reference,booking_date,creditor_name,currency,amount,personal_amount,owed_by,owed_settled")
    .not("personal_amount", "is", null)
    .order("owed_settled", { ascending: true })
    .order("booking_date", { ascending: false });
  if (error) throw error;
  // personal_amount is only ever set below the full amount by SplitEditor,
  // but guard anyway in case it's ever equal (no real split, nothing owed).
  return ((data ?? []) as Array<OwedRow>).filter(
    (r) => (r.personal_amount ?? 0) < (r.amount ?? 0),
  );
}

export function OwedPage() {
  const queryClient = useQueryClient();

  const owedQuery = useQuery({ queryKey: ["owed"], queryFn: fetchOwed });
  const rows = owedQuery.data ?? [];
  const outstanding = rows.filter((r) => !r.owed_settled);
  const settled = rows.filter((r) => r.owed_settled);
  const totalOutstandingEur = outstanding
    .filter((r) => r.currency === "EUR")
    .reduce((sum, r) => sum + ((r.amount ?? 0) - (r.personal_amount ?? 0)), 0);

  const toggleSettled = useMutation({
    mutationFn: async ({ entryReference, settled: next }: { entryReference: string; settled: boolean }) => {
      if (isDemoRoute()) throw new Error("This is a read-only demo — sign up to make changes.");
      const { error } = await getSupabase()
        .from("transactions")
        .update({ owed_settled: next, settled_at: next ? new Date().toISOString() : null })
        .eq("entry_reference", entryReference);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["owed"] }),
    onError: (error: Error) => toast.error("Couldn't update", { description: error.message }),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Owed</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Transactions you fronted for others — split off your spend from the Transactions page.
        </p>
      </header>

      {owedQuery.isError && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load owed transactions: {owedQuery.error.message}
        </div>
      )}

      <section className="mb-6 rounded-2xl border bg-card p-6 card-ring sm:p-8">
        <div className="text-sm text-muted-foreground">Outstanding (EUR)</div>
        <p className="font-figure mt-2 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {formatMoney(totalOutstandingEur, "EUR")}
        </p>
        {rows.some((r) => !r.owed_settled && r.currency !== "EUR") && (
          <p className="mt-2 text-xs text-muted-foreground">
            Plus non-EUR splits below — not included in this total.
          </p>
        )}
      </section>

      {owedQuery.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-2xl border bg-card text-sm text-muted-foreground card-ring">
          Nothing split yet — split a transaction on the Transactions page to see it here.
        </div>
      ) : (
        <>
          <section className="overflow-hidden rounded-2xl border bg-card card-ring">
            <div className="border-b px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold text-foreground">
                Outstanding ({outstanding.length})
              </h2>
            </div>
            {outstanding.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing outstanding.
              </div>
            ) : (
              <ul className="divide-y">
                {outstanding.map((r) => {
                  const owed = (r.amount ?? 0) - (r.personal_amount ?? 0);
                  return (
                    <li key={r.entry_reference} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">
                          {r.creditor_name ?? "—"}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {r.booking_date
                            ? new Date(`${r.booking_date}T00:00:00`).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                          {r.owed_by && ` · ${r.owed_by}`}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-figure font-medium text-foreground">
                          {formatMoney(owed, r.currency ?? "EUR")}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            toggleSettled.mutate({ entryReference: r.entry_reference, settled: true })
                          }
                          disabled={toggleSettled.isPending}
                          className="min-h-9 rounded-lg border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
                        >
                          Mark settled
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {settled.length > 0 && (
            <section className="mt-6 overflow-hidden rounded-2xl border bg-card card-ring">
              <div className="border-b px-4 py-3 sm:px-5">
                <h2 className="text-sm font-semibold text-foreground">Settled ({settled.length})</h2>
              </div>
              <ul className="divide-y">
                {settled.map((r) => {
                  const owed = (r.amount ?? 0) - (r.personal_amount ?? 0);
                  return (
                    <li key={r.entry_reference} className="flex items-center justify-between gap-3 px-4 py-3 text-sm opacity-60 sm:px-5">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">
                          {r.creditor_name ?? "—"}
                          {r.owed_by && <span className="text-muted-foreground"> · {r.owed_by}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-figure text-muted-foreground line-through">
                          {formatMoney(owed, r.currency ?? "EUR")}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            toggleSettled.mutate({ entryReference: r.entry_reference, settled: false })
                          }
                          disabled={toggleSettled.isPending}
                          className="min-h-9 rounded-lg border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
                        >
                          Undo
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
