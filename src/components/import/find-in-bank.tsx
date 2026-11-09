import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { CTA, Group } from "@/components/import/splitwise-ui";
import { money, shortDate } from "@/lib/import/splitwise-format";
import type { ClassifiedRow } from "@/lib/import/splitwise-classify";
import {
  manualSplit,
  nearbyPayments,
  type BankTx,
  type RateToEur,
} from "@/lib/import/splitwise-match";

const key = (t: BankTx) => `${t.accountUid}|${t.entryReference}`;

/**
 * A sheet listing the payments around an expense I paid, so the user can say which one it was
 * when the amounts differ too much for the matcher (a tip, a split entered differently).
 */
export function FindInBank({
  row,
  bank,
  taken,
  rate,
  onPick,
  onClose,
}: {
  /** The expense being linked; null keeps the sheet closed. */
  row: ClassifiedRow | null;
  bank: Array<BankTx>;
  taken: Set<string>;
  rate: RateToEur;
  onPick: (tx: BankTx) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => setChosen(null), [row]);

  const options = row ? nearbyPayments(row, bank, taken) : [];
  const tx = options.find((t) => key(t) === chosen) ?? null;
  const split = row && tx ? manualSplit(row, tx, rate) : null;

  return (
    <Sheet open={row !== null} onOpenChange={(open) => open || onClose()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] max-w-lg overflow-y-auto rounded-t-3xl border-0 bg-card px-5 pt-3 pb-8"
      >
        <div aria-hidden className="mx-auto mb-4 h-1.5 w-9 rounded-full bg-foreground/20" />
        <SheetTitle className="text-xl font-semibold tracking-tight">
          Which payment was {row?.description.trim() ?? "it"}?
        </SheetTitle>
        <SheetDescription className="mt-1 text-sm text-muted-foreground">
          {row ? `Payments around ${shortDate(row.date)}, any amount.` : ""}
        </SheetDescription>

        <div className="mt-5 space-y-4">
          {options.length === 0 ? (
            <p role="status" className="rounded-2xl bg-background/60 px-4 py-6 text-center text-sm">
              No payments out of your accounts around that date. If you paid it some other way,
              choose Paid in cash.
            </p>
          ) : (
            <Group>
              <div role="radiogroup" aria-label="Bank payments" className="divide-y divide-border">
                {options.map((t) => {
                  const selected = key(t) === chosen;
                  return (
                    <button
                      key={key(t)}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setChosen(key(t))}
                      className={`flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset ${
                        selected ? "bg-primary/10" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-medium">
                          {t.name?.trim() || "Card payment"}
                        </span>
                        <span className="block text-[0.8125rem] text-muted-foreground">
                          {shortDate(t.bookingDate)}
                        </span>
                      </span>
                      <span className="shrink-0 font-figure text-[0.9375rem]">
                        −{money(t.amountCents, t.currency)}
                      </span>
                      <span
                        aria-hidden
                        className={`size-5 shrink-0 rounded-full border-2 ${
                          selected ? "border-[6px] border-primary" : "border-foreground/25"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </Group>
          )}

          {tx && !split && (
            <p role="alert" className="px-4 text-sm text-negative">
              No exchange rate for this payment yet, so your part cannot be worked out.
            </p>
          )}
          {tx && split && (
            <Group>
              <dl className="divide-y divide-border font-figure text-[0.9375rem]">
                <div className="flex min-h-11 items-center justify-between px-4">
                  <dt className="text-muted-foreground">Paid from your bank</dt>
                  <dd>{money(tx.amountCents, tx.currency)}</dd>
                </div>
                <div className="flex min-h-11 items-center justify-between px-4">
                  <dt className="text-muted-foreground">Others owe you (Splitwise)</dt>
                  <dd>−{money(split.othersOweCents, tx.currency)}</dd>
                </div>
                <div className="flex min-h-11 items-center justify-between px-4 font-semibold">
                  <dt>Counts as your spending</dt>
                  <dd>{money(split.personalAmountCents, tx.currency)}</dd>
                </div>
              </dl>
            </Group>
          )}

          <button
            type="button"
            className={CTA}
            disabled={!tx || !split}
            onClick={() => tx && onPick(tx)}
          >
            Link payment
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
