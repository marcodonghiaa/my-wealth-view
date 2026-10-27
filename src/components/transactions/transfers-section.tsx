import {
  formatBookingDateShort,
  formatMoney,
  nativeSignedAmount,
  restoredFlow,
  txId,
  type TransactionRow,
} from "@/lib/transactions";

// Transactions marked as transfers are left out of spending and income. They are listed here so a
// wrong one can be seen and put back.
export function TransfersSection({
  rows,
  savingId,
  onRestore,
}: {
  rows: Array<TransactionRow>;
  savingId: string | undefined;
  onRestore: (tx: TransactionRow) => void;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl bg-card">
      <div className="px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-foreground">Transfers</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Not counted as spending or income. Move one back if it was marked by mistake.
        </p>
      </div>
      <ul className="divide-y border-t">
        {rows.map((tx) => {
          const native = nativeSignedAmount(tx);
          return (
            <li key={txId(tx)} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {tx.creditor_name?.trim() || "Transfer"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatBookingDateShort(tx.booking_date)}
                </div>
              </div>
              <span className="font-figure text-sm whitespace-nowrap text-foreground">
                {native == null ? "—" : formatMoney(native, tx.currency ?? "EUR")}
              </span>
              <button
                type="button"
                disabled={savingId === txId(tx)}
                onClick={() => onRestore(tx)}
                className="h-9 shrink-0 rounded-full bg-muted px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                Count as {restoredFlow(tx)}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
