import { useEffect, useMemo, useState } from "react";
import { Check, FileUp, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MAX_CHARS } from "@/lib/import/parse-csv";
import { SplitwiseReview, type ImportDone } from "@/components/import/splitwise-review";
import { CTA, Group, LINK, Steps } from "@/components/import/splitwise-ui";
import { money as amount } from "@/lib/import/splitwise-format";
import { balancesFromFile } from "@/lib/import/splitwise-balances";
import { classifyRows, summarize } from "@/lib/import/splitwise-classify";
import { groupNames, newGroupProblem, type StoredGroupRow } from "@/lib/import/splitwise-group";
import { fingerprintRows } from "@/lib/import/splitwise-match";
import { parseSplitwiseCsv, type SplitwiseFile } from "@/lib/import/splitwise-parse";
import { hasErrors, validateSplitwise, type Issue } from "@/lib/import/splitwise-validate";

const GROUP_MAX = 100;

const readError = (err: unknown) =>
  err instanceof Error ? err.message : "Could not read that file.";
const NEW_GROUP = "__new__";
const STORED_LIMIT = 1000;

async function loadStored(): Promise<Array<StoredGroupRow>> {
  const { data, error } = await supabase
    .from("splitwise_expenses")
    .select("group_name, fingerprint")
    .limit(STORED_LIMIT);
  if (error) throw new Error(error.message);
  // A cut list could hide a group, which is what these checks rely on.
  // ponytail: refuses at 1000 rows across groups, page through them if an install gets there.
  if ((data ?? []).length >= STORED_LIMIT) {
    throw new Error("Too many stored expenses to choose a group safely.");
  }
  return data ?? [];
}

interface Loaded {
  name: string;
  file: SplitwiseFile;
  issues: Array<Issue>;
}

export function SplitwisePanel({
  onClose,
  onDone,
}: {
  onClose: () => void;
  /** After a successful import: the page closes the flow and offers Undo. */
  onDone?: (done: ImportDone) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState<"file" | "review">("file");
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
    setStep("file");
    setMe(null);
    if (!file) return;
    try {
      if (file.size > MAX_CHARS)
        throw new Error("The file is too large (limit is 2 MB). Is it the right file?");
      const parsed = parseSplitwiseCsv(await file.text());
      setMe(null);
      setLoaded({ name: file.name, file: parsed, issues: validateSplitwise(parsed) });
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
  // The identity saved with this group's balances, when it is in this file.
  useEffect(() => {
    if (!loaded || isNew || group === "") return;
    let current = true;
    void supabase
      .from("splitwise_balances")
      .select("person")
      .eq("group_name", group)
      .eq("is_me", true)
      .then(({ data }) => {
        const person = data?.[0]?.person;
        const columns = loaded.file.members.flatMap((m, i) => (m === person ? [i] : []));
        if (current && columns.length === 1) setMe((m) => m ?? (columns[0] as number));
      });
    return () => {
      current = false;
    };
  }, [loaded, isNew, group]);

  const ready = classified && stored && group.trim() !== "" && !groupProblem;
  const summary = useMemo(() => (classified ? summarize(classified) : null), [classified]);
  const currency = loaded?.file.rows[0]?.currency ?? "";

  if (step === "review" && ready) {
    return (
      <SplitwiseReview
        rows={classified}
        group={group}
        balances={loaded && me !== null ? balancesFromFile(loaded.file, me) : null}
        onImported={(done) => {
          // The group now exists, so it is no longer new, and the checks must see its rows.
          setChoice(group);
          void loadStored().then(setStored, (err: unknown) => setError(readError(err)));
          onDone?.(done);
        }}
        onBack={() => setStep("file")}
        onClose={onClose}
      />
    );
  }

  const select =
    "min-w-0 max-w-[60%] appearance-none truncate rounded-md bg-transparent bg-[length:14px] bg-[right_center] bg-no-repeat pr-5 text-right text-[0.9375rem] text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
  const row = "flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 text-[0.9375rem]";
  const chevrons = {
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='m8 9 4-4 4 4M8 15l4 4 4-4'/%3E%3C/svg%3E\")",
  };
  const fileInput = (
    <input
      type="file"
      accept=".csv,text/csv"
      className="sr-only"
      onChange={(e) => {
        void onFile(e.target.files?.[0]);
        // The same file can be chosen again after Change.
        e.target.value = "";
      }}
    />
  );

  return (
    <div className="space-y-7">
      <header className="space-y-5">
        <Steps current={1} />
        <div>
          <h2 className="text-[1.75rem] leading-tight font-semibold tracking-tight">
            Import from Splitwise
          </h2>
          <p className="mt-1 text-[0.9375rem] text-muted-foreground">
            Bring in your share of group expenses.
          </p>
        </div>
      </header>

      {loaded ? (
        <div className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
          <span
            aria-hidden
            className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full ${
              blocked ? "bg-negative/15 text-negative" : "bg-positive/15 text-positive"
            }`}
          >
            <Check className="size-5" strokeWidth={2.5} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.9375rem] font-semibold">{loaded.name}</span>
            <span className="block text-[0.8125rem] text-muted-foreground">
              {loaded.file.rows.length} rows{currency ? ` · ${currency}` : ""}
            </span>
          </span>
          <label className={`${LINK} cursor-pointer`}>
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
            void onFile(e.dataTransfer.files[0]);
          }}
          className={`flex cursor-pointer flex-col items-center rounded-3xl bg-card px-6 py-10 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring hover:bg-card/80 ${
            dragging ? "ring-2 ring-primary" : ""
          }`}
        >
          <span
            aria-hidden
            className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-foreground/[0.07]"
          >
            <FileUp className="size-6" strokeWidth={1.8} />
          </span>
          <span className="text-[1.0625rem] font-semibold">Choose CSV file</span>
          <span className="mt-1 text-sm text-muted-foreground">or drop it here</span>
          {fileInput}
        </label>
      )}
      {error && (
        <p role="alert" className="-mt-4 px-4 text-sm text-negative">
          {error}
        </p>
      )}

      {!loaded && (
        <Group
          label="How to get the file"
          footer={
            <span className="flex items-center gap-1.5">
              <Lock aria-hidden className="size-3.5" />
              Read on your device. Nothing is uploaded yet.
            </span>
          }
        >
          <ol className="divide-y divide-border">
            {[
              "Open the group in Splitwise",
              "Settings › Export as spreadsheet",
              "Pick the file here",
            ].map((text, i) => (
              <li key={text} className={`${row} justify-start`}>
                <span
                  aria-hidden
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-semibold"
                >
                  {i + 1}
                </span>
                {text}
              </li>
            ))}
          </ol>
        </Group>
      )}

      {loaded && loaded.issues.length > 0 && (
        <ul className="space-y-1 px-4 text-sm">
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
      {loaded && blocked && (
        <p className="px-4 text-sm text-negative">
          This file has errors, so it cannot be imported. Export it again from Splitwise.
        </p>
      )}

      {loaded && !blocked && (
        <Group label="Import into">
          {stored && names.length > 0 && (
            <label className={row}>
              <span>Group</span>
              <select
                aria-label="Group"
                value={choice}
                style={chevrons}
                onChange={(e) => {
                  // Who you are depends on the group; it is read again for this one.
                  setMe(null);
                  setChoice(e.target.value);
                }}
                className={select}
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
            <label className={row}>
              <span className="shrink-0">New group name</span>
              <input
                aria-label="New group name"
                value={newName}
                maxLength={GROUP_MAX}
                placeholder="e.g. Lisbon trip"
                onChange={(e) => setNewName(e.target.value)}
                onBlur={() => setSettledName(newName.trim())}
                className="min-w-0 flex-1 bg-transparent text-right text-[0.9375rem] placeholder:text-muted-foreground/60 focus-visible:outline-none"
              />
            </label>
          )}
          <label className={row}>
            <span>You are</span>
            <select
              aria-label="Which one are you?"
              value={me ?? ""}
              style={chevrons}
              onChange={(e) => setMe(e.target.value === "" ? null : Number(e.target.value))}
              className={select}
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
        </Group>
      )}
      {groupProblem && (
        <p role="alert" className="-mt-4 px-4 text-sm text-negative">
          {groupProblem}
        </p>
      )}

      {summary && (
        <Group label="In this file">
          <dl className="divide-y divide-border font-figure">
            {[
              [
                `Paid by others · ${summary.paidByOther.count}`,
                `your share ${amount(summary.paidByOther.shareCents, currency)}`,
              ],
              [
                `Paid by you · ${summary.paidByMe.count}`,
                `your share ${amount(summary.paidByMe.shareCents, currency)} of ${amount(summary.paidByMe.costCents, currency)}`,
              ],
              [
                "Settle-ups",
                `paid ${amount(summary.settledOutCents, currency)} · got ${amount(summary.settledInCents, currency)}`,
              ],
              ["Not involving you", String(summary.notInvolved.count)],
              ...(summary.unclear.count > 0
                ? [["Several payers, left out", String(summary.unclear.count)]]
                : []),
              ...(summary.refunds.count > 0
                ? [["Refunds, left out", String(summary.refunds.count)]]
                : []),
            ].map(([label, value]) => (
              <div key={label} className={row}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right">{value}</dd>
              </div>
            ))}
          </dl>
        </Group>
      )}

      {loaded && !blocked && (
        // Once there is a file, the button says what is still missing instead of just greying out.
        <button type="button" className={CTA} disabled={!ready} onClick={() => setStep("review")}>
          {ready
            ? "Continue"
            : group.trim() === ""
              ? isNew
                ? "Name the group to continue"
                : "Choose a group to continue"
              : me === null
                ? "Choose who you are to continue"
                : "Continue"}
        </button>
      )}
    </div>
  );
}
