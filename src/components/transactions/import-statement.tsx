import { Button, buttonVariants } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { useRef, useState } from "react";
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
  type DateOrder,
  type Statement,
  type StatementColumns,
  type StatementOptions,
  type StatementRow,
} from "@/lib/import/statement";
import { decodeCsv, parseCsv } from "@/lib/import/parse-csv";
import { formatDay } from "@/lib/date";
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
  ["direction", "In/out marker (D/C, Soll/Haben…)"],
];

const NO_COLUMNS: StatementColumns = {
  date: null,
  description: null,
  amount: null,
  in: null,
  out: null,
  direction: null,
};

const field = fieldClass();

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
  // Columns picked by hand; until then the reader finds them (or a known export) itself.
  const [picked, setPicked] = useState<StatementColumns | undefined>(undefined);
  const [options, setOptions] = useState<StatementOptions>({});
  const [fresh, setFresh] = useState<Array<StatementRow> | null>(null);
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [readingPdf, setReadingPdf] = useState(false);
  // Each read checks the app for duplicates over the network; only the latest may show.
  const readId = useRef(0);

  function reset() {
    setText(null);
    setStatement(null);
    setHeaders([]);
    setColumns(null);
    setPicked(undefined);
    setOptions({});
    setFresh(null);
    setSource("");
    setError(null);
    setProgress(null);
  }

  async function read(csv: string, cols?: StatementColumns, opts: StatementOptions = {}) {
    const id = ++readId.current;
    setError(null);
    setFresh(null);
    try {
      const result = readStatement(csv, cols, opts);
      const rows = await newRows(client, result.rows);
      if (id !== readId.current) return;
      setStatement(result);
      setHeaders(result.headers);
      setColumns(result.columns);
      setFresh(rows);
    } catch (err) {
      if (id !== readId.current) return;
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
      setStatement({
        headers: [],
        columns: NO_COLUMNS,
        rows,
        skipped: 0,
        preset: null,
        dateOrder: "DMY",
        decimal: null,
      });
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
    const csv = decodeCsv(await file.arrayBuffer());
    setText(csv);
    // Headers for the column pickers, even when the columns can't be guessed.
    try {
      setHeaders(parseCsv(csv).headers);
    } catch {
      // The read below shows why the file can't be used.
    }
    await read(csv);
  }

  function pick(key: keyof StatementColumns, value: string) {
    if (!text) return;
    const next = {
      ...(columns ?? NO_COLUMNS),
      [key]: value === "" ? null : Number(value),
    };
    setColumns(next);
    setPicked(next);
    void read(text, next, options);
  }

  function setOption(next: StatementOptions) {
    if (!text) return;
    const merged = { ...options, ...next };
    setOptions(merged);
    void read(text, picked, merged);
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
      // Some rows were saved before the error: check again so a retry adds only the rest.
      setFresh(null);
      if (statement) setFresh(await newRows(client, statement.rows).catch(() => null));
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
        className={cn(buttonVariants({ variant: "quiet", size: "icon" }), "[&_svg]:size-5")}
      >
        <FileUp className="size-5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import statement</DialogTitle>
          <DialogDescription>
            CSV or PDF from any bank. A PDF is sent to Google Gemini to be read. Duplicates are
            skipped.
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
            className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-sm file:border-0 file:bg-muted file:px-4 file:text-sm file:font-medium"
          />

          {text && headers.length > 0 && (
            <details open={!statement} className="rounded-lg bg-card p-3 text-sm">
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

          {text && statement && (
            <div className="space-y-2 rounded-lg bg-card p-3 text-xs text-muted-foreground">
              <p>
                {statement.preset ? `Read as a ${statement.preset} export. ` : ""}
                {statement.decimal &&
                  `Amounts use ${statement.decimal === "," ? "a decimal comma" : "a decimal point"}.`}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex items-center gap-2">
                  <span>Dates</span>
                  <select
                    aria-label="Date order"
                    value={statement.dateOrder}
                    onChange={(e) => setOption({ dateOrder: e.target.value as DateOrder })}
                    className={cn(field, "w-auto")}
                  >
                    <option value="DMY">Day first (31/12)</option>
                    <option value="MDY">Month first (12/31)</option>
                  </select>
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={options.invert ?? false}
                    onChange={(e) => setOption({ invert: e.target.checked })}
                  />
                  <span>Spending is written as positive</span>
                </label>
              </div>
            </div>
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
                <ul className="divide-y overflow-hidden rounded-lg bg-card text-sm">
                  {fresh.slice(0, 5).map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 truncate">
                        <span className="text-muted-foreground">{formatDay(r.date)} · </span>
                        {r.description}
                      </span>
                      <span
                        className={`font-figure whitespace-nowrap ${r.direction === "CRDT" ? "text-positive" : ""}`}
                      >
                        {r.direction === "CRDT" ? "+" : "−"}
                        {formatMoney(r.amount, r.currency ?? "EUR")}
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

          <Button
            onClick={() => void handleImport()}
            disabled={!fresh || fresh.length === 0 || importing}
            className="w-full"
          >
            {importing && <Loader2 className="size-4 animate-spin" />}
            {importing
              ? `Importing ${progress} of ${fresh?.length ?? 0}`
              : `Import${fresh && fresh.length > 0 ? ` ${fresh.length}` : ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
