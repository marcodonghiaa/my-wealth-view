import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CategoryTable } from "@/components/import/splitwise-category-table";
import type { ClassifiedRow } from "@/lib/import/splitwise-classify";
import { refreshKeys } from "@/lib/import/last-import";
import {
  runSplitwiseImport,
  undoSplitwiseImport,
  type RpcClient,
} from "@/lib/import/splitwise-commit";
import { fingerprintRows, matchBank, type BankTx } from "@/lib/import/splitwise-match";
import { saveBalances, type FileBalances } from "@/lib/import/splitwise-balances";
import { SplitwiseCorrections } from "@/components/import/splitwise-corrections";
import { isShareRow, type StoredShare } from "@/lib/import/splitwise-corrections";
import { planWrite, splitAtCheckpoint } from "@/lib/import/splitwise-plan";
import { categorizeRow, ruleTextFor, type UserRule } from "@/lib/import/splitwise-categorize";
import { defaultSelection, makeRate, toBankTx, type FxRow } from "@/lib/import/splitwise-review";

// Bank rows are read from 30 days before the first expense (late-entered ones) to a week after
// the last one. The database returns at most 1000 rows per call, so more than that is refused.
const DAYS_BEFORE = 30;
const DAYS_AFTER = 7;
const FX_DAYS_BEFORE = 14;
const PAGE_LIMIT = 1000;

const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const BUTTON =
  "inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50";
const SECONDARY =
  "inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50";
const money = (cents: number) => (cents / 100).toFixed(2);

const expenses = (n: number) => (n === 1 ? "1 expense" : `${n} expenses`);

/** "113.45 USD", or one amount per currency: shares are never added across currencies. */
function sharesTotal(shares: Array<{ amount: number; currency: string }>): string {
  const totals = new Map<string, number>();
  for (const s of shares) totals.set(s.currency, (totals.get(s.currency) ?? 0) + s.amount);
  return [...totals].map(([currency, amount]) => `${amount.toFixed(2)} ${currency}`).join(", ");
}

interface Loaded {
  bank: Array<BankTx>;
  fx: Array<FxRow>;
  stored: Array<StoredShare>;
  rules: Array<UserRule>;
}

async function load(rows: Array<ClassifiedRow>, group: string): Promise<Loaded> {
  const dates = rows.map((r) => r.date).sort();
  const first = dates[0] ?? "";
  const last = dates[dates.length - 1] ?? "";
  const currencies = [...new Set(rows.map((r) => r.currency))].filter((c) => c !== "EUR");

  const [bank, fx, stored, rules] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "account_uid, entry_reference, booking_date, amount, currency, credit_debit_indicator, personal_amount, flow_type, deleted_at",
      )
      .gte("booking_date", addDays(first, -DAYS_BEFORE))
      .lte("booking_date", addDays(last, DAYS_AFTER))
      .limit(PAGE_LIMIT),
    currencies.length === 0
      ? Promise.resolve({ data: [] as Array<FxRow>, error: null })
      : supabase
          .from("fx_rates")
          .select("currency, date, rate_to_eur")
          .in("currency", currencies)
          .gte("date", addDays(first, -FX_DAYS_BEFORE))
          .lte("date", last)
          .limit(PAGE_LIMIT),
    supabase
      .from("splitwise_expenses")
      .select(
        "id, fingerprint, booking_date, description, amount, currency, linked_entry_reference",
      )
      .eq("group_name", group)
      .limit(PAGE_LIMIT),
    supabase
      .from("category_rules")
      .select("match_text, set_category, priority")
      .order("priority", { ascending: true }),
  ]);

  const failed = bank.error ?? fx.error ?? stored.error ?? rules.error;
  if (failed) throw new Error(failed.message);
  if ((bank.data ?? []).length >= PAGE_LIMIT || (fx.data ?? []).length >= PAGE_LIMIT) {
    throw new Error("Too many bank transactions in these dates to review safely.");
  }
  // A cut list could hide the newest date, and the checkpoint is what protects older rows.
  if ((stored.data ?? []).length >= PAGE_LIMIT) {
    throw new Error("Too many stored expenses in this group to review safely.");
  }
  return {
    bank: (bank.data ?? []).flatMap((r) => toBankTx(r) ?? []),
    fx: fx.data ?? [],
    rules: rules.data ?? [],
    stored: stored.data ?? [],
  };
}

export function SplitwiseReview({
  rows,
  group,
  balances = null,
  onImported,
  onBack,
  onClose,
}: {
  rows: Array<ClassifiedRow>;
  group: string;
  balances?: FileBalances | null;
  onImported?: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Category changes made by hand (null = cleared), and rules saved during this review.
  const [picked, setPicked] = useState<Map<number, string | null>>(new Map());
  const [extraRules, setExtraRules] = useState<Array<UserRule>>([]);
  const [remembered, setRemembered] = useState<Set<number>>(new Set());
  // What the user changed by hand; everything else follows the default (sure matches ticked).
  const [manualTicks, setChoices] = useState<Map<number, boolean>>(new Map());
  // For each expense I paid with no bank match: count my share (true) or leave it out (false).
  const [unmatchedChoices, setUnmatchedChoices] = useState<Map<number, boolean>>(new Map());
  const [view, setView] = useState<"review" | "confirm" | "done">("review");
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  // Undo is offered only for the import just made here.
  const [last, setLast] = useState<{ batchId: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);
  const refresh = () =>
    Promise.all(
      refreshKeys("splitwise").map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );

  // A new file starts over; a reload after a write keeps the screen up while it reads.
  const [reloads, setReloads] = useState(0);
  const reload = () => setReloads((n) => n + 1);
  useEffect(() => {
    setLoaded(null);
  }, [rows, group]);
  useEffect(() => {
    let current = true;
    setLoadError(null);
    load(rows, group.trim())
      .then((data) => current && setLoaded(data))
      .catch((err: unknown) => {
        if (current) setLoadError(err instanceof Error ? err.message : "Could not read your bank.");
      });
    return () => {
      current = false;
    };
  }, [rows, group, reloads]);

  const fingerprints = useMemo(() => fingerprintRows(rows), [rows]);
  const split = useMemo(
    () => splitAtCheckpoint(rows, fingerprints, loaded?.stored ?? []),
    [rows, fingerprints, loaded],
  );
  const rate = useMemo(() => makeRate(loaded?.fx ?? []), [loaded]);
  const matches = useMemo(
    () => (loaded ? matchBank(split.rows, loaded.bank, rate) : []),
    [loaded, split, rate],
  );
  const ticked = useMemo(() => {
    const picked = defaultSelection(matches);
    for (const [row, on] of manualTicks) {
      if (on) picked.add(row);
      else picked.delete(row);
    }
    return picked;
  }, [matches, manualTicks]);

  // Only expenses that become a share need a category.
  const categorised = useMemo(() => split.rows.filter(isShareRow), [split]);
  const rules = useMemo(() => [...(loaded?.rules ?? []), ...extraRules], [loaded, extraRules]);
  const categoryOf = useMemo(
    () =>
      new Map(
        categorised.map((r) => [
          r.row,
          picked.has(r.row) ? (picked.get(r.row) ?? null) : categorizeRow(r, rules).category,
        ]),
      ),
    [categorised, picked, rules],
  );
  const uncategorised = [...categoryOf.values()].filter((c) => c === null).length;

  const confirmed = matches.filter((m) => ticked.has(m.row));
  const plan = useMemo(
    () =>
      loaded
        ? planWrite({
            group,
            rows,
            fingerprints,
            confirmed: matches.filter((m) => ticked.has(m.row)),
            stored: loaded.stored,
            countedRows: new Set(
              [...unmatchedChoices].filter(([, counted]) => counted).map(([row]) => row),
            ),
            categoryFor: (row) => categoryOf.get(row.row) ?? null,
            rate,
          })
        : null,
    [loaded, group, rows, fingerprints, matches, ticked, unmatchedChoices, categoryOf, rate],
  );

  const rememberRule = useMutation({
    mutationFn: async ({ row, category }: { row: ClassifiedRow; category: string }) => {
      if (!userId) throw new Error("You are signed out. Sign in again.");
      const rule = {
        match_text: ruleTextFor(row.description),
        set_category: category,
        priority: 100,
      };
      const { error } = await supabase
        .from("category_rules")
        .insert({ ...rule, match_field: "any", user_id: userId });
      if (error) throw new Error(error.message);
      return { row: row.row, rule };
    },
    onSuccess: ({ row, rule }) => {
      setExtraRules([...extraRules, rule]);
      setRemembered(new Set(remembered).add(row));
      void queryClient.invalidateQueries({ queryKey: ["category-rules"] });
    },
  });

  const importShares = useMutation({
    mutationFn: async () => {
      if (!plan || !userId) throw new Error("You are signed out. Sign in again.");
      const client = supabase as unknown as RpcClient;
      const result = await runSplitwiseImport(client, plan);
      // The shares are already written; a failure here must not hide that.
      let balancesError: string | null = null;
      if (balances) {
        try {
          await saveBalances(client, group, balances);
        } catch (err) {
          balancesError = err instanceof Error ? err.message : "unknown error";
        }
      }
      return { ...result, balancesError };
    },
    onSuccess: ({ batchId, shares, links, balancesError }) => {
      setLast({ batchId });
      setView("done");
      onImported?.();
      setDone(
        `Imported ${shares} shares and updated ${links} bank transactions.` +
          (balancesError
            ? ` The friends' balances were not saved (${balancesError}); import again to retry.`
            : ""),
      );
      reload();
      void refresh();
    },
  });

  const undo = useMutation({
    mutationFn: async () => {
      if (!last) return;
      await undoSplitwiseImport(supabase as unknown as RpcClient, last.batchId);
    },
    onSuccess: () => {
      setLast(null);
      setDone("Import removed. Nothing from it is left.");
      importShares.reset();
      reload();
      void refresh();
    },
  });

  const byRow = new Map(rows.map((r) => [r.row, r]));
  const bankByKey = new Map(
    (loaded?.bank ?? []).map((t) => [`${t.accountUid}|${t.entryReference}`, t]),
  );
  // An unticked match is not a link, so that expense counts as not in the bank.
  const linkedRows = new Set(confirmed.map((m) => m.row));
  const unmatched = split.rows.filter(
    (r) => r.kind === "paid_by_me" && isShareRow(r) && !linkedRows.has(r.row),
  );
  const nothingToWrite = plan?.shares.length === 0 && plan.links.length === 0;

  if (loadError)
    return (
      <p role="alert" className="text-sm text-negative">
        {loadError}
      </p>
    );
  if (!loaded || !plan)
    return <p className="text-sm text-muted-foreground">Reading your bank transactions…</p>;

  const suggested = new Set(matches.map((m) => m.row));
  const noSuggestion = unmatched.filter((r) => !suggested.has(r.row));
  const countChoice = (r: ClassifiedRow) => (
    <fieldset aria-label={`What to do with ${r.description}`}>
      <div className="flex flex-wrap gap-x-4">
        {[
          { label: "Count my share", value: true },
          { label: "Leave out", value: false },
        ].map((o) => (
          <label key={o.label} className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name={`unmatched-${r.row}`}
              checked={unmatchedChoices.get(r.row) === o.value}
              onChange={() => setUnmatchedChoices(new Map(unmatchedChoices).set(r.row, o.value))}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
  const undecided = unmatched.filter((r) => !unmatchedChoices.has(r.row)).length;
  const total = sharesTotal(plan.shares);
  const headline = nothingToWrite
    ? split.checkpoint
      ? "Nothing new since your last import. Nothing will be written."
      : "Nothing to import yet."
    : split.checkpoint
      ? `${plan.shares.length === 1 ? "1 new expense" : `${plan.shares.length} new expenses`} since ${split.checkpoint}: ${total}.`
      : `${expenses(plan.shares.length)} to import: ${total}.`;
  const bankPart =
    plan.links.length === 0
      ? ""
      : ` and update ${plan.links.length === 1 ? "1 bank transaction" : `${plan.links.length} bank transactions`}`;

  if (view === "done")
    return (
      <div className="space-y-4 text-sm">
        <h2 className="text-base font-semibold">Step 3 of 3: Done</h2>
        {done && <p role="status">{done}</p>}
        {last && (
          <p className="text-muted-foreground">
            Undo removes this import and puts the bank transactions it changed back. It is offered
            only here; earlier imports are not touched.
          </p>
        )}
        {undo.error && (
          <p role="alert" className="text-negative">
            Undo failed: {undo.error.message}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BUTTON} onClick={onClose}>
            Close
          </button>
          {last && (
            <button
              type="button"
              className={SECONDARY}
              disabled={undo.isPending}
              onClick={() => undo.mutate()}
            >
              {undo.isPending && <Loader2 className="size-4 animate-spin" />}
              Undo this import
            </button>
          )}
        </div>
      </div>
    );

  if (view === "confirm")
    return (
      <div className="space-y-4 text-sm">
        <h2 className="text-base font-semibold">Step 3 of 3: Confirm</h2>
        <p>
          Import {expenses(plan.shares.length)} ({total}) into {group.trim()}
          {bankPart}.
        </p>
        {importShares.error && (
          <p role="alert" className="text-negative">
            Import failed: {importShares.error.message}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={BUTTON}
            disabled={!userId || importShares.isPending}
            onClick={() => importShares.mutate()}
          >
            {importShares.isPending && <Loader2 className="size-4 animate-spin" />}
            Import {expenses(plan.shares.length)}
          </button>
          <button
            type="button"
            className={SECONDARY}
            disabled={importShares.isPending}
            onClick={() => setView("review")}
          >
            Back
          </button>
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <h2 className="mb-1 text-base font-semibold">Step 2 of 3: Review</h2>
        <p className="text-base" role={nothingToWrite ? "status" : undefined}>
          {headline}
        </p>
        {done && (
          <p role="status" className="mt-1">
            {done}
          </p>
        )}
        {split.checkpoint && (
          <p className="mt-1 text-muted-foreground">
            Your last import goes up to {split.checkpoint}. Everything already imported stays as it
            is.
          </p>
        )}
      </div>

      {noSuggestion.length > 0 && (
        <div className="rounded-2xl border bg-card p-5 text-sm card-ring">
          <h3 className="mb-1 font-semibold">Expenses you paid that are not in your bank</h3>
          <p className="mb-3 text-muted-foreground">
            Paid by cash or a card not connected here? Count your share. Left out, one dated before
            this import's newest expense shows under Added late next time.
          </p>
          <ul className="space-y-3">
            {noSuggestion.map((r) => (
              <li key={r.row}>
                <p>
                  {r.date} {r.description}: your share {money(r.shareCents ?? 0)} {r.currency}
                </p>
                {countChoice(r)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {matches.length > 0 && (
        <div className="rounded-2xl border bg-card p-5 text-sm card-ring">
          <h3 className="mb-1 font-semibold">Matches with your bank</h3>
          <p className="mb-3 text-muted-foreground">
            These look like a bank transaction you already have. Tick the ones that are right.
            Unsure ones start unticked.
          </p>
          <ul className="space-y-2">
            {matches.map((m) => {
              const row = byRow.get(m.row);
              const tx = bankByKey.get(`${m.accountUid}|${m.entryReference}`);
              if (!row || !tx) return null;
              return (
                <li key={m.row}>
                  <label className="flex min-h-11 items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={ticked.has(m.row)}
                      onChange={(e) => {
                        setChoices(new Map(manualTicks).set(m.row, e.target.checked));
                      }}
                    />
                    <span>
                      {row.date} {row.description} ({money(row.costCents)} {row.currency}) matches
                      the bank on {tx.bookingDate}: {money(tx.amountCents)} {tx.currency}
                      {m.confidence === "ambiguous" && (
                        <span className="text-muted-foreground"> (not sure)</span>
                      )}
                    </span>
                  </label>
                  {!ticked.has(m.row) && row.kind === "paid_by_me" && (
                    <div className="ml-6">
                      <p className="text-muted-foreground">Not this one? Then:</p>
                      {countChoice(row)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {categorised.length > 0 && (
        <details
          className="rounded-2xl border bg-card p-5 text-sm card-ring"
          open={categoriesOpen || uncategorised > 0}
          onToggle={(e) => setCategoriesOpen(e.currentTarget.open)}
        >
          <summary className="min-h-11 cursor-pointer font-semibold">
            Categories
            {uncategorised > 0 ? `: ${uncategorised} to choose` : ""}
          </summary>
          {uncategorised > 0 && (
            <p
              role="alert"
              className="my-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-foreground"
            >
              {uncategorised === 1
                ? "1 expense was not recognised."
                : `${uncategorised} expenses were not recognised.`}{" "}
              Choose a category for them (the highlighted ones, at the top), or pick Others. If you
              leave them empty, the AI will categorize {uncategorised === 1 ? "it" : "them"}{" "}
              overnight.
            </p>
          )}
          <CategoryTable
            rows={categorised}
            categoryOf={categoryOf}
            picked={picked}
            remembered={remembered}
            onPick={(row, category) => {
              setCategoriesOpen(true);
              setPicked(new Map(picked).set(row, category));
            }}
            onRemember={(row, category) => rememberRule.mutate({ row, category })}
            saving={rememberRule.isPending}
          />
          {rememberRule.error && (
            <p role="alert" className="mt-2 text-negative">
              Could not save the rule: {rememberRule.error.message}
            </p>
          )}
        </details>
      )}

      {plan.problems.map((p, i) => (
        <p key={i} role="alert" className="text-sm text-negative">
          {p}
        </p>
      ))}

      <div className="text-sm">
        {undecided > 0 && (
          <p className="mb-2 text-muted-foreground">
            Decide on {expenses(undecided)} above to continue.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={BUTTON}
            disabled={plan.problems.length > 0 || nothingToWrite || undecided > 0}
            onClick={() => setView("confirm")}
          >
            Continue
          </button>
          <button type="button" className={SECONDARY} onClick={onBack}>
            Back
          </button>
        </div>
      </div>

      <SplitwiseCorrections
        group={group}
        older={split.older}
        edited={split.edited}
        removed={split.removed}
        rate={rate}
        categoryFor={(row) => categorizeRow(row, rules).category}
        onApplied={reload}
      />
    </div>
  );
}
