import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, FileUp, Lock, Loader2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { GroupedList } from "@/components/ui/grouped-list";
import { localToday } from "@/lib/trades";
import type { Trade } from "@/lib/trades";
import { BROKERS, NEW_BROKER_URL } from "@/lib/brokers";
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

/** Pick where the trades come from, upload the file; shows what it found and saves only on your say-so. */
export function ImportTrades({ kind, saved }: { kind: "stock" | "crypto"; saved: Array<Trade> }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Where the file comes from: a broker's id, "spreadsheet" for your own columns, or "other".
  const [from, setFrom] = useState<string | null>(null);
  const brokers = BROKERS.filter((b) => b.kind === kind);
  const broker = brokers.find((b) => b.id === from);
  const keyColumn = kind === "stock" ? "isin" : "symbol";

  const keys = useQuery({
    queryKey: ["holding-keys", kind],
    queryFn: () => fetchHoldings(kind),
    enabled: open,
  });

  const parsed = useMemo(
    () =>
      text.trim() && keys.data
        ? parseTradesCsv(
            text,
            { kind, knownKeys: new Set(keys.data.keys()), today: localToday() },
            broker,
          )
        : null,
    [text, keys.data, kind, broker],
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
      reset();
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

  function reset() {
    setText("");
    setFileName(null);
    setFrom(null);
  }
  function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    void file.text().then(setText);
  }

  const row = "flex min-h-12 items-center gap-3 px-4 py-2.5 text-[0.9375rem]";
  const fileInput = (
    <input
      type="file"
      accept=".csv,.tsv,.txt,text/csv"
      aria-label="CSV file"
      className="sr-only"
      onChange={(e) => {
        onFile(e.target.files?.[0]);
        // The same file can be chosen again after Change.
        e.target.value = "";
      }}
    />
  );
  const ok = parsed != null && parsed.errors.length === 0;
  const title =
    from === null
      ? "Import trades"
      : broker
        ? `Import from ${broker.name}`
        : from === "spreadsheet"
          ? "Import a spreadsheet"
          : "Another broker";
  const sources = [
    ...brokers.map((b) => ({ id: b.id, label: b.name, hint: b.country })),
    { id: "spreadsheet", label: "My own spreadsheet", hint: "Any CSV with our columns" },
    { id: "other", label: "Another broker", hint: "Not listed here" },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger className="-my-2.5 inline-flex min-h-11 items-center text-xs text-primary underline-offset-2 hover:underline">
        Import trades from CSV
      </DialogTrigger>
      <DialogContent>
        {from !== null && (
          <button
            type="button"
            onClick={reset}
            className="-my-2 inline-flex min-h-11 items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" /> All sources
          </button>
        )}
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {from === null
              ? "Where are these trades from?"
              : broker
                ? "Upload the export as it comes. Alopex reads it on your device and shows you what it found first."
                : from === "spreadsheet"
                  ? `A header row with date, side, ${keyColumn}, shares, price and optionally fee. Side is buy or sell; price is per share in EUR.`
                  : "Alopex doesn't read this broker's export yet."}
          </DialogDescription>
        </DialogHeader>

        {from === null && (
          <GroupedList className="border border-hairline">
            {sources.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setFrom(o.id)}
                className={cn(row, "w-full text-left hover:bg-muted")}
              >
                <span className="flex-1 font-medium">{o.label}</span>
                <span className="text-xs text-muted-foreground">{o.hint}</span>
                <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
              </button>
            ))}
          </GroupedList>
        )}

        {from === "other" && (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              <a
                href={NEW_BROKER_URL}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                Ask for your broker
              </a>{" "}
              with a sample of its export, personal details removed. Until then, put your trades in
              a spreadsheet with our columns.
            </p>
            <Button variant="quiet" onClick={() => setFrom("spreadsheet")}>
              Use a spreadsheet
            </Button>
          </div>
        )}

        {from !== null && from !== "other" && (
          <>
            {fileName ? (
              <div className="flex items-center gap-3 rounded-lg border border-hairline bg-card px-4 py-3">
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
                    parsed && !ok ? "bg-negative/15 text-negative" : "bg-positive/15 text-positive",
                  )}
                >
                  {parsed ? (
                    <Check className="size-4" strokeWidth={2.5} />
                  ) : (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{fileName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {!parsed
                      ? "Reading…"
                      : ok
                        ? `${parsed.trades.length} trade${parsed.trades.length === 1 ? "" : "s"} found`
                        : "Can't be imported"}
                  </span>
                </span>
                <label className="cursor-pointer text-xs text-primary underline-offset-2 hover:underline">
                  Change
                  {fileInput}
                </label>
              </div>
            ) : (
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  onFile(e.dataTransfer.files[0]);
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center rounded-lg border border-dashed border-hairline bg-card px-6 py-8 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring hover:bg-muted",
                  dragging && "ring-2 ring-primary",
                )}
              >
                <span
                  aria-hidden
                  className="mb-3 inline-flex size-12 items-center justify-center rounded-full bg-foreground/[0.07]"
                >
                  <FileUp className="size-5" strokeWidth={1.8} />
                </span>
                <span className="text-[0.9375rem] font-semibold">Choose CSV file</span>
                <span className="mt-0.5 text-xs text-muted-foreground">or drop it here</span>
                {fileInput}
              </label>
            )}

            {broker && !fileName && (
              <div>
                <p className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">
                  How to get the file
                </p>
                <GroupedList className="border border-hairline">
                  <ol>
                    {broker.howToExport.map((step, i) => (
                      <li key={step} className={cn(row, "border-hairline not-first:border-t")}>
                        <span
                          aria-hidden
                          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-semibold"
                        >
                          {i + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </GroupedList>
                <p className="flex items-center gap-1.5 px-1 pt-1.5 text-xs text-muted-foreground">
                  <Lock aria-hidden className="size-3" />
                  Read on your device. Nothing is saved until you press Save.
                </p>
              </div>
            )}

            {from === "spreadsheet" && (
              <textarea
                aria-label="CSV text"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setFileName(null);
                }}
                rows={5}
                placeholder={`Or paste it:\ndate,side,${keyColumn},shares,price,fee`}
                className={cn(fieldClass(), "h-auto py-2 font-mono md:text-sm")}
              />
            )}
          </>
        )}
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
            {parsed.unknownFormat && (
              <p className="mt-1 text-muted-foreground">
                Want your broker supported?{" "}
                <a
                  href={NEW_BROKER_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Ask for it
                </a>{" "}
                with a sample of its export, personal details removed.
              </p>
            )}
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
        {parsed && (
          <Button
            disabled={
              !parsed ||
              parsed.errors.length > 0 ||
              (fresh.length === 0 && updates.length === 0) ||
              save.isPending
            }
            onClick={() => save.mutate()}
          >
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            {fresh.length > 0
              ? `Save ${fresh.length} trade${fresh.length === 1 ? "" : "s"}`
              : "Save trades"}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
