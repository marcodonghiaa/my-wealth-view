import { useIsMutating, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SplitwisePanel } from "@/components/import/splitwise-panel";
import { IMPORT_KEY } from "@/lib/import/splitwise-commit";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { BalancesView } from "@/components/splitwise/balances-view";
import { summarizeBalances } from "@/lib/import/splitwise-balances";
import { useSplitwiseBalances } from "@/lib/use-splitwise-balances";
import { OwedView } from "@/components/splitwise/owed-view";
import { useSettleSplitMutation } from "@/components/transactions/mutations";
import { fetchSplits, money, owedByPerson } from "@/lib/splits";

export const Route = createFileRoute("/_authenticated/splitwise")({
  head: () => ({
    meta: [
      { title: "Who owes you — MyFinances" },
      {
        name: "description",
        content: "Who owes you, from your Splitwise groups and the bills you split.",
      },
      { property: "og:title", content: "Who owes you — MyFinances" },
      {
        property: "og:description",
        content: "Who owes you, from your Splitwise groups and the bills you split.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SplitwisePage,
});

function SplitwisePage() {
  const { balances, rows, rate } = useSplitwiseBalances();
  const groups = useMemo(() => summarizeBalances(rows, rate), [rows, rate]);
  const [importing, setImporting] = useState(false);
  const writing = useIsMutating({ mutationKey: IMPORT_KEY }) > 0;
  const queryClient = useQueryClient();
  const splits = useQuery({ queryKey: ["splits"], queryFn: fetchSplits, staleTime: 60_000 });
  const settle = useSettleSplitMutation(queryClient);

  const totals = useMemo(() => {
    let owedToYou = owedByPerson(splits.data ?? []).reduce((sum, p) => sum + p.owed, 0);
    let youOwe = 0;
    let missingRate = false;
    for (const g of groups) {
      const r2e = rate(g.currency);
      if (r2e === null) missingRate = true;
      for (const p of g.people) {
        const value = Math.abs(p.balance) * (r2e ?? 0);
        if (p.owesYou) owedToYou += value;
        else youOwe += value;
      }
    }
    return { owedToYou, youOwe, missingRate };
  }, [groups, rate, splits.data]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="ios-large-title">Who owes you</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            From your Splitwise groups and the bills you split.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-9 items-center rounded-full border px-3 text-sm transition-colors hover:bg-accent"
          onClick={() => setImporting(true)}
        >
          Import from Splitwise
        </button>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Owed to you</p>
          <p className="font-figure text-2xl font-bold tracking-tight text-positive">
            {money(totals.owedToYou, "EUR")}
          </p>
        </div>
        <div className="rounded-2xl bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">You owe</p>
          <p className="font-figure text-2xl font-bold tracking-tight">
            {money(totals.youOwe, "EUR")}
          </p>
        </div>
        {totals.missingRate && (
          <p className="col-span-2 text-xs text-muted-foreground">
            Some Splitwise amounts are left out: no exchange rate for their currency yet.
          </p>
        )}
      </div>

      <h2 className="mb-3 text-lg font-semibold">Your splits</h2>
      {splits.isError ? (
        <div role="alert" className="rounded-2xl bg-negative/10 px-4 py-3 text-sm text-negative">
          Couldn't load your splits: {splits.error.message}
        </div>
      ) : splits.isPending ? (
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
      ) : (
        <OwedView
          rows={splits.data}
          onToggleSettled={(row, settled) => settle.mutate({ tx: row, settled })}
        />
      )}

      <h2 className="mt-10 mb-3 text-lg font-semibold">Splitwise</h2>
      {balances.isError && (
        <div
          role="alert"
          className="mb-6 rounded-2xl bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load Splitwise balances: {balances.error.message}
        </div>
      )}
      {balances.isPending ? (
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
      ) : (
        <BalancesView groups={groups} />
      )}

      <Dialog open={importing} onOpenChange={(open) => writing || setImporting(open)}>
        <DialogContent className="left-0 top-0 block h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 p-0 sm:rounded-none">
          <div className="mx-auto max-w-2xl px-4 py-6 sm:px-8">
            <DialogTitle className="mb-1 pr-10 text-xl">Import from Splitwise</DialogTitle>
            <DialogDescription className="mb-6">
              Your share of each expense counts as spending, and everyone's balance is saved.
            </DialogDescription>
            <SplitwisePanel onClose={() => setImporting(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
