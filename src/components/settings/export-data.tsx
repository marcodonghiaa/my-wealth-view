import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatISODate } from "@/lib/date";
import { buildZip, exportFileName } from "@/lib/export/build-zip";
import { ExportError, fetchAllTables } from "@/lib/export/fetch-all";

// A blob link click is the one download that iPhone Safari and desktop browsers all honor.
function saveZip(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ExportData() {
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleExport() {
    setError(null);
    setDone(false);
    setPending(true);
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) throw new Error("You're signed out. Sign in again, then retry.");
      const tables = await fetchAllTables(supabase, userId, (table, n, total) =>
        setProgress(`Reading ${table.replaceAll("_", " ")}: ${n} of ${total}`),
      );
      setProgress("Building the file…");
      const now = new Date();
      saveZip(buildZip(tables, now), exportFileName(formatISODate(now)));
      setDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "something went wrong";
      setError(
        err instanceof ExportError
          ? `Couldn't read ${err.table.replaceAll("_", " ")}: ${message}. Nothing was downloaded.`
          : `Export failed: ${message}. Nothing was downloaded.`,
      );
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  return (
    <section id="data" aria-labelledby="data-heading" className="scroll-mt-6">
      <h2 id="data-heading" className="mb-4 text-[0.9375rem] font-medium text-muted-foreground">
        Your data
      </h2>
      <div className="max-w-sm space-y-4 rounded-2xl border bg-card p-5">
        <div>
          <h3 className="text-[0.9375rem] font-medium text-foreground">Download my data</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            One zip with your transactions, accounts, holdings and net worth as spreadsheets, plus
            everything in full as data.json. It includes bank details such as IBANs and isn't
            encrypted, so keep it somewhere safe.
          </p>
        </div>
        {progress && (
          <p role="status" className="text-sm text-muted-foreground">
            {progress}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}
        {done && !pending && (
          <p role="status" className="text-sm text-positive">
            Downloaded.
          </p>
        )}
        <button
          type="button"
          onClick={handleExport}
          disabled={pending}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:brightness-110 disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Download my data
        </button>
      </div>
    </section>
  );
}
