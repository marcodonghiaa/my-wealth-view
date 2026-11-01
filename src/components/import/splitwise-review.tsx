import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CategoryTable } from "@/components/import/splitwise-category-table";
import type { ClassifiedRow } from "@/lib/import/splitwise-classify";
import {
  browserStorage,
  clearLastImport,
  loadLastImport,
  refreshKeys,
  saveLastImport,
  type LastImport,
} from "@/lib/import/last-import";
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
const money = (cents: number) => (cents / 100).toFixed(2);

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
}: {
  rows: Array<ClassifiedRow>;
  group: string;
  balances?: FileBalances | null;
  onImported?: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Category changes made by hand (null = cleared), and rules saved during this review.
  const [picked, setPicked] = useState<Map<number, string | null>>(new Map());
  const [extraRules, setExtraRules] = useState<Array<UserRule>>([]);
  const [remembered, setRemembered] = useState<Set<number>>(new Set());
  // What the user changed by hand; everything else follows the default (sure matches ticked).
  const [manualTicks, setChoices] = useState<Map<number, boolean>>(new Map());
  const [includeUnmatched, setIncludeUnmatched] = useState(false);
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [last, setLast] = useState<LastImport | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);
  // Undo survives leaving the page: the last import is remembered per user.
  useEffect(() => {
    setLast(userId ? loadLastImport(browserStorage(), userId, "splitwise") : null);
  }, [userId]);

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
            includeUnmatchedPaidByMe: includeUnmatched,
            categoryFor: (row) => categoryOf.get(row.row) ?? null,
            rate,
          })
        : null,
    [loaded, group, rows, fingerprints, matches, ticked, includeUnmatched, categoryOf, rate],
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
      return { ...result, owner: userId, balancesError };
    },
    onSuccess: ({ batchId, shares, links, owner, balancesError }) => {
      const entry = { batchId, count: shares };
      saveLastImport(browserStorage(), owner, "splitwise", entry);
      setLast(entry);
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
      if (userId) clearLastImport(browserStorage(), userId, "splitwise");
      setLast(null);
      setDone(null);
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

  return (
    <div className="space-y-6">
      {split.checkpoint && (
        <div className="rounded-2xl border bg-card p-5 text-sm card-ring">
          <p>
            Your last import goes up to {split.checkpoint}. Only what is new from that day on is
            reviewed; everything already imported stays as it is.
          </p>
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

      <div className="rounded-2xl border bg-card p-5 text-sm card-ring">
        <h2 className="mb-1 font-semibold">Categories</h2>
        <p className="mb-3 text-muted-foreground">
          Read from your rules and the description. Rows nobody recognised are first: choose a
          category for them. After a change you can save it as a rule for next time.
        </p>
        {uncategorised > 0 && (
          <p
            role="alert"
            className="mb-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-foreground"
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
          onPick={(row, category) => setPicked(new Map(picked).set(row, category))}
          onRemember={(row, category) => rememberRule.mutate({ row, category })}
          saving={rememberRule.isPending}
        />
        {rememberRule.error && (
          <p role="alert" className="mt-2 text-negative">
            Could not save the rule: {rememberRule.error.message}
          </p>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-5 text-sm card-ring">
        <h2 className="mb-1 font-semibold">Matches with your bank</h2>
        <p className="mb-3 text-muted-foreground">
          Expenses you paid, and payments between friends, that look like a bank transaction you
          already have. Tick the ones that are right. Unsure ones start unticked.
        </p>
        {matches.length === 0 && <p className="text-muted-foreground">No matches found.</p>}
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
                    {row.date} {row.description} ({money(row.costCents)} {row.currency}) matches the
                    bank on {tx.bookingDate}: {money(tx.amountCents)} {tx.currency}
                    {m.confidence === "ambiguous" && (
                      <span className="text-muted-foreground"> (not sure)</span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {unmatched.length > 0 && (
          <label className="mt-3 flex min-h-11 items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={includeUnmatched}
              onChange={(e) => setIncludeUnmatched(e.target.checked)}
            />
            <span>
              Also count the {unmatched.length} expenses you paid that are not in your bank (your
              share only). Left out now, any dated before this import's newest expense will not be
              offered again.
            </span>
          </label>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-5 text-sm card-ring">
        <h2 className="mb-2 font-semibold">What will be recorded</h2>
        <p>
          {plan.shares.length} shares of expenses, {plan.links.length} bank transactions updated (
          {confirmed.length} ticked).
          {uncategorised > 0 &&
            ` ${uncategorised} without a category will be categorized by the AI overnight.`}
        </p>
        {plan.problems.map((p, i) => (
          <p key={i} role="alert" className="mt-1 text-negative">
            {p}
          </p>
        ))}
        {split.checkpoint && nothingToWrite && (
          <p role="status" className="mt-2">
            Nothing new since your last import. Nothing will be written.
          </p>
        )}
        <div className="mt-3">
          <button
            type="button"
            className={BUTTON}
            disabled={
              !userId ||
              plan.problems.length > 0 ||
              nothingToWrite ||
              importShares.isPending ||
              importShares.isSuccess
            }
            onClick={() => importShares.mutate()}
          >
            {importShares.isPending && <Loader2 className="size-4 animate-spin" />}
            Import {plan.shares.length} shares
          </button>
        </div>
        {importShares.error && (
          <p role="alert" className="mt-2 text-negative">
            Import failed: {importShares.error.message}
          </p>
        )}
        {done && (
          <p role="status" className="mt-2">
            {done}
          </p>
        )}
      </div>

      {last && (
        <div className="rounded-2xl border bg-card p-5 text-sm card-ring">
          Last Splitwise import: {last.count} shares. Undo removes them and puts the bank
          transactions it changed back. Earlier imports are not touched.
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
          {undo.error && (
            <p role="alert" className="mt-2 text-negative">
              Undo failed: {undo.error.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
