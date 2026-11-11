import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { PRIMARY, TINTED } from "@/components/import/splitwise-ui";
import { money, moneyAmount, shortDate } from "@/lib/import/splitwise-format";
import { supabase } from "@/integrations/supabase/client";
import type { ClassifiedRow } from "@/lib/import/splitwise-classify";
import type { RpcClient } from "@/lib/import/splitwise-commit";
import {
  planCorrections,
  readFingerprint,
  runCorrections,
  type EditedRow,
  type FileRow,
  type StoredShare,
} from "@/lib/import/splitwise-corrections";
import type { RateToEur } from "@/lib/import/splitwise-match";

const fmt = (cents: number, currency: string) => money(Math.abs(cents), currency);

function Tick({
  id,
  ticked,
  onToggle,
  title,
  meta,
  amount,
  note,
}: {
  id: string;
  ticked: Set<string>;
  onToggle: (id: string, on: boolean) => void;
  title: string;
  meta: string;
  amount?: string | undefined;
  note: string | undefined;
}) {
  const on = ticked.has(id);
  return (
    <li>
      <label
        className={`flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-foreground/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-inset ${
          on ? "bg-primary/10" : ""
        }`}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={on}
          onChange={(e) => onToggle(id, e.target.checked)}
        />
        <span
          aria-hidden
          className={`grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors ${
            on ? "border-primary bg-primary text-primary-foreground" : "border-foreground/25"
          }`}
        >
          {on && <Check className="size-3" strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-medium">{title}</span>
          <span className="block text-[0.8125rem] text-muted-foreground">{meta}</span>
          {note && (
            <span className="block text-[0.8125rem] text-amber-700 dark:text-amber-400">
              {note}
            </span>
          )}
        </span>
        {amount && <span className="shrink-0 font-figure text-[0.9375rem]">{amount}</span>}
      </label>
    </li>
  );
}

function Section({
  id,
  title,
  footer,
  children,
}: {
  id: string;
  title: string;
  footer?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <h3
        id={id}
        className="px-4 pb-2 text-[0.8125rem] font-medium tracking-wide text-muted-foreground uppercase"
      >
        {title}
      </h3>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card">{children}</ul>
      {footer && <p className="px-4 pt-2 text-[0.8125rem] text-muted-foreground">{footer}</p>}
    </section>
  );
}

/** What changed in Splitwise among rows already imported. Nothing is applied without a tick. */
export function SplitwiseCorrections({
  group,
  older,
  edited,
  removed,
  rate,
  categoryFor,
  onApplied,
}: {
  group: string;
  older: Array<FileRow>;
  edited: Array<EditedRow>;
  removed: Array<StoredShare>;
  rate: RateToEur;
  categoryFor: (row: ClassifiedRow) => string | null;
  onApplied: () => void;
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  // Closed by default: these are old rows, and a long list would bury the import itself.
  const [open, setOpen] = useState(false);

  const toggle = (id: string, on: boolean) => {
    const next = new Set(ticked);
    if (on) next.add(id);
    else next.delete(id);
    setTicked(next);
    setConfirming(false);
  };

  const plan = planCorrections({ older, edited, removed, ticked, rate, categoryFor });
  const count = plan.add.length + plan.edit.length + plan.remove.length;

  const apply = useMutation({
    mutationFn: () => runCorrections(supabase as unknown as RpcClient, group, plan),
    onSuccess: ({ added, edited: changed, removed: gone }) => {
      setDone(`Applied: ${added} added, ${changed} edited, ${gone} removed.`);
      setTicked(new Set());
      setConfirming(false);
      onApplied();
    },
  });

  if (older.length + edited.length + removed.length === 0) {
    return done ? (
      <p role="status" className="text-sm">
        {done}
      </p>
    ) : null;
  }

  const total = older.length + edited.length + removed.length;

  return (
    <section aria-label="Changes to what you already imported" className="space-y-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-card px-4 py-2.5 text-left transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-medium">Changes to earlier imports</span>
          <span className="block text-[0.8125rem] text-muted-foreground">
            {total} {total === 1 ? "difference" : "differences"} with this file · optional
          </span>
        </span>
        <ChevronRight
          aria-hidden
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <>
          <p className="px-4 text-[0.8125rem] text-muted-foreground">
            Rows that differ from your Splitwise file, inside the dates it covers. Nothing changes
            unless you tick it. Settle-ups are not stored, so they are not compared.
          </p>

          {older.length > 0 && (
            <Section
              id="splitwise-added-late"
              title="Added late"
              footer="Older than your last import, not imported."
            >
              {older.map(({ row, fingerprint }) => (
                <Tick
                  key={fingerprint}
                  id={fingerprint}
                  ticked={ticked}
                  onToggle={toggle}
                  title={row.description.trim()}
                  meta={`${shortDate(row.date)} · ${fmt(row.costCents, row.currency)} total`}
                  amount={fmt(row.shareCents ?? 0, row.currency)}
                  note={
                    row.kind === "paid_by_me"
                      ? "You paid it: may already count from your bank"
                      : undefined
                  }
                />
              ))}
            </Section>
          )}

          {edited.length > 0 && (
            <Section id="splitwise-edited" title="Edited in Splitwise">
              {edited.map((e) => {
                const old = readFingerprint(e.stored.fingerprint);
                const was = old ? `${fmt(old.costCents, e.stored.currency)} total, ` : "";
                return (
                  <Tick
                    key={e.stored.id}
                    id={e.stored.id}
                    ticked={ticked}
                    onToggle={toggle}
                    title={e.row.description.trim()}
                    meta={`${shortDate(e.row.date)} · was ${was}share ${moneyAmount(e.stored.amount, e.stored.currency)} → now ${fmt(e.row.costCents, e.row.currency)} total, share ${fmt(e.row.shareCents ?? 0, e.row.currency)}`}
                    note={
                      e.stored.linked_entry_reference
                        ? "Linked to a bank transaction: its personal amount is recalculated."
                        : undefined
                    }
                  />
                );
              })}
            </Section>
          )}

          {removed.length > 0 && (
            <Section id="splitwise-removed" title="Removed in Splitwise">
              {removed.map((s) => (
                <Tick
                  key={s.id}
                  id={s.id}
                  ticked={ticked}
                  onToggle={toggle}
                  title={s.description.trim()}
                  meta={`${shortDate(s.booking_date)} · your share`}
                  amount={moneyAmount(s.amount, s.currency)}
                  note={
                    s.linked_entry_reference
                      ? "Linked to a bank transaction: it counts in full again."
                      : undefined
                  }
                />
              ))}
            </Section>
          )}

          {plan.problems.map((p, i) => (
            <p key={i} role="alert" className="px-4 text-sm text-negative">
              {p}
            </p>
          ))}

          {confirming ? (
            <div className="space-y-3 rounded-2xl bg-amber-500/10 p-4 text-sm ring-1 ring-amber-500/35">
              <p>This changes rows from earlier imports. Undo does not cover corrections.</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={PRIMARY}
                  disabled={apply.isPending}
                  onClick={() => apply.mutate()}
                >
                  {apply.isPending && <Loader2 className="size-4 animate-spin" />}
                  Yes, apply {count} corrections
                </button>
                <button
                  type="button"
                  className={TINTED}
                  disabled={apply.isPending}
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`${TINTED} w-full`}
              disabled={count === 0 || plan.problems.length > 0}
              onClick={() => setConfirming(true)}
            >
              Apply {count} corrections
            </button>
          )}
        </>
      )}
      {apply.error && (
        <p role="alert" className="px-4 text-sm text-negative">
          Corrections failed: {apply.error.message}
        </p>
      )}
      {done && (
        <p role="status" className="px-4 text-sm">
          {done}
        </p>
      )}
    </section>
  );
}
