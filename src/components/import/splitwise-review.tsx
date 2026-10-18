import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES } from "@/lib/categories";
import type { ClassifiedRow } from "@/lib/import/splitwise-classify";
import { fingerprintRows, matchBank, type BankTx } from "@/lib/import/splitwise-match";
import { planWrite } from "@/lib/import/splitwise-plan";
import {
  categoryChoices,
  defaultSelection,
  makeRate,
  toBankTx,
  type FxRow,
} from "@/lib/import/splitwise-review";

// Bank rows are read from 30 days before the first expense (late-entered ones) to a week after
// the last one. The database returns at most 1000 rows per call, so more than that is refused.
const DAYS_BEFORE = 30;
const DAYS_AFTER = 7;
const FX_DAYS_BEFORE = 14;
const PAGE_LIMIT = 1000;

const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const money = (cents: number) => (cents / 100).toFixed(2);

interface Loaded {
  bank: Array<BankTx>;
  fx: Array<FxRow>;
  existing: Map<string, { accountUid: string; entryReference: string }>;
}

interface ExistingRow {
  fingerprint: string;
  linked_account_uid: string | null;
  linked_entry_reference: string | null;
}

// The new table is not in the generated types until the migration is applied.
interface ExistingReader {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): PromiseLike<{ data: Array<ExistingRow> | null; error: { message: string } | null }>;
    };
  };
}

async function load(rows: Array<ClassifiedRow>, group: string): Promise<Loaded> {
  const dates = rows.map((r) => r.date).sort();
  const first = dates[0] ?? "";
  const last = dates[dates.length - 1] ?? "";
  const currencies = [...new Set(rows.map((r) => r.currency))].filter((c) => c !== "EUR");

  const [bank, fx, existing] = await Promise.all([
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
    (supabase as unknown as ExistingReader)
      .from("splitwise_expenses")
      .select("fingerprint, linked_account_uid, linked_entry_reference")
      .eq("group_name", group),
  ]);

  const failed = bank.error ?? fx.error ?? existing.error;
  if (failed) throw new Error(failed.message);
  if ((bank.data ?? []).length >= PAGE_LIMIT || (fx.data ?? []).length >= PAGE_LIMIT) {
    throw new Error("Too many bank transactions in these dates to review safely.");
  }
  return {
    bank: (bank.data ?? []).flatMap((r) => toBankTx(r) ?? []),
    fx: fx.data ?? [],
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
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  // What the user changed by hand; everything else follows the default (sure matches ticked).
  const [manualTicks, setChoices] = useState<Map<number, boolean>>(new Map());
  const [includeUnmatched, setIncludeUnmatched] = useState(false);

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
    () => (loaded ? matchBank(rows, loaded.bank, rate) : []),
    [loaded, rows, rate],
  );
  const ticked = useMemo(() => {
    const picked = defaultSelection(matches);
    for (const [row, on] of manualTicks) {
      if (on) picked.add(row);
      else picked.delete(row);
    }
    return picked;
  }, [matches, manualTicks]);

  const choices = useMemo(() => categoryChoices(rows), [rows]);

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
            categoryFor: (row) =>
              overrides[row.category] ??
              choices.find((c) => c.source === row.category)?.suggested ??
              "Others",
            rate,
          })
        : null,
    [
      loaded,
      group,
      rows,
      fingerprints,
      matches,
      ticked,
      includeUnmatched,
      overrides,
      choices,
      rate,
    ],
  );

  const byRow = new Map(rows.map((r) => [r.row, r]));
  const bankByKey = new Map(
    (loaded?.bank ?? []).map((t) => [`${t.accountUid}|${t.entryReference}`, t]),
  );
  const matchedRows = new Set(matches.map((m) => m.row));
  const unmatched = rows.filter(
    (r, i) =>
      r.kind === "paid_by_me" &&
      (r.shareCents ?? 0) > 0 &&
      !matchedRows.has(r.row) &&
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
        <h2 className="mb-2 font-semibold">Categories</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {choices.map((c) => (
            <label key={c.source} className="block">
              <span className="mb-1 block text-muted-foreground">{c.source}</span>
              <select
                value={overrides[c.source] ?? c.suggested}
                onChange={(e) => setOverrides({ ...overrides, [c.source]: e.target.value })}
                className="w-full rounded-lg border bg-background px-3 py-2 text-base focus:ring-2 focus:ring-ring focus:outline-none"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
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
        </p>
        {plan.problems.map((p, i) => (
          <p key={i} role="alert" className="mt-1 text-negative">
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}
