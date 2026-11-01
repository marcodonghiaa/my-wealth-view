import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SplitwisePanel } from "@/components/import/splitwise-panel";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { BalancesView } from "@/components/splitwise/balances-view";
import { summarizeBalances } from "@/lib/import/splitwise-balances";
import { useSplitwiseBalances } from "@/lib/use-splitwise-balances";

export const Route = createFileRoute("/_authenticated/splitwise")({
  head: () => ({
    meta: [
      { title: "Splitwise — MyFinances" },
      { name: "description", content: "Who owes what in your Splitwise groups." },
      { property: "og:title", content: "Splitwise — MyFinances" },
      { property: "og:description", content: "Who owes what in your Splitwise groups." },
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="ios-large-title">Splitwise</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Who owes what in your groups, from your last import.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          onClick={() => setImporting(true)}
        >
          Import
        </button>
      </header>

      {balances.isError && (
        <div
          role="alert"
          className="mb-6 rounded-2xl bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load Splitwise balances: {balances.error.message}
        </div>
      )}

      {balances.isPending ? (
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
      ) : (
        <BalancesView groups={groups} />
      )}

      <Dialog open={importing} onOpenChange={setImporting}>
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
