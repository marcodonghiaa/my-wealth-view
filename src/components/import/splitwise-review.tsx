import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Loader2, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CategoryTable } from "@/components/import/splitwise-category-table";
import { FindInBank } from "@/components/import/find-in-bank";
import { CTA, Group, LINK, PRIMARY, Steps, TINTED } from "@/components/import/splitwise-ui";
import { money as amount, shortDate } from "@/lib/import/splitwise-format";
import type { ClassifiedRow } from "@/lib/import/splitwise-classify";
import { refreshKeys } from "@/lib/import/last-import";
import { IMPORT_KEY, runSplitwiseImport, type RpcClient } from "@/lib/import/splitwise-commit";
import {
  fingerprintRows,
  manualMatch,
  manualSplit,
  matchBank,
  type BankMatch,
  type BankTx,
} from "@/lib/import/splitwise-match";
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
  const [bank, stored, rules] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "account_uid, entry_reference, booking_date, amount, currency, credit_debit_indicator, personal_amount, flow_type, deleted_at, creditor_name",
      )
      .gte("booking_date", addDays(first, -DAYS_BEFORE))
      .lte("booking_date", addDays(last, DAYS_AFTER))
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

  // Rates for the file's currencies and the bank's: a payment picked by hand may be in another one.
  const currencies = [
    ...new Set([...rows.map((r) => r.currency), ...(bank.data ?? []).map((t) => t.currency)]),
  ].filter((c) => c !== "EUR");
  const fx =
    currencies.length === 0
      ? { data: [] as Array<FxRow>, error: null }
      : await supabase
          .from("fx_rates")
          .select("currency, date, rate_to_eur")
          .in("currency", currencies)
          .gte("date", addDays(first, -FX_DAYS_BEFORE))
          .lte("date", addDays(last, DAYS_AFTER))
          .limit(PAGE_LIMIT);

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

/** What a finished import hands back, so the page can say so and offer Undo. */
export interface ImportDone {
  batchId: string;
  group: string;
  shares: number;
  /** Set when the shares are saved but the friends' balances are not. */
  balancesError: string | null;
}

const txKey = (t: { accountUid: string; entryReference: string }) =>
  `${t.accountUid}|${t.entryReference}`;

export function SplitwiseReview({
  rows,
  group,
  balances = null,
  onImported,
  onBack,
}: {
  rows: Array<ClassifiedRow>;
  group: string;
  balances?: FileBalances | null;
  onImported?: (done: ImportDone) => void;
  onBack: () => void;
  /** Kept for callers; the flow now ends on the page, not on a screen here. */
  onClose?: () => void;
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
  // Payments picked by hand with Find in bank, per row; the sheet shows for `finding`.
  const [manual, setManual] = useState<Map<number, BankMatch>>(new Map());
  const [finding, setFinding] = useState<ClassifiedRow | null>(null);
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

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

  // A row can leave the import after corrections move the checkpoint; its hand-picked link goes too.
  const confirmed = useMemo(() => {
    const inImport = new Set(split.rows.map((r) => r.row));
    return [
      ...matches.filter((m) => ticked.has(m.row)),
      ...[...manual.values()].filter((m) => inImport.has(m.row)),
    ];
  }, [split, matches, ticked, manual]);
  const plan = useMemo(
    () =>
      loaded
        ? planWrite({
            group,
            rows,
            fingerprints,
            confirmed,
            stored: loaded.stored,
            countedRows: new Set(
              [...unmatchedChoices].filter(([, counted]) => counted).map(([row]) => row),
            ),
            categoryFor: (row) => categoryOf.get(row.row) ?? null,
            rate,
          })
        : null,
    [loaded, group, rows, fingerprints, confirmed, unmatchedChoices, categoryOf, rate],
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

  // Balances move without new expenses (a settle-up), and a first attempt can fail.
  const saveOnlyBalances = useMutation({
    mutationFn: async () => {
      if (balances) await saveBalances(supabase as unknown as RpcClient, group, balances);
    },
    onSuccess: () => void refresh(),
  });

  const importShares = useMutation({
    mutationKey: IMPORT_KEY,
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
    onSuccess: ({ batchId, shares, balancesError }) => {
      void refresh();
      onImported?.({ batchId, group: group.trim(), shares, balancesError });
    },
  });

  const byRow = new Map(rows.map((r) => [r.row, r]));
  const bankByKey = new Map((loaded?.bank ?? []).map((t) => [txKey(t), t]));
  // An unticked match is not a link, so that expense counts as not in the bank.
  const linkedRows = new Set(confirmed.map((m) => m.row));
  const unmatched = split.rows.filter(
    (r) => r.kind === "paid_by_me" && isShareRow(r) && !linkedRows.has(r.row),
  );
  const undecided = unmatched.filter((r) => !unmatchedChoices.has(r.row)).length;
  // An expense still waiting for a decision is something to write, not "nothing new".
  const nothingToWrite = undecided === 0 && plan?.shares.length === 0 && plan.links.length === 0;

  const header = (
    <div className="flex min-h-11 items-center gap-3 pr-10">
      <button type="button" className={`${LINK} -ml-1 gap-0.5`} onClick={onBack}>
        <ChevronLeft aria-hidden className="size-5" />
        Back
      </button>
      <span className="flex-1" />
      <Steps current={2} />
    </div>
  );

  if (loadError)
    return (
      <div className="space-y-6">
        {header}
        <p role="alert" className="text-sm text-negative">
          {loadError}
        </p>
      </div>
    );
  if (!loaded || !plan)
    return (
      <div className="space-y-6">
        {header}
        <p role="status" className="text-sm text-muted-foreground">
          Reading your bank transactions…
        </p>
      </div>
    );

  const suggested = new Set(matches.map((m) => m.row));
  // Expenses I paid that the matcher found nothing for: the user says what happened.
  const needsYou = split.rows.filter(
    (r) => r.kind === "paid_by_me" && isShareRow(r) && !suggested.has(r.row),
  );
  const total = sharesTotal(plan.shares);
  // Payments another row uses, or that the matcher suggested (on or off), cannot be picked: a
  // suggestion switched on later would otherwise land on the same payment twice.
  const takenExcept = (row: number) =>
    new Set([
      ...matches.map((m) => txKey(m)),
      ...confirmed.filter((m) => m.row !== row).map((m) => txKey(m)),
    ]);
  // After the sheet or a choice closes, focus goes back to that expense, not to the page top.
  const focusRow = (row: number) =>
    requestAnimationFrame(() => document.getElementById(`sw-row-${row}`)?.focus());

  const decide = (row: number, counted: boolean | null) => {
    const choices = new Map(unmatchedChoices);
    if (counted === null) choices.delete(row);
    else choices.set(row, counted);
    setUnmatchedChoices(choices);
    if (manual.has(row)) {
      const next = new Map(manual);
      next.delete(row);
      setManual(next);
    }
  };

  /** What happens to an expense I paid that is not linked yet, or how it was settled. */
  const actions = (r: ClassifiedRow) => {
    const link = manual.get(r.row);
    const tx = link && bankByKey.get(txKey(link));
    const choice = unmatchedChoices.get(r.row);
    const status =
      link && tx
        ? `Linked to ${tx.name?.trim() || "a payment"} on ${shortDate(tx.bookingDate)} · counts ${amount(link.personalAmountCents ?? 0, tx.currency)}`
        : choice === true
          ? "Paid outside your bank: your share counts"
          : choice === false
            ? "Skipped: not counted"
            : null;
    if (status)
      return (
        <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 text-sm">
          <span role="status" className="text-muted-foreground">
            {status}
          </span>
          <button
            type="button"
            className={LINK}
            id={`sw-row-${r.row}`}
            aria-label={`Change what to do with ${r.description.trim()}`}
            onClick={() => {
              decide(r.row, null);
              focusRow(r.row);
            }}
          >
            Change
          </button>
        </div>
      );
    return (
      <div
        role="group"
        aria-label={`What to do with ${r.description.trim()}`}
        className="grid grid-cols-3 gap-2 px-4 py-3 [&>button]:px-2 [&>button]:text-sm [&>button]:whitespace-nowrap"
      >
        <button
          type="button"
          id={`sw-row-${r.row}`}
          className={PRIMARY}
          onClick={() => setFinding(r)}
        >
          Find in bank
        </button>
        <button
          type="button"
          className={TINTED}
          onClick={() => {
            decide(r.row, true);
            focusRow(r.row);
          }}
        >
          Paid in cash
        </button>
        <button
          type="button"
          className={TINTED}
          onClick={() => {
            decide(r.row, false);
            focusRow(r.row);
          }}
        >
          Skip
        </button>
      </div>
    );
  };

  const expenseLine = (r: ClassifiedRow, right: React.ReactNode) => (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-medium">{r.description.trim()}</span>
        <span className="block text-[0.8125rem] text-muted-foreground">
          {shortDate(r.date)} · {r.kind === "paid_by_me" ? "paid by you" : "paid by others"}
        </span>
      </span>
      <span className="shrink-0 text-right font-figure text-[0.9375rem]">{right}</span>
    </div>
  );

  const buttonLabel =
    undecided > 0
      ? `Decide on ${expenses(undecided)} to continue`
      : `Import ${expenses(plan.shares.length)}`;

  return (
    <div className="space-y-7">
      {header}

      <div aria-live="polite">
        {nothingToWrite ? (
          <>
            <h2 className="text-[1.75rem] leading-tight font-semibold tracking-tight">
              Nothing new
            </h2>
            <p role="status" className="mt-1 text-[0.9375rem] text-muted-foreground">
              {split.checkpoint
                ? `Everything up to ${shortDate(split.checkpoint)} is already imported. Nothing will be written.`
                : "Nothing to import yet."}
            </p>
          </>
        ) : (
          <>
            <p className="text-[0.9375rem] text-muted-foreground">
              {split.checkpoint
                ? `New since ${shortDate(split.checkpoint)}`
                : `Into ${group.trim()}`}
            </p>
            <h2 className="mt-0.5 font-figure text-[2.75rem] leading-none font-semibold tracking-tight">
              {expenses(plan.shares.length)}
            </h2>
            <p className="mt-2 text-[0.9375rem] text-muted-foreground">
              Your share {total}
              {split.checkpoint ? " · already-imported ones stay as they are" : ""}
            </p>
          </>
        )}
      </div>

      {needsYou.length > 0 && (
        <Group
          label={`Needs you · ${needsYou.length}`}
          tone={undecided > 0 ? "warning" : undefined}
        >
          {needsYou.map((r) => (
            <div key={r.row} className="divide-y divide-border">
              {!linkedRows.has(r.row) && !unmatchedChoices.has(r.row) && (
                <p className="flex items-center gap-2 px-4 py-2.5 text-[0.8125rem] text-amber-600 dark:text-amber-300">
                  <TriangleAlert aria-hidden className="size-4 shrink-0" />
                  You paid this, but it isn't in your bank yet
                </p>
              )}
              {expenseLine(
                r,
                // Once linked, the bank decides what counts; Splitwise's share is only a hint.
                manual.has(r.row) ? "" : `your share ${amount(r.shareCents ?? 0, r.currency)}`,
              )}
              {actions(r)}
            </div>
          ))}
        </Group>
      )}

      {matches.length > 0 && (
        <Group
          label="Found in your bank"
          footer={
            matches.some((m) => m.confidence === "ambiguous")
              ? "Unsure ones start off. Switch on the ones that are right."
              : undefined
          }
        >
          {matches.map((m) => {
            const row = byRow.get(m.row);
            const tx = bankByKey.get(txKey(m));
            if (!row || !tx) return null;
            const on = ticked.has(m.row);
            return (
              <div key={m.row} className="divide-y divide-border">
                <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-medium">
                      {row.description.trim()}{" "}
                      <span className="font-figure font-normal text-muted-foreground">
                        {amount(row.costCents, row.currency)}
                      </span>
                    </span>
                    <span className="block text-[0.8125rem] text-muted-foreground">
                      {tx.name?.trim() || "Bank"} · {shortDate(tx.bookingDate)} ·{" "}
                      <span className="font-figure">{amount(tx.amountCents, tx.currency)}</span>
                      {m.confidence === "ambiguous" && " · not sure"}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={`${row.description.trim()} is this bank payment`}
                    checked={on}
                    onChange={(e) => {
                      setChoices(new Map(manualTicks).set(m.row, e.target.checked));
                      // Switching the suggestion on replaces a payment picked by hand.
                      if (e.target.checked && manual.has(m.row)) {
                        const next = new Map(manual);
                        next.delete(m.row);
                        setManual(next);
                      }
                    }}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className="relative h-[31px] w-[51px] shrink-0 rounded-full bg-foreground/15 transition-colors peer-checked:bg-positive peer-focus-visible:ring-2 peer-focus-visible:ring-ring after:absolute after:top-[2px] after:left-[2px] after:size-[27px] after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
                  />
                </label>
                {!on && row.kind === "paid_by_me" && actions(row)}
              </div>
            );
          })}
        </Group>
      )}

      {categorised.length > 0 && (
        <Group
          label={`Expenses · ${categorised.length}`}
          footer={uncategorised > 0 ? undefined : "Tap a category to change it."}
        >
          {uncategorised > 0 && (
            <p role="alert" className="bg-amber-500/10 px-4 py-3 text-[0.8125rem] text-foreground">
              {uncategorised === 1
                ? "1 expense was not recognised."
                : `${uncategorised} expenses were not recognised.`}{" "}
              Pick a category, or leave it and the AI will categorize{" "}
              {uncategorised === 1 ? "it" : "them"} overnight.
            </p>
          )}
          <CategoryTable
            rows={categorised}
            categoryOf={categoryOf}
            picked={picked}
            remembered={remembered}
            onPick={(row, category) => setPicked(new Map(picked).set(row, category))}
            onRemember={(row, category) => rememberRule.mutate({ row, category })}
            saving={rememberRule.isPending}
          />
          {rememberRule.error && (
            <p role="alert" className="px-4 py-2 text-sm text-negative">
              Could not save the rule: {rememberRule.error.message}
            </p>
          )}
        </Group>
      )}

      {plan.problems.map((p, i) => (
        <p key={i} role="alert" className="px-4 text-sm text-negative">
          {p}
        </p>
      ))}

      {balances && balances.skippedRows > 0 && (
        <p className="px-4 text-sm text-muted-foreground">
          {balances.skippedRows} {balances.skippedRows === 1 ? "row is" : "rows are"} in another
          currency than {balances.currency}: who owes you leaves{" "}
          {balances.skippedRows === 1 ? "it" : "them"} out.
        </p>
      )}

      {nothingToWrite && balances && (
        <div className="space-y-2">
          <button
            type="button"
            className={CTA}
            disabled={saveOnlyBalances.isPending || saveOnlyBalances.isSuccess}
            onClick={() => saveOnlyBalances.mutate()}
          >
            {saveOnlyBalances.isPending && <Loader2 className="size-4 animate-spin" />}
            Update balances from this file
          </button>
          {saveOnlyBalances.isSuccess && (
            <p role="status" className="px-4 text-sm">
              Balances updated.
            </p>
          )}
          {saveOnlyBalances.error && (
            <p role="alert" className="px-4 text-sm text-negative">
              Could not save the balances: {saveOnlyBalances.error.message}
            </p>
          )}
        </div>
      )}

      {!nothingToWrite && (
        <div className="space-y-2">
          {importShares.error && (
            <p role="alert" className="px-4 text-sm text-negative">
              Import failed: {importShares.error.message}
            </p>
          )}
          <button
            type="button"
            className={CTA}
            disabled={
              plan.problems.length > 0 || undecided > 0 || !userId || importShares.isPending
            }
            onClick={() => importShares.mutate()}
          >
            {importShares.isPending && <Loader2 className="size-4 animate-spin" />}
            {buttonLabel}
          </button>
        </div>
      )}

      <SplitwiseCorrections
        group={group}
        older={split.older}
        edited={split.edited}
        removed={split.removed}
        rate={rate}
        categoryFor={(row) => categorizeRow(row, rules).category}
        onApplied={reload}
      />

      <FindInBank
        row={finding}
        bank={loaded.bank}
        taken={finding ? takenExcept(finding.row) : new Set()}
        rate={rate}
        onClose={() => {
          if (finding) focusRow(finding.row);
          setFinding(null);
        }}
        onPick={(tx) => {
          if (!finding) return;
          const split = manualSplit(finding, tx, rate);
          if (!split) return;
          const choices = new Map(unmatchedChoices);
          choices.delete(finding.row);
          setUnmatchedChoices(choices);
          // A picked payment replaces a doubtful suggestion for the same row.
          setChoices(new Map(manualTicks).set(finding.row, false));
          setManual(new Map(manual).set(finding.row, manualMatch(finding, tx, split)));
          focusRow(finding.row);
          setFinding(null);
        }}
      />
    </div>
  );
}
