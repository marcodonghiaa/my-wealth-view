import { Button } from "@/components/ui/button";
import {
  formatBookingDateShort,
  formatSignedMoney,
  nativeSignedAmount,
  restoredFlow,
  txId,
  type TransactionRow,
} from "@/lib/transactions";

// Transactions marked as transfers are left out of spending and income. They are listed here so a
// wrong one can be seen and put back. A row the sync paired with its other side on its own
// (pairIdOf) asks to be kept or not instead.
export function TransfersSection({
  rows,
  savingId,
  onRestore,
  pairIdOf = new Map(),
  savingPair,
  onResolvePair,
}: {
  rows: Array<TransactionRow>;
  savingId: string | undefined;
  onRestore: (tx: TransactionRow) => void;
  pairIdOf?: Map<string, string>;
  savingPair?: string | undefined;
  onResolvePair?: (pairId: string, keep: boolean) => void;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-lg bg-card">
      <div className="px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-foreground">Transfers</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Not counted.</p>
      </div>
      <ul className="divide-y border-t">
        {rows.map((tx) => {
          const native = nativeSignedAmount(tx);
          const pairId = pairIdOf.get(txId(tx));
          return (
            <li key={txId(tx)} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {tx.creditor_name?.trim() || "Transfer"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatBookingDateShort(tx.booking_date)}
                  {pairId && " · Auto-paired"}
                </div>
              </div>
              <span className="font-figure text-sm whitespace-nowrap text-foreground">
                {native == null ? "—" : formatSignedMoney(native, tx.currency ?? "EUR")}
              </span>
              {pairId ? (
                <>
                  <Button
                    disabled={savingPair === pairId}
                    onClick={() => onResolvePair?.(pairId, true)}
                    variant="quiet"
                    size="sm"
                    className="bg-muted"
                  >
                    Keep
                  </Button>
                  <Button
                    disabled={savingPair === pairId}
                    onClick={() => onResolvePair?.(pairId, false)}
                    variant="quiet"
                    size="sm"
                    className="bg-muted"
                  >
                    Not a transfer
                  </Button>
                </>
              ) : (
                <Button
                  disabled={savingId === txId(tx)}
                  onClick={() => onRestore(tx)}
                  variant="quiet"
                  size="sm"
                  className="bg-muted"
                >
                  Count as {restoredFlow(tx)}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
