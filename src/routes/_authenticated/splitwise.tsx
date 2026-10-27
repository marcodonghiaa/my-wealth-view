import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { SplitwisePanel } from "@/components/import/splitwise-panel";
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-8">
        <h1 className="ios-large-title">Splitwise</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Who owes what in your groups, from your last import.
        </p>
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

      <section className="mt-10">
        <h2 className="mb-1 text-base font-semibold">Import from Splitwise</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Export your group as CSV from Splitwise and load it here: your share of each expense
          counts as spending, and everyone's balance is saved above.
        </p>
        <SplitwisePanel />
      </section>
    </div>
  );
}
