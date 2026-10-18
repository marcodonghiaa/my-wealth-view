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
import { planWrite } from "@/lib/import/splitwise-plan";
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
  existing: Map<string, { accountUid: string; entryReference: string }>;
  rules: Array<UserRule>;
}

async function load(rows: Array<ClassifiedRow>, group: string): Promise<Loaded> {
  const dates = rows.map((r) => r.date).sort();
  const first = dates[0] ?? "";
  const last = dates[dates.length - 1] ?? "";
  const currencies = [...new Set(rows.map((r) => r.currency))].filter((c) => c !== "EUR");

  const [bank, fx, existing, rules] = await Promise.all([
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
      .select("fingerprint, linked_account_uid, linked_entry_reference")
      .eq("group_name", group),
    supabase
      .from("category_rules")
      .select("match_text, set_category, priority")
      .order("priority", { ascending: true }),
  ]);

  const failed = bank.error ?? fx.error ?? existing.error ?? rules.error;
  if (failed) throw new Error(failed.message);
  if ((bank.data ?? []).length >= PAGE_LIMIT || (fx.data ?? []).length >= PAGE_LIMIT) {
    throw new Error("Too many bank transactions in these dates to review safely.");
  }
  return {
    bank: (bank.data ?? []).flatMap((r) => toBankTx(r) ?? []),
    fx: fx.data ?? [],
    rules: rules.data ?? [],
    existing: new Map(
      (existing.data ?? []).flatMap((e) =>
        e.linked_account_uid && e.linked_entry_reference
          ? [
              [
                e.fingerprint,
                { accountUid: e.linked_account_uid, entryReference: e.linked_entry_reference },
              ],
            ]
          : [],
      ),
    ),
  };
}

export function SplitwiseReview({ rows, group }: { rows: Array<ClassifiedRow>; group: string }) {
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

  useEffect(() => {
    let current = true;
    setLoaded(null);
    setLoadError(null);
    load(rows, group.trim())
      .then((data) => current && setLoaded(data))
      .catch((err: unknown) => {
        if (current) setLoadError(err instanceof Error ? err.message : "Could not read your bank.");
      });
    return () => {
      current = false;
    };
  }, [rows, group]);

  const fingerprints = useMemo(() => fingerprintRows(rows), [rows]);
  const rate = useMemo(() => makeRate(loaded?.fx ?? []), [loaded]);
  const matches = useMemo(
    () =>
      // An expense linked by an earlier import keeps that link: it is not matched again.
      loaded
        ? matchBank(
            rows.filter((_, i) => !loaded.existing.has(fingerprints[i] ?? "")),
            loaded.bank,
            rate,
          )
        : [],
    [loaded, rows, fingerprints, rate],
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
  const categorised = useMemo(
    () =>
      rows.filter(
        (r) => (r.kind === "paid_by_other" || r.kind === "paid_by_me") && (r.shareCents ?? 0) > 0,
      ),
    [rows],
  );
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
            existingLinks: loaded.existing,
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
      const result = await runSplitwiseImport(supabase as unknown as RpcClient, plan);
      return { ...result, owner: userId };
    },
    onSuccess: ({ batchId, shares, links, owner }) => {
      const entry = { batchId, count: shares };
      saveLastImport(browserStorage(), owner, "splitwise", entry);
      setLast(entry);
      setDone(`Imported ${shares} shares and updated ${links} bank transactions.`);
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
      void refresh();
    },
  });

  const byRow = new Map(rows.map((r) => [r.row, r]));
  const bankByKey = new Map(
    (loaded?.bank ?? []).map((t) => [`${t.accountUid}|${t.entryReference}`, t]),
  );
  // An unticked match is not a link, so that expense counts as not in the bank.
  const linkedRows = new Set(confirmed.map((m) => m.row));
  const unmatched = rows.filter(
    (r, i) =>
      r.kind === "paid_by_me" &&
      (r.shareCents ?? 0) > 0 &&
      !linkedRows.has(r.row) &&
      !loaded?.existing.has(fingerprints[i] ?? ""),
  );

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
      <div className="rounded-2xl border bg-card p-5 text-sm card-ring">
        <h2 className="mb-1 font-semibold">Categories</h2>
        <p className="mb-3 text-muted-foreground">
          Read from your rules and the description. Rows nobody recognised are first: choose a
          category for them. After a change you can save it as a rule for next time.
        </p>
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
              share only)
            </span>
          </label>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-5 text-sm card-ring">
        <h2 className="mb-2 font-semibold">What will be recorded</h2>
        <p>
          {plan.shares.length} shares of expenses, {plan.links.length} bank transactions updated (
          {confirmed.length} ticked).
          {uncategorised > 0 && ` ${uncategorised} without a category will show as Uncategorized.`}
        </p>
        {plan.problems.map((p, i) => (
          <p key={i} role="alert" className="mt-1 text-negative">
            {p}
          </p>
        ))}
        <p className="mt-2 text-muted-foreground">
          Importing again replaces this group's shares in these dates.
        </p>
        <div className="mt-3">
          <button
            type="button"
            className={BUTTON}
            disabled={
              plan.problems.length > 0 ||
              (plan.shares.length === 0 && plan.links.length === 0) ||
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
          transactions it changed back, but shares it replaced are not restored.
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
