import { useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { MAX_CHARS } from "@/lib/import/parse-csv";
import { SplitwiseReview } from "@/components/import/splitwise-review";
import { classifyRows, summarize } from "@/lib/import/splitwise-classify";
import { parseSplitwiseCsv, type SplitwiseFile } from "@/lib/import/splitwise-parse";
import { hasErrors, validateSplitwise, type Issue } from "@/lib/import/splitwise-validate";

const GROUP_MAX = 100;

const readError = (err: unknown) =>
  err instanceof Error ? err.message : "Could not read that file.";
const money = (cents: number) => (cents / 100).toFixed(2);
// "berkeley_2026-10-18_export.csv" -> "berkeley"
const groupFromFileName = (name: string) =>
  name
    .replace(/\.csv$/i, "")
    .replace(/_?\d{4}-\d{2}-\d{2}_export$/i, "")
    .replace(/_export$/i, "")
    .replace(/_/g, " ")
    .trim()
    .slice(0, GROUP_MAX);

interface Loaded {
  file: SplitwiseFile;
  issues: Array<Issue>;
}

export function SplitwisePanel() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [group, setGroup] = useState("");
  // The name the review works with: it follows the input only when the user leaves the field.
  const [settledGroup, setSettledGroup] = useState("");
  const [me, setMe] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    setError(null);
    setMe(null);
    if (!file) return;
    try {
      if (file.size > MAX_CHARS)
        throw new Error("The file is too large (limit is 2 MB). Is it the right file?");
      const parsed = parseSplitwiseCsv(await file.text());
      setLoaded({ file: parsed, issues: validateSplitwise(parsed) });
      const name = groupFromFileName(file.name);
      setGroup(name);
      setSettledGroup(name);
    } catch (err) {
      setLoaded(null);
      setError(readError(err));
    }
  }

  const blocked = loaded ? hasErrors(loaded.issues) : false;
  const classified = useMemo(
    () => (loaded && me !== null && !blocked ? classifyRows(loaded.file, me) : null),
    [loaded, me, blocked],
  );
  const summary = useMemo(() => (classified ? summarize(classified) : null), [classified]);
  const currency = loaded?.file.rows[0]?.currency ?? "";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-5 card-ring">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
          <Upload className="size-4 text-primary" />
          Choose a Splitwise CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
        <p className="mt-1 text-sm text-muted-foreground">
          In Splitwise: open the group, Settings, Export as spreadsheet. The file is read in your
          browser and nothing is uploaded at this step.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-negative">
            {error}
          </p>
        )}
      </div>

      {loaded && (
        <div className="space-y-4 rounded-2xl border bg-card p-5 card-ring">
          {loaded.issues.length > 0 && (
            <ul className="space-y-1 text-sm">
              {loaded.issues.map((issue, i) => (
                <li
                  key={i}
                  role={issue.level === "error" ? "alert" : undefined}
                  className={issue.level === "error" ? "text-negative" : "text-muted-foreground"}
                >
                  {issue.level === "error" ? "Error: " : "Warning: "}
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
          {blocked ? (
            <p className="text-sm text-negative">
              This file has errors, so it cannot be imported. Export it again from Splitwise.
            </p>
          ) : (
            <>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Group name</span>
                <input
                  value={group}
                  maxLength={GROUP_MAX}
                  onChange={(e) => setGroup(e.target.value)}
                  onBlur={() => setSettledGroup(group)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-base focus:ring-2 focus:ring-ring focus:outline-none"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Which one are you?</span>
                <select
                  value={me ?? ""}
                  onChange={(e) => setMe(e.target.value === "" ? null : Number(e.target.value))}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-base focus:ring-2 focus:ring-ring focus:outline-none"
                >
                  <option value="">Choose…</option>
                  {loaded.file.members.map((name, i) => (
                    <option key={i} value={i}>
                      {loaded.file.members.filter((m) => m === name).length > 1
                        ? `${name} (column ${i + 1})`
                        : name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
      )}

      {summary && (
        <div className="rounded-2xl border bg-card p-5 text-sm card-ring">
          <h2 className="mb-2 font-semibold">What this file says about you</h2>
          <ul className="space-y-1 font-figure">
            <li>
              {summary.paidByOther.count} paid by others, your share{" "}
              {money(summary.paidByOther.shareCents)} {currency}
            </li>
            <li>
              {summary.paidByMe.count} paid by you (total {money(summary.paidByMe.costCents)}{" "}
              {currency}), your share {money(summary.paidByMe.shareCents)} {currency}
            </li>
            <li>{summary.notInvolved.count} do not involve you</li>
            {summary.unclear.count > 0 && (
              <li>{summary.unclear.count} unclear (several payers), left out</li>
            )}
            {summary.refunds.count > 0 && <li>{summary.refunds.count} refunds, left out</li>}
            <li>
              You paid back {money(summary.settledOutCents)} {currency}, you received{" "}
              {money(summary.settledInCents)} {currency}
            </li>
          </ul>
        </div>
      )}
      {classified && settledGroup.trim() !== "" && (
        <SplitwiseReview rows={classified} group={settledGroup} />
      )}
    </div>
  );
}
