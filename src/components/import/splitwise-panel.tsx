import { useEffect, useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MAX_CHARS } from "@/lib/import/parse-csv";
import { SplitwiseReview } from "@/components/import/splitwise-review";
import { balancesFromFile } from "@/lib/import/splitwise-balances";
import { classifyRows, summarize } from "@/lib/import/splitwise-classify";
import { groupNames, newGroupProblem, type StoredGroupRow } from "@/lib/import/splitwise-group";
import { fingerprintRows } from "@/lib/import/splitwise-match";
import { parseSplitwiseCsv, type SplitwiseFile } from "@/lib/import/splitwise-parse";
import { hasErrors, validateSplitwise, type Issue } from "@/lib/import/splitwise-validate";

const GROUP_MAX = 100;

const readError = (err: unknown) =>
  err instanceof Error ? err.message : "Could not read that file.";
const money = (cents: number) => (cents / 100).toFixed(2);
const NEW_GROUP = "__new__";
const STORED_LIMIT = 1000;

async function loadStored(): Promise<Array<StoredGroupRow>> {
  const { data, error } = await supabase
    .from("splitwise_expenses")
    .select("group_name, fingerprint")
    .limit(STORED_LIMIT);
  if (error) throw new Error(error.message);
  // A cut list could hide a group, which is what these checks rely on.
  if ((data ?? []).length >= STORED_LIMIT) {
    throw new Error("Too many stored expenses to choose a group safely.");
  }
  return data ?? [];
}

interface Loaded {
  file: SplitwiseFile;
  issues: Array<Issue>;
}

export function SplitwisePanel() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [stored, setStored] = useState<Array<StoredGroupRow> | null>(null);
  // An existing group, or NEW_GROUP; "" until chosen.
  const [choice, setChoice] = useState("");
  const [newName, setNewName] = useState("");
  // The name the review works with: it follows the input only when the user leaves the field.
  const [settledName, setSettledName] = useState("");
  const [me, setMe] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) return;
    let current = true;
    setStored(null);
    loadStored()
      .then((rows) => {
        if (!current) return;
        const names = groupNames(rows);
        setStored(rows);
        setChoice(names.length === 0 ? NEW_GROUP : names.length === 1 ? (names[0] ?? "") : "");
      })
      .catch((err: unknown) => {
        if (current) setError(readError(err));
      });
    return () => {
      current = false;
    };
  }, [loaded]);

  async function onFile(file: File | undefined) {
    setError(null);
    setMe(null);
    if (!file) return;
    try {
      if (file.size > MAX_CHARS)
        throw new Error("The file is too large (limit is 2 MB). Is it the right file?");
      const parsed = parseSplitwiseCsv(await file.text());
      setLoaded({ file: parsed, issues: validateSplitwise(parsed) });
      setNewName("");
      setSettledName("");
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
  const names = useMemo(() => groupNames(stored ?? []), [stored]);
  const isNew = choice === NEW_GROUP;
  const group = isNew ? settledName : choice;
  const groupProblem = useMemo(
    () =>
      isNew && classified && stored && settledName.trim() !== ""
        ? newGroupProblem(settledName, fingerprintRows(classified), stored)
        : null,
    [isNew, classified, stored, settledName],
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
              {stored && names.length > 0 && (
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">Group</span>
                  <select
                    value={choice}
                    onChange={(e) => setChoice(e.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-base focus:ring-2 focus:ring-ring focus:outline-none"
                  >
                    {choice === "" && <option value="">Choose…</option>}
                    {names.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    <option value={NEW_GROUP}>New group…</option>
                  </select>
                </label>
              )}
              {stored && isNew && (
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">New group name</span>
                  <input
                    value={newName}
                    maxLength={GROUP_MAX}
                    onChange={(e) => setNewName(e.target.value)}
                    onBlur={() => setSettledName(newName)}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-base focus:ring-2 focus:ring-ring focus:outline-none"
                  />
                </label>
              )}
              {groupProblem && (
                <p role="alert" className="text-sm text-negative">
                  {groupProblem}
                </p>
              )}
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
      {classified && stored && group.trim() !== "" && !groupProblem && (
        <SplitwiseReview
          rows={classified}
          group={group}
          balances={loaded && me !== null ? balancesFromFile(loaded.file, me) : null}
        />
      )}
    </div>
  );
}
