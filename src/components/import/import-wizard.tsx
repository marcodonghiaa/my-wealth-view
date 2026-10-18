import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { SegmentedControl } from "@/components/segmented-control";
import { supabase } from "@/integrations/supabase/client";
import { runImport, undoImport, type ImportKind, type Writer } from "@/lib/import/commit";
import {
  browserStorage,
  clearLastImport,
  loadLastImport,
  refreshKeys,
  saveLastImport,
  type LastImport,
} from "@/lib/import/last-import";
import { guessColumns, type Role } from "@/lib/import/guess-columns";
import { MAX_CHARS, parseCsv, type ParsedCsv } from "@/lib/import/parse-csv";
import { planNetWorth, planSpend } from "@/lib/import/plan";

const KINDS: Array<{ value: ImportKind; label: string }> = [
  { value: "net_worth", label: "Net worth by month" },
  { value: "spend", label: "Spending by month" },
];

const ROLES_BY_KIND: Record<ImportKind, Array<{ role: Role; label: string; required: boolean }>> = {
  net_worth: [
    { role: "month", label: "Month", required: true },
    { role: "total", label: "Total", required: false },
    { role: "stocks", label: "Stocks", required: false },
    { role: "bonds", label: "Bonds", required: false },
    { role: "crypto", label: "Crypto", required: false },
    { role: "cash", label: "Cash", required: false },
  ],
  spend: [
    { role: "month", label: "Month", required: true },
    { role: "category", label: "Category", required: false },
    { role: "amount", label: "Amount (EUR)", required: true },
    { role: "currency", label: "Currency", required: false },
  ],
};

const PREVIEW_ROWS = 5;
const SKIPPED_SHOWN = 5;
const BUTTON =
  "inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50";

function fileError(err: unknown) {
  return err instanceof Error ? err.message : "Could not read that file.";
}

export function ImportWizard() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ImportKind>("net_worth");
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Record<Role, number | null> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [last, setLast] = useState<LastImport | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);
  // Undo survives leaving the page: the last import is remembered per user and kind.
  useEffect(() => {
    setLast(userId ? loadLastImport(browserStorage(), userId, kind) : null);
  }, [userId, kind]);

  const refresh = (k: ImportKind) =>
    Promise.all(refreshKeys(k).map((queryKey) => queryClient.invalidateQueries({ queryKey })));

  const plan = useMemo(() => {
    if (!csv || !mapping) return null;
    return kind === "net_worth" ? planNetWorth(csv.rows, mapping) : planSpend(csv.rows, mapping);
  }, [csv, mapping, kind]);

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    try {
      // Check the size before reading it all into memory.
      if (file.size > MAX_CHARS)
        throw new Error("The file is too large (limit is 2 MB). Is it the right file?");
      const parsed = parseCsv(await file.text());
      setCsv(parsed);
      setMapping(guessColumns(parsed.headers));
    } catch (err) {
      setCsv(null);
      setMapping(null);
      setError(fileError(err));
    }
  }

  const importRows = useMutation({
    mutationFn: async () => {
      if (!plan) throw new Error("Choose a file first.");
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user) throw new Error("You are signed out. Sign in again.");
      const batchId = await runImport(supabase as unknown as Writer, kind, data.user.id, plan.rows);
      return { batchId, count: plan.rows.length, kind, userId: data.user.id };
    },
    onSuccess: ({ batchId, count, kind: importedKind, userId: owner }) => {
      const entry = { batchId, count };
      saveLastImport(browserStorage(), owner, importedKind, entry);
      setLast(entry);
      void refresh(importedKind);
      toast.success(`Imported ${count} rows`);
    },
    onError: (err) => toast.error(fileError(err)),
  });

  const undo = useMutation({
    mutationFn: async () => {
      if (!last || !userId) return;
      await undoImport(supabase as unknown as Writer, kind, userId, last.batchId);
    },
    onSuccess: () => {
      if (userId) clearLastImport(browserStorage(), userId, kind);
      setLast(null);
      void refresh(kind);
      toast.success("Import removed");
    },
    onError: (err) => toast.error(fileError(err)),
  });

  const roles = ROLES_BY_KIND[kind];
  const missing = mapping ? roles.filter((r) => r.required && mapping[r.role] === null) : [];

  return (
    <div className="space-y-6">
      <SegmentedControl
        label="What are you importing?"
        options={KINDS}
        value={kind}
        onChange={setKind}
      />

      <div className="rounded-2xl border bg-card p-5 card-ring">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
          <Upload className="size-4 text-primary" />
          Choose a CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
        <p className="mt-1 text-sm text-muted-foreground">
          In Excel: File, Save As, CSV. The file is read in your browser and nothing is uploaded
          until you press Import. Amounts are read as EUR.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-negative">
            {error}
          </p>
        )}
      </div>

      {csv && mapping && (
        <div className="rounded-2xl border bg-card p-5 card-ring">
          <h2 className="mb-3 text-sm font-semibold">Which column is which?</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {roles.map(({ role, label, required }) => (
              <label key={role} className="text-sm">
                <span className="mb-1 block text-muted-foreground">
                  {label}
                  {required ? " (required)" : ""}
                </span>
                <select
                  value={mapping[role] ?? ""}
                  onChange={(e) =>
                    setMapping({
                      ...mapping,
                      [role]: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border bg-background px-3 py-2 text-base focus:ring-2 focus:ring-ring focus:outline-none"
                >
                  <option value="">Not in my file</option>
                  {csv.headers.map((header, index) => (
                    <option key={index} value={index}>
                      {header || `Column ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      {plan && (
        <div className="rounded-2xl border bg-card p-5 card-ring">
          <h2 className="mb-1 text-sm font-semibold">Check before importing</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            {plan.rows.length} rows ready, {plan.skipped.length} skipped. Importing again overwrites
            months that already exist.
          </p>
          {missing.length > 0 && (
            <p role="alert" className="mb-3 text-sm text-negative">
              Choose a column for: {missing.map((m) => m.label).join(", ")}.
            </p>
          )}
          {plan.rows.length > 0 && (
            <ul className="mb-3 space-y-1 font-figure text-sm">
              {plan.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                <li key={i}>{Object.values(row).join("  ·  ")}</li>
              ))}
            </ul>
          )}
          {plan.skipped.length > 0 && (
            <details className="mb-3 text-sm text-muted-foreground">
              <summary className="cursor-pointer">Skipped rows</summary>
              <ul className="mt-1 space-y-0.5">
                {plan.skipped.slice(0, SKIPPED_SHOWN).map((s, i) => (
                  <li key={i}>
                    Line {s.line}: {s.reason}
                  </li>
                ))}
                {plan.skipped.length > SKIPPED_SHOWN && (
                  <li>and {plan.skipped.length - SKIPPED_SHOWN} more</li>
                )}
              </ul>
            </details>
          )}
          <button
            type="button"
            className={BUTTON}
            disabled={plan.rows.length === 0 || importRows.isPending}
            onClick={() => importRows.mutate()}
          >
            {importRows.isPending && <Loader2 className="size-4 animate-spin" />}
            Import {plan.rows.length} rows
          </button>
        </div>
      )}

      {last && (
        <div role="status" className="rounded-2xl border bg-card p-5 text-sm card-ring">
          Last import: {last.count} rows. Undo removes them, but values they replaced are not
          restored.
          <div className="mt-3">
            <button
              type="button"
              className={BUTTON}
              disabled={undo.isPending}
              onClick={() => undo.mutate()}
            >
              {undo.isPending && <Loader2 className="size-4 animate-spin" />}
              Undo this import
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
