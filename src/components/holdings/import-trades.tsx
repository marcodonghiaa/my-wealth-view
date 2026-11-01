import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { localToday } from "@/lib/trades";
import type { Trade } from "@/lib/trades";
import { newTrades, parseTradesCsv, shareUpdates } from "@/lib/trades-csv";

// Every holding and its count, sold ones too: the old trades of something you sold are still yours.
async function fetchHoldings(kind: "stock" | "crypto"): Promise<Map<string, number>> {
  if (kind === "stock") {
    const { data, error } = await supabase.from("portfolio_holdings").select("isin,shares");
    if (error) throw error;
    return new Map(data.map((r) => [r.isin.toUpperCase(), r.shares]));
  }
  const { data, error } = await supabase.from("crypto_holdings").select("asset_symbol,amount");
  if (error) throw error;
  return new Map(data.map((r) => [r.asset_symbol.toUpperCase(), r.amount]));
}

/** Paste or upload a CSV of trades; shows what it found and saves only on your say-so. */
export function ImportTrades({ kind, saved }: { kind: "stock" | "crypto"; saved: Array<Trade> }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const keyColumn = kind === "stock" ? "isin" : "symbol";

  const keys = useQuery({
    queryKey: ["holding-keys", kind],
    queryFn: () => fetchHoldings(kind),
    enabled: open,
  });

  const parsed = useMemo(
    () =>
      text.trim() && keys.data
        ? parseTradesCsv(text, { kind, knownKeys: new Set(keys.data.keys()), today: localToday() })
        : null,
    [text, keys.data, kind],
  );
  const fresh = useMemo(() => (parsed ? newTrades(parsed.trades, saved) : []), [parsed, saved]);
  const updates = useMemo(
    () => (parsed?.setsShares && keys.data ? shareUpdates(parsed.trades, saved, keys.data) : []),
    [parsed, saved, keys.data],
  );

  const save = useMutation({
    mutationFn: async () => {
      // One insert is one statement: all the rows land, or none do.
      if (fresh.length > 0) {
        const { data } = await supabase.auth.getUser();
        if (!data.user) throw new Error("You're signed out. Sign in and try again.");
        const userId = data.user.id;
        const { error } = await supabase
          .from("holding_trades")
          .insert(fresh.map((t) => ({ ...t, user_id: userId })));
        if (error) throw error;
      }
      // If this fails the trades are safe: importing again skips them and retries the counts.
      for (const { key, shares } of updates) {
        const { error } = await supabase
          .from("portfolio_holdings")
          .update({ shares })
          .eq("isin", key);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(`${fresh.length} trade${fresh.length === 1 ? "" : "s"} imported`);
      setText("");
      setOpen(false);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["holding-trades"] });
      void queryClient.invalidateQueries({ queryKey: ["holding-keys", kind] });
      void queryClient.invalidateQueries({ queryKey: ["holding-performance"] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio-latest"] });
      void queryClient.invalidateQueries({ queryKey: ["net-worth-daily"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="min-h-6 text-xs text-primary underline-offset-2 hover:underline">
        Import trades from CSV
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import trades</DialogTitle>
          <DialogDescription>
            Needs a header row with <code>date, side, {keyColumn}, shares, price</code>, and
            optionally <code>fee</code>. Side is buy or sell; price is per share in EUR.
            {kind === "stock" && " Or upload a Trade Republic transaction export as it comes."}
          </DialogDescription>
        </DialogHeader>
        <input
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          aria-label="CSV file"
          onChange={(e) => {
            void e.target.files?.[0]?.text().then(setText);
          }}
          className="text-sm"
        />
        <textarea
          aria-label="CSV text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={`date,side,${keyColumn},shares,price,fee`}
          className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-ring focus:outline-none"
        />
        {keys.isError && (
          <p role="alert" className="text-sm text-negative">
            Couldn't load your holdings: {keys.error.message}
          </p>
        )}
        {parsed && parsed.errors.length > 0 && (
          <div role="alert" className="max-h-40 overflow-y-auto text-sm text-negative">
            <p className="font-medium">Nothing saved. Fix these first:</p>
            <ul>
              {parsed.errors.slice(0, 20).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            {parsed.errors.length > 20 && <p>…and {parsed.errors.length - 20} more.</p>}
          </div>
        )}
        {parsed && parsed.errors.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {fresh.length} new trade{fresh.length === 1 ? "" : "s"} to save
            {parsed.trades.length > fresh.length &&
              `, ${parsed.trades.length - fresh.length} already saved and left out`}
            .
            {updates.length > 0 &&
              ` Share count${updates.length === 1 ? "" : "s"} will be updated on ${updates.length} holding${updates.length === 1 ? "" : "s"}.`}
          </p>
        )}
        {parsed?.notes.map((note) => (
          <p key={note} className="text-sm text-muted-foreground">
            {note}
          </p>
        ))}
        {save.isError && (
          <p role="alert" className="text-sm text-negative">
            {save.error.message}
          </p>
        )}
        <button
          type="button"
          disabled={
            !parsed ||
            parsed.errors.length > 0 ||
            (fresh.length === 0 && updates.length === 0) ||
            save.isPending
          }
          onClick={() => save.mutate()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          Save trades
        </button>
      </DialogContent>
    </Dialog>
  );
}
