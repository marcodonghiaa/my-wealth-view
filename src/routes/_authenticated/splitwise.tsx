import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SplitwisePanel } from "@/components/import/splitwise-panel";
import { IMPORT_KEY, undoSplitwiseImport, type RpcClient } from "@/lib/import/splitwise-commit";
import type { ImportDone } from "@/components/import/splitwise-review";
import {
  browserStorage,
  clearLastImport,
  loadLastImport,
  refreshKeys,
  saveLastImport,
  type LastImport,
} from "@/lib/import/last-import";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { BalancesView } from "@/components/splitwise/balances-view";
import { summarizeBalances } from "@/lib/import/splitwise-balances";
import { useSplitwiseBalances } from "@/lib/use-splitwise-balances";
import { OwedView } from "@/components/splitwise/owed-view";
import { LastImportRow } from "@/components/splitwise/last-import-row";
import { useSettleSplitMutation } from "@/components/transactions/mutations";
import { toast } from "sonner";
import { fetchSplits, money, peopleFrom, type SplitRow } from "@/lib/splits";

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

  // The last Splitwise import, kept in this browser so it can be undone after looking at the page.
  const [userId, setUserId] = useState<string | null>(null);
  const [last, setLast] = useState<LastImport | null>(null);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      setLast(id ? loadLastImport(browserStorage(), id, "splitwise") : null);
    });
  }, []);

  const undo = useMutation({
    mutationFn: (batchId: string) => undoSplitwiseImport(supabase as unknown as RpcClient, batchId),
    onSuccess: ({ shares }, batchId) => {
      // Only forget the stored import when it is the one undone; a newer one keeps its Undo.
      setLast((current) => {
        if (current?.batchId !== batchId) return current;
        if (userId) clearLastImport(browserStorage(), userId, "splitwise");
        return null;
      });
      toast.success(
        shares === 1
          ? "Import undone: 1 expense removed"
          : `Import undone: ${shares} expenses removed`,
      );
      for (const queryKey of refreshKeys("splitwise"))
        void queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => toast.error(`Undo failed: ${err.message}`),
  });
  const undoBatch = (batchId: string) => {
    if (!undo.isPending) undo.mutate(batchId);
  };

  const onImported = (done: ImportDone) => {
    const entry = { batchId: done.batchId, count: done.shares };
    if (userId) saveLastImport(browserStorage(), userId, "splitwise", entry);
    setLast(entry);
    setImporting(false);
    const n = done.shares === 1 ? "1 expense" : `${done.shares} expenses`;
    toast.success(`${n} imported into ${done.group}`, {
      duration: 10_000,
      action: { label: "Undo", onClick: () => undoBatch(done.batchId) },
    });
    if (done.balancesError) {
      toast.error(
        `The friends' balances were not saved (${done.balancesError}). Import again to retry.`,
      );
    }
  };

  const totals = useMemo(() => {
    let owedToYou = 0;
    let youOwe = 0;
    for (const p of peopleFrom(splits.data ?? [])) {
      if (p.open > 0) owedToYou += p.open;
      else youOwe -= p.open;
    }
    let missingRate = false;
    for (const g of groups) {
      const r2e = rate(g.currency);
      if (r2e === null) missingRate = true;
      // Saved before per-person amounts: my net in the group is all that's known.
      const amounts = g.stale ? [{ owesYou: g.myBalance > 0, balance: g.myBalance }] : g.people;
      for (const p of amounts) {
        const value = Math.abs(p.balance) * (r2e ?? 0);
        if (p.owesYou) owedToYou += value;
        else youOwe += value;
      }
    }
    return { owedToYou, youOwe, missingRate };
  }, [groups, rate, splits.data]);

  const settleAll = (name: string, rows: Array<SplitRow>) => {
    for (const r of rows) settle.mutate({ tx: r, settled: true });
    toast.success(`Settled ${rows.length} bills with ${name}`, {
      action: {
        label: "Undo",
        onClick: () => rows.forEach((r) => settle.mutate({ tx: r, settled: false })),
      },
    });
  };

  const loading = (label: string) => (
    <div role="status" aria-label={label} className="h-24 animate-pulse rounded-2xl bg-muted" />
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="ios-large-title">Who owes you</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            And who you owe, from bills you split and your Splitwise groups.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-full bg-card px-4 text-sm font-medium transition-colors hover:bg-accent"
          onClick={() => setImporting(true)}
        >
          Import from Splitwise
        </button>
      </header>

      <dl className="divide-y overflow-hidden rounded-2xl bg-card">
        <div className="flex items-baseline justify-between gap-3 px-4 py-3 sm:px-5">
          <dt className="text-[0.9375rem]">Owed to you</dt>
          <dd className="font-figure text-xl font-semibold">{money(totals.owedToYou, "EUR")}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 px-4 py-3 sm:px-5">
          <dt className="text-[0.9375rem]">You owe</dt>
          <dd className="font-figure text-xl font-semibold">{money(totals.youOwe, "EUR")}</dd>
        </div>
      </dl>
      {totals.missingRate && (
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          Some Splitwise amounts are left out: no exchange rate for their currency yet.
        </p>
      )}

      <h2 className="ios-section-title mt-8">Split bills · from your transactions</h2>
      {splits.isError ? (
        <div role="alert" className="rounded-2xl bg-negative/10 px-4 py-3 text-sm text-negative">
          Couldn't load your splits: {splits.error.message}
        </div>
      ) : splits.isPending ? (
        loading("Loading split bills")
      ) : (
        <OwedView
          rows={splits.data}
          onToggleSettled={(row, settled) => settle.mutate({ tx: row, settled })}
          onSettleAll={settleAll}
        />
      )}

      <h2 className="ios-section-title mt-8">Splitwise groups · from your last import</h2>
      {balances.isError ? (
        <div role="alert" className="rounded-2xl bg-negative/10 px-4 py-3 text-sm text-negative">
          Couldn't load Splitwise balances: {balances.error.message}
        </div>
      ) : balances.isPending ? (
        loading("Loading Splitwise groups")
      ) : (
        <BalancesView groups={groups} />
      )}
      {last && (
        <LastImportRow
          count={last.count}
          pending={undo.isPending}
          onUndo={() => undoBatch(last.batchId)}
        />
      )}

      <Dialog open={importing} onOpenChange={(open) => writing || setImporting(open)}>
        <DialogContent className="left-0 top-0 block h-dvh max-h-dvh w-screen overflow-y-auto max-w-none translate-x-0 translate-y-0 rounded-none border-0 p-0 sm:rounded-none">
          <div className="mx-auto max-w-lg px-4 pt-6 pb-16 sm:pt-12">
            <DialogTitle className="sr-only">Import from Splitwise</DialogTitle>
            <DialogDescription className="sr-only">
              Your share of each expense counts as spending, and everyone's balance is saved.
            </DialogDescription>
            <SplitwisePanel onDone={onImported} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
