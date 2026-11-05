import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2 } from "lucide-react";
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
import {
  readStatement,
  type Statement,
  type StatementColumns,
  type StatementRow,
} from "@/lib/import/statement";
import { importStatement, newRows, type StatementClient } from "@/lib/import/statement-commit";
import { readStatementPdf } from "@/lib/import/statement-pdf";
import { formatMoney } from "@/lib/transactions";

const client = supabase as unknown as StatementClient;

const FIELD_LABELS: Array<[keyof StatementColumns, string]> = [
  ["date", "Date"],
  ["description", "Description"],
  ["amount", "Amount (+/−)"],
  ["in", "Money in"],
  ["out", "Money out"],
];

const NO_COLUMNS: StatementColumns = {
  date: null,
  description: null,
  amount: null,
  in: null,
  out: null,
};

const field =
  "h-11 w-full min-w-0 rounded-full border bg-background px-4 text-base focus:ring-2 focus:ring-ring focus:outline-none";

// The bank's name from a file like "Fineco_movimenti_2026.csv", as the default source.
const sourceFromFile = (name: string) => /^[A-Za-z]+/.exec(name)?.[0] ?? "";

// Adds the transactions of a bank statement saved as CSV. Rows already in the app are left out,
// so importing the same file twice adds nothing.
export function ImportStatement() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [headers, setHeaders] = useState<Array<string>>([]);
  const [columns, setColumns] = useState<StatementColumns | null>(null);
  const [fresh, setFresh] = useState<Array<StatementRow> | null>(null);
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [readingPdf, setReadingPdf] = useState(false);

  function reset() {
    setText(null);
    setStatement(null);
    setHeaders([]);
    setColumns(null);
    setFresh(null);
    setSource("");
    setError(null);
    setProgress(null);
  }

  async function read(csv: string, picked?: StatementColumns) {
    setError(null);
    setFresh(null);
    try {
      const result = readStatement(csv, picked);
      setStatement(result);
      setHeaders(result.headers);
      setColumns(result.columns);
      setFresh(await newRows(client, result.rows));
    } catch (err) {
      setStatement(null);
      setError(err instanceof Error ? err.message : "Couldn't read the file.");
    }
  }

  async function handlePdf(file: File) {
    setReadingPdf(true);
    try {
      const rows = await readStatementPdf(
        (name, opts) => supabase.functions.invoke(name, opts),
        file,
      );
      setStatement({ headers: [], columns: NO_COLUMNS, rows, skipped: 0 });
      setFresh(await newRows(client, rows));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read the PDF.");
    } finally {
      setReadingPdf(false);
    }
  }

  async function handleFile(file: File) {
    reset();
    setSource(sourceFromFile(file.name));
    if (/\.pdf$/i.test(file.name)) return handlePdf(file);
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setError("Use a CSV or PDF. Excel files: File → Save as → CSV first.");
      return;
    }
    const csv = await file.text();
    setText(csv);
    // Headers for the column pickers, even when the columns can't be guessed.
    const firstLine = csv.replace(/^\uFEFF/, "").split(/\r?\n/)[0] ?? "";
    setHeaders(firstLine.split(/[;,\t]/).map((h) => h.trim()));
    await read(csv);
  }

  function pick(key: keyof StatementColumns, value: string) {
    if (!text) return;
    const next = {
      ...(columns ?? NO_COLUMNS),
      [key]: value === "" ? null : Number(value),
    };
    setColumns(next);
    void read(text, next);
  }

  async function handleImport() {
    if (!fresh || fresh.length === 0) return;
    setError(null);
    setProgress(0);
    try {
      const added = await importStatement(client, fresh, source.trim() || null, setProgress);
      toast.success(`${added} transaction${added === 1 ? "" : "s"} imported`);
      for (const k of [
        "transactions",
        "transfers",
        "income",
        "spend-by-category",
        "category-transactions",
        "accounts",
      ]) {
        void queryClient.invalidateQueries({ queryKey: [k] });
      }
      setOpen(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setProgress(null);
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  }

  const importing = progress != null;
  const duplicates = statement && fresh ? statement.rows.length - fresh.length : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (importing) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        aria-label="Import statement"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground hover:bg-muted"
      >
        <FileUp className="size-5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import statement</DialogTitle>
          <DialogDescription>
            A CSV or PDF statement from your bank (Fineco, any bank), or a spreadsheet saved as CSV.
            A PDF is read by the AI: check the rows before importing. Transactions already here are
            left out.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <input
            aria-label="Statement file"
            type="file"
            accept=".csv,.txt,.pdf,text/csv,application/pdf"
            disabled={importing || readingPdf}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
            className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-muted file:px-4 file:text-sm file:font-medium"
          />

          {text && headers.length > 0 && (
            <details open={!statement} className="rounded-2xl bg-card p-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">Columns</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {FIELD_LABELS.map(([key, label]) => (
                  <label
                    key={key}
                    className="block min-w-0 space-y-1 text-xs text-muted-foreground"
                  >
                    <span>{label}</span>
                    <select
                      aria-label={`${label} column`}
                      value={columns?.[key] ?? ""}
                      onChange={(e) => pick(key, e.target.value)}
                      className={field}
                    >
                      <option value="">—</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Column ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </details>
          )}

          {statement && fresh && (
            <>
              <p className="text-sm text-foreground">
                {fresh.length} new transaction{fresh.length === 1 ? "" : "s"}
                {duplicates > 0 && `, ${duplicates} already here`}
                {statement.skipped > 0 &&
                  `, ${statement.skipped} other line${statement.skipped === 1 ? "" : "s"} skipped`}
                .
              </p>
              {fresh.length > 0 && (
                <ul className="divide-y overflow-hidden rounded-2xl bg-card text-sm">
                  {fresh.slice(0, 5).map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 truncate">
                        <span className="text-muted-foreground">{r.date} · </span>
                        {r.description}
                      </span>
                      <span
                        className={`font-figure whitespace-nowrap ${r.direction === "CRDT" ? "text-positive" : ""}`}
                      >
                        {r.direction === "CRDT" ? "+" : "−"}
                        {formatMoney(r.amount, "EUR")}
                      </span>
                    </li>
                  ))}
                  {fresh.length > 5 && (
                    <li className="px-3 py-2 text-muted-foreground">and {fresh.length - 5} more</li>
                  )}
                </ul>
              )}
              <label className="block space-y-1 text-xs text-muted-foreground">
                <span>From</span>
                <input
                  aria-label="From"
                  placeholder="Manual"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className={field}
                />
              </label>
            </>
          )}

          {readingPdf && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Reading the PDF, this can take a minute…
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={!fresh || fresh.length === 0 || importing}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {importing && <Loader2 className="size-4 animate-spin" />}
            {importing
              ? `Importing ${progress} of ${fresh?.length ?? 0}`
              : `Import${fresh && fresh.length > 0 ? ` ${fresh.length}` : ""}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
