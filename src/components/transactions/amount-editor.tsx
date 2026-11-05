import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parseQuantity } from "@/lib/holdings";
import { formatMoney } from "@/lib/transactions";

// Changes the amount of a transaction you added by hand (bank amounts are the bank's), e.g. to
// even out a dinner after settling in cash.
export function AmountEditor({
  amount,
  currency,
  onSave,
  saving,
}: {
  amount: number;
  currency: string;
  onSave: (amount: number) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(String(amount));
  const [error, setError] = useState<string | null>(null);

  function save() {
    const next = parseQuantity(input);
    if (next == null) return setError("Enter an amount above zero, e.g. 12.50.");
    setOpen(false);
    if (next !== amount) onSave(next);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setInput(String(amount));
          setError(null);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Change amount"
          disabled={saving}
          className="cursor-pointer font-figure font-medium text-foreground decoration-dotted underline-offset-4 hover:underline disabled:opacity-60"
        >
          {formatMoney(amount, currency)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2.5 p-3">
        <label className="block text-xs font-medium text-muted-foreground">
          Amount
          <input
            aria-label="Amount"
            inputMode="decimal"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-base text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
          />
        </label>
        {error && (
          <p role="alert" className="text-xs text-negative">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={save}
          className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Save
        </button>
      </PopoverContent>
    </Popover>
  );
}
