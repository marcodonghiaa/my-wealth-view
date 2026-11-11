import { useState, type ReactNode } from "react";
import { ChevronRight, Users } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { GroupedList } from "@/components/ui/grouped-list";
import { useIsMobile } from "@/lib/use-is-mobile";
import { AccountBadge } from "@/components/bank-badge";
import { RefundedBadge } from "@/components/refunded-badge";
import { CategoryAvatar } from "@/components/category-avatar";
import {
  formatBookingDate,
  formatBookingDateShort,
  formatMoney,
  formatSignedMoney,
  isSplitwiseShare,
  isWorthItEligible,
  nativeSignedAmount,
  type TransactionRow,
} from "@/lib/transactions";
import { NameEditor } from "./name-editor";
import { CategoryPicker, TypePicker } from "./pickers";
import { SplitEditor } from "./split-editor";
import { WorthItPrompt } from "./worth-it";
import { AmountEditor } from "./amount-editor";

export interface TransactionViewProps {
  tx: TransactionRow;
  accountLabel: string;
  // inSheet: picked in the edit sheet, whose overlay covers toasts.
  onSelectCategory: (category: string, opts?: { inSheet?: boolean }) => void;
  savingCategory: boolean;
  onSelectType: (type: string) => void;
  savingType: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onAnswerWorthIt: (worthIt: "yes" | "no") => void;
  savingSplit: boolean;
  onSaveSplit: (personalAmount: number | null, owedBy: string | null) => void;
  /** Names used on past splits, offered as pills in the split editor. */
  splitContacts?: Array<string>;
  onRename: (name: string | null) => void;
  savingRename: boolean;
  /** Only for transactions added by hand: bank amounts can't change. */
  onSaveAmount?: (amount: number) => void;
  savingAmount?: boolean;
  highlighted?: boolean;
  /** "Make a rule" from this name and category, shown under Category in the sheet. */
  makeRule?: { label: string; onClick: () => void } | undefined;
  /** Table rows: show which account a row came from; pointless with a single account. */
  showAccount?: boolean;
}

const isSplit = (tx: TransactionRow): boolean =>
  tx.personal_amount != null && tx.personal_amount < Math.abs(tx.amount ?? 0);

/** "Worth it" / "Not worth it" once answered, for the row's quiet second line. */
const worthItNote = (tx: TransactionRow): string | null =>
  tx.worth_it === "yes" ? "Worth it" : tx.worth_it === "no" ? "Not worth it" : null;

/** An open "worth it?" question: a hint on the row, answered in the row's sheet. */
function WorthItHint({ tx }: { tx: TransactionRow }) {
  if (isSplitwiseShare(tx) || !isWorthItEligible(tx)) return null;
  return <span className="shrink-0 font-medium text-primary">Worth it?</span>;
}

/** Signed amount in the transaction's own currency, with the euro value under it if foreign. */
function AmountText({ tx }: { tx: TransactionRow }) {
  const native = nativeSignedAmount(tx);
  if (native == null) return <span className="text-sm text-muted-foreground">—</span>;
  const currency = tx.currency ?? "EUR";
  const positive = native >= 0;
  const eur = tx.signed_amount_eur;
  return (
    <div className="shrink-0 text-right">
      <div
        className={`font-figure text-[0.9375rem] whitespace-nowrap ${
          positive ? "text-positive" : "text-foreground"
        }`}
      >
        {formatSignedMoney(native, currency)}
      </div>
      {currency !== "EUR" && eur != null && (
        <div className="font-figure text-xs whitespace-nowrap text-muted-foreground">
          ≈ {formatMoney(Math.abs(eur), "EUR")}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-1">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="flex min-w-0 justify-end text-sm">{children}</div>
    </div>
  );
}

/** Every editor for one bank transaction: a bottom sheet on a phone, a side panel on desktop. */
function TransactionEditSheet({
  open,
  onOpenChange,
  ...p
}: TransactionViewProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const isMobile = useIsMobile();
  const { tx } = p;
  const name = tx.creditor_name ?? "—";
  const share = isSplitwiseShare(tx);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-[88dvh] gap-0 overflow-y-auto rounded-t-xl border-0 bg-background p-0 pb-[env(safe-area-inset-bottom)] md:max-h-none md:rounded-none md:border-l [&>button]:size-11"
      >
        <div
          aria-hidden
          className="mx-auto mt-2 h-1 w-9 rounded-full bg-muted-foreground/40 md:hidden"
        />
        <SheetHeader className="px-5 pt-3 pb-3 text-left md:pt-6">
          <SheetTitle className="truncate pr-10 text-xl">{name}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            {formatBookingDate(tx.booking_date)} · {p.accountLabel}
          </p>
          <div className="pt-1 text-left">
            <AmountText tx={tx} />
          </div>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4">
          <GroupedList>
            <Field label="Name">
              <NameEditor name={tx.creditor_name} onSave={p.onRename} saving={p.savingRename} />
            </Field>
            {p.onSaveAmount && (
              <Field label="Amount">
                <AmountEditor
                  amount={Math.abs(tx.amount ?? 0)}
                  currency={tx.currency ?? "EUR"}
                  onSave={p.onSaveAmount}
                  saving={p.savingAmount ?? false}
                />
              </Field>
            )}
            <Field label="Category">
              <CategoryPicker
                tx={tx}
                onSelect={(c) => p.onSelectCategory(c, { inSheet: true })}
                saving={p.savingCategory}
              />
            </Field>
            {p.makeRule && (
              <button
                type="button"
                onClick={p.makeRule.onClick}
                className="flex min-h-12 w-full items-center px-4 text-left text-sm font-medium hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {p.makeRule.label}
              </button>
            )}
            {!share && (
              <>
                <Field label="Type">
                  <TypePicker tx={tx} onSelect={p.onSelectType} saving={p.savingType} />
                </Field>
                <Field label="Split">
                  <SplitEditor
                    tx={tx}
                    onSave={p.onSaveSplit}
                    saving={p.savingSplit}
                    contacts={p.splitContacts}
                  />
                </Field>
              </>
            )}
          </GroupedList>
          {!share && (
            <GroupedList>
              {(tx.worth_it != null || isWorthItEligible(tx)) && (
                <Field label="Worth it">
                  <WorthItPrompt tx={tx} onAnswer={p.onAnswerWorthIt} />
                </Field>
              )}
              <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 px-4 text-sm">
                <span className="text-muted-foreground">Select</span>
                <input
                  type="checkbox"
                  checked={p.selected}
                  onChange={p.onToggleSelect}
                  className="size-5 rounded border-border accent-primary"
                />
              </label>
            </GroupedList>
          )}
          <RefundedBadge flowType={tx.flow_type} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Desktop row: date, merchant (its category icon opens the category picker), amount with its account. Type, split and the rest sit behind ›. */
export function TransactionRowView(props: TransactionViewProps) {
  const { tx, accountLabel, selected, onToggleSelect, highlighted, showAccount = true } = props;
  const [open, setOpen] = useState(false);
  // A Splitwise share lives in its own table: nothing here can edit, select or delete it.
  const share = isSplitwiseShare(tx);
  const notes = [
    tx.category ?? "Uncategorized",
    tx.transaction_type,
    isSplit(tx)
      ? `split, owed ${formatMoney(Math.abs(tx.amount ?? 0) - (tx.personal_amount ?? 0), tx.currency ?? "EUR")}`
      : null,
    share ? null : worthItNote(tx),
  ].filter(Boolean);

  return (
    <tr
      data-entry-ref={tx.entry_reference}
      className={`border-b transition-colors last:border-0 hover:bg-accent ${selected ? "bg-primary/10" : ""} ${highlighted ? "ring-2 ring-inset ring-primary" : ""}`}
    >
      <td className="px-4 py-3">
        {!share && (
          <label className="-m-3.5 inline-flex size-11 cursor-pointer items-center justify-center p-3.5">
            <input
              type="checkbox"
              aria-label={`Select ${tx.creditor_name ?? "transaction"}`}
              checked={selected}
              onChange={onToggleSelect}
              className="size-4 rounded border-border accent-primary"
            />
          </label>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
        {formatBookingDateShort(tx.booking_date)}
      </td>
      <td className="w-full max-w-0 px-4 py-3">
        <div className="flex items-center gap-3">
          <CategoryPicker
            tx={tx}
            onSelect={props.onSelectCategory}
            saving={props.savingCategory}
            variant="icon"
          />
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">
              <NameEditor
                name={tx.creditor_name}
                onSave={props.onRename}
                saving={props.savingRename}
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="truncate">{(share ? notes.slice(0, 1) : notes).join(" · ")}</span>
              <WorthItHint tx={tx} />
            </div>
            <RefundedBadge flowType={tx.flow_type} />
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-3">
          <AmountText tx={tx} />
          {(share || showAccount) && <AccountBadge label={share ? "Splitwise" : accountLabel} />}
        </div>
      </td>
      <td className="w-12 px-2 py-3 text-right">
        {!share && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(true)}
              aria-label={`Edit ${tx.creditor_name ?? "transaction"}`}
            >
              <ChevronRight className="size-4" />
            </Button>
            <TransactionEditSheet {...props} open={open} onOpenChange={setOpen} />
          </>
        )}
      </td>
    </tr>
  );
}

/** Phone row: a clean read-only line under its day heading; every editor lives in the sheet that a tap opens. */
export function TransactionCardView(props: TransactionViewProps) {
  const { tx, selected, highlighted } = props;
  const [open, setOpen] = useState(false);
  const share = isSplitwiseShare(tx);

  const summary = (
    <>
      <CategoryAvatar category={tx.category} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9375rem] font-medium text-foreground">
          {tx.creditor_name ?? "—"}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          {share && (
            <span title="Splitwise" className="inline-flex shrink-0">
              <Users className="size-3" aria-hidden />
            </span>
          )}
          <span className="truncate">
            {[
              tx.category ?? "Uncategorized",
              tx.flow_type === "refunded" ? "Refunded" : null,
              share ? null : worthItNote(tx),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <WorthItHint tx={tx} />
        </p>
      </div>
      <AmountText tx={tx} />
    </>
  );

  const rowClass = `${selected ? "bg-primary/10" : ""} ${highlighted ? "ring-2 ring-inset ring-primary" : ""}`;

  return (
    <li data-entry-ref={tx.entry_reference} className={rowClass}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-accent"
      >
        {summary}
      </button>
      <TransactionEditSheet {...props} open={open} onOpenChange={setOpen} />
    </li>
  );
}
