import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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

const BUTTON =
  "inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50";
const money = (cents: number) => (cents / 100).toFixed(2);

const describeRow = (r: ClassifiedRow) =>
  `${r.date} ${r.description} (${money(r.costCents)} ${r.currency}, your share ${money(r.shareCents ?? 0)})`;

function describeStored(s: StoredShare): string {
  const old = readFingerprint(s.fingerprint);
  const cost = old ? `${money(old.costCents)} ${s.currency}, ` : `${s.currency}, `;
  return `${s.booking_date} ${s.description} (${cost}your share ${s.amount.toFixed(2)})`;
}

function Tick({
  id,
  ticked,
  onToggle,
  label,
  note,
}: {
  id: string;
  ticked: Set<string>;
  onToggle: (id: string, on: boolean) => void;
  label: string;
  note: string | undefined;
}) {
  return (
    <li>
      <label className="flex min-h-11 items-start gap-2">
        <input
          type="checkbox"
          className="mt-1"
          checked={ticked.has(id)}
          onChange={(e) => onToggle(id, e.target.checked)}
        />
        <span>
          {label}
          {note && <span className="block text-muted-foreground">{note}</span>}
        </span>
      </label>
    </li>
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

  return (
    <div className="rounded-2xl border bg-card p-5 text-sm card-ring">
      <h2 className="mb-1 font-semibold">Changes to what you already imported</h2>
      <p className="mb-3 text-muted-foreground">
        These differ from your Splitwise file, inside the dates it covers. Nothing changes unless
        you tick it. Settle-ups are not stored, so they are not compared.
      </p>

      {older.length > 0 && (
        <section aria-labelledby="splitwise-added-late" className="mb-3">
          <h3 id="splitwise-added-late" className="mb-1 font-medium">
            Added late
          </h3>
          <p className="mb-1 text-muted-foreground">Older than your last import, not imported.</p>
          <ul className="space-y-1">
            {older.map(({ row, fingerprint }) => (
              <Tick
                key={fingerprint}
                id={fingerprint}
                ticked={ticked}
                onToggle={toggle}
                label={describeRow(row)}
                note={
                  row.kind === "paid_by_me"
                    ? "You paid this. If it is also in your bank, adding it counts it twice."
                    : undefined
                }
              />
            ))}
          </ul>
        </section>
      )}

      {edited.length > 0 && (
        <section aria-labelledby="splitwise-edited" className="mb-3">
          <h3 id="splitwise-edited" className="mb-1 font-medium">
            Edited in Splitwise
          </h3>
          <ul className="space-y-1">
            {edited.map((e) => (
              <Tick
                key={e.stored.id}
                id={e.stored.id}
                ticked={ticked}
                onToggle={toggle}
                label={`Was ${describeStored(e.stored)}. Now ${describeRow(e.row)}.`}
                note={
                  e.stored.linked_entry_reference
                    ? "Linked to a bank transaction: its personal amount is recalculated."
                    : undefined
                }
              />
            ))}
          </ul>
        </section>
      )}

      {removed.length > 0 && (
        <section aria-labelledby="splitwise-removed" className="mb-3">
          <h3 id="splitwise-removed" className="mb-1 font-medium">
            Removed in Splitwise
          </h3>
          <ul className="space-y-1">
            {removed.map((s) => (
              <Tick
                key={s.id}
                id={s.id}
                ticked={ticked}
                onToggle={toggle}
                label={describeStored(s)}
                note={
                  s.linked_entry_reference
                    ? "Linked to a bank transaction: it counts in full again."
                    : undefined
                }
              />
            ))}
          </ul>
        </section>
      )}

      {plan.problems.map((p, i) => (
        <p key={i} role="alert" className="mt-1 text-negative">
          {p}
        </p>
      ))}

      {confirming ? (
        <div className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
          <p className="mb-2">
            This changes rows from earlier imports. Undo does not cover corrections.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={BUTTON}
              disabled={apply.isPending}
              onClick={() => apply.mutate()}
            >
              {apply.isPending && <Loader2 className="size-4 animate-spin" />}
              Yes, apply {count} corrections
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg border px-4 py-2"
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
          className={BUTTON}
          disabled={count === 0 || plan.problems.length > 0}
          onClick={() => setConfirming(true)}
        >
          Apply {count} corrections
        </button>
      )}
      {apply.error && (
        <p role="alert" className="mt-2 text-negative">
          Corrections failed: {apply.error.message}
        </p>
      )}
      {done && (
        <p role="status" className="mt-2">
          {done}
        </p>
      )}
    </div>
  );
}
