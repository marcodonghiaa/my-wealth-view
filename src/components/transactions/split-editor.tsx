import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatAmountPlain, formatMoney, type TransactionRow } from "@/lib/transactions";

// Lets you record that only part of a transaction was actually yours (e.g.
// you fronted a group flight booking) -- personal_amount is what counts
// toward your spend analytics, the rest shows on the Owed dashboard as a
// receivable from whoever owed_by names.
export function SplitEditor({
  tx,
  onSave,
  saving,
}: {
  tx: TransactionRow;
  onSave: (personalAmount: number | null, owedBy: string | null) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const fullAmount = Math.abs(tx.amount ?? 0);
  const [shareInput, setShareInput] = useState(() => String(tx.personal_amount ?? fullAmount));
  const [owedByInput, setOwedByInput] = useState(tx.owed_by ?? "");

  const isSplit = tx.personal_amount != null && tx.personal_amount < fullAmount;
  const owed = isSplit ? fullAmount - (tx.personal_amount as number) : 0;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setShareInput(String(tx.personal_amount ?? fullAmount));
          setOwedByInput(tx.owed_by ?? "");
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Split ${tx.creditor_name ?? "transaction"}`}
          disabled={saving}
          className="-m-2 inline-flex min-h-11 cursor-pointer items-center p-2 disabled:opacity-60"
        >
          {isSplit ? (
            <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20">
              Split · owed {formatMoney(owed, tx.currency ?? "EUR")}
            </span>
          ) : (
            <span className="inline-flex rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent">
              Split…
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2.5 p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Your share ({tx.currency ?? "EUR"}, full amount {formatAmountPlain(fullAmount)})
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max={fullAmount}
            value={shareInput}
            onChange={(e) => setShareInput(e.target.value)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Owed by (optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Anna, Luca"
            value={owedByInput}
            onChange={(e) => setOwedByInput(e.target.value)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
          />
        </div>
        <div className="flex gap-2 pt-1">
          {isSplit && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSave(null, null);
              }}
              className="min-h-9 flex-1 rounded-lg border px-3 text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const parsed = Number(shareInput);
              if (!Number.isFinite(parsed) || parsed < 0 || parsed > fullAmount) return;
              setOpen(false);
              // Full amount = same as unset, keeps the "NULL means whole
              // thing is mine" convention the schema/views rely on.
              onSave(
                parsed === fullAmount ? null : parsed,
                parsed === fullAmount ? null : owedByInput.trim() || null,
              );
            }}
            className="min-h-9 flex-1 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Save
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
