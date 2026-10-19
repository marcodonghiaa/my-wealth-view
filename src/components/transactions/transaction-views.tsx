import { AccountBadge, CurrencyBadge } from "@/components/bank-badge";
import { RefundedBadge } from "@/components/refunded-badge";
import {
  formatAmountPlain,
  formatBookingDate,
  formatMoney,
  isSplitwiseShare,
  nativeSignedAmount,
  type TransactionRow,
} from "@/lib/transactions";
import { NameEditor } from "./name-editor";
import { CategoryPicker, TypePicker } from "./pickers";
import { SplitEditor } from "./split-editor";
import { WorthItPrompt } from "./worth-it";

export interface TransactionViewProps {
  tx: TransactionRow;
  accountLabel: string;
  onSelectCategory: (category: string) => void;
  savingCategory: boolean;
  onSelectType: (type: string) => void;
  savingType: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onAnswerWorthIt: (worthIt: "yes" | "no") => void;
  savingSplit: boolean;
  onSaveSplit: (personalAmount: number | null, owedBy: string | null) => void;
  onRename: (name: string | null) => void;
  savingRename: boolean;
  highlighted?: boolean;
}

export function TransactionRowView({
  tx,
  accountLabel,
  onSelectCategory,
  savingCategory,
  onSelectType,
  savingType,
  selected,
  onToggleSelect,
  onAnswerWorthIt,
  savingSplit,
  onSaveSplit,
  onRename,
  savingRename,
  highlighted,
}: TransactionViewProps) {
  const native = nativeSignedAmount(tx);
  const currency = tx.currency ?? "EUR";
  const positive = (native ?? 0) >= 0;
  const eur = tx.signed_amount_eur;
  const showEur = currency !== "EUR" && eur != null;
  // A Splitwise share lives in its own table: nothing here can edit, select or delete it.
  const share = isSplitwiseShare(tx);

  return (
    <tr
      data-entry-ref={tx.entry_reference}
      className={`border-b transition-colors last:border-0 hover:bg-accent/40 ${selected ? "bg-primary/5" : ""} ${highlighted ? "ring-2 ring-inset ring-primary" : ""}`}
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
        {formatBookingDate(tx.booking_date)}
      </td>
      <td className="max-w-48 px-4 py-3">
        <div className="truncate font-medium text-foreground">
          {share ? (
            (tx.creditor_name ?? "—")
          ) : (
            <NameEditor name={tx.creditor_name} onSave={onRename} saving={savingRename} />
          )}
        </div>
        <RefundedBadge flowType={tx.flow_type} />
        {!share && <WorthItPrompt tx={tx} onAnswer={onAnswerWorthIt} />}
      </td>
      <td className="px-4 py-3">
        {share ? (
          <span className="text-muted-foreground">{tx.category ?? "—"}</span>
        ) : (
          <CategoryPicker tx={tx} onSelect={onSelectCategory} saving={savingCategory} />
        )}
      </td>
      <td className="px-4 py-3">
        {!share && <TypePicker tx={tx} onSelect={onSelectType} saving={savingType} />}
      </td>
      <td className="px-4 py-3">
        {!share && <SplitEditor tx={tx} onSave={onSaveSplit} saving={savingSplit} />}
      </td>
      <td className="px-4 py-3">
        <AccountBadge label={share ? "Splitwise" : accountLabel} />
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {native == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span
            className={`inline-flex items-center justify-end gap-1 font-figure font-medium ${
              positive ? "text-positive" : "text-foreground"
            }`}
          >
            {formatAmountPlain(native)}
            <span className="text-xs font-normal text-muted-foreground">{currency}</span>
            {showEur && (
              <span className="ml-0.5 text-sm opacity-80">
                ({formatMoney(eur as number, "EUR")})
              </span>
            )}
          </span>
        )}
      </td>
    </tr>
  );
}

export function TransactionCardView({
  tx,
  accountLabel,
  onSelectCategory,
  savingCategory,
  onSelectType,
  savingType,
  selected,
  onToggleSelect,
  onAnswerWorthIt,
  savingSplit,
  onSaveSplit,
  onRename,
  savingRename,
  highlighted,
}: TransactionViewProps) {
  const native = nativeSignedAmount(tx);
  const currency = tx.currency ?? "EUR";
  const positive = (native ?? 0) >= 0;
  const eur = tx.signed_amount_eur;
  const showEur = currency !== "EUR" && eur != null;
  const share = isSplitwiseShare(tx);

  return (
    <li
      data-entry-ref={tx.entry_reference}
      className={`px-4 py-3 ${selected ? "bg-primary/5" : ""} ${highlighted ? "ring-2 ring-inset ring-primary" : ""}`}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        {share ? (
          <span className="size-4" />
        ) : (
          <label className="-m-3.5 -mt-3 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center p-3.5">
            <input
              type="checkbox"
              aria-label={`Select ${tx.creditor_name ?? "transaction"}`}
              checked={selected}
              onChange={onToggleSelect}
              className="size-4 rounded border-border accent-primary"
            />
          </label>
        )}
        <div className="min-w-0">
          <p className="truncate text-[0.9375rem] font-medium text-foreground">
            {share ? (
              (tx.creditor_name ?? "—")
            ) : (
              <NameEditor name={tx.creditor_name} onSave={onRename} saving={savingRename} />
            )}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            {formatBookingDate(tx.booking_date)}
            <AccountBadge label={share ? "Splitwise" : accountLabel} />
          </p>
          <div className="mt-0.5">
            <RefundedBadge flowType={tx.flow_type} />
            {!share && <WorthItPrompt tx={tx} onAnswer={onAnswerWorthIt} />}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {native == null ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            <>
              <div
                className={`inline-flex items-center justify-end gap-1 font-figure text-[0.9375rem] font-semibold ${
                  positive ? "text-positive" : "text-foreground"
                }`}
              >
                {formatAmountPlain(native)}
              </div>
              {showEur && (
                <div className="font-figure text-xs text-muted-foreground">
                  {formatMoney(eur as number, "EUR")}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {share ? (
          <span className="text-xs text-muted-foreground">{tx.category ?? "—"}</span>
        ) : (
          <>
            <CategoryPicker tx={tx} onSelect={onSelectCategory} saving={savingCategory} />
            <TypePicker tx={tx} onSelect={onSelectType} saving={savingType} />
            <SplitEditor tx={tx} onSave={onSaveSplit} saving={savingSplit} />
          </>
        )}
        {currency !== "EUR" && <CurrencyBadge currency={currency} />}
      </div>
    </li>
  );
}
