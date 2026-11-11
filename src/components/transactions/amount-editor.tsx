import { ambiguousNumberHint, inputNumber } from "@/lib/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
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
  const [input, setInput] = useState(() => inputNumber(amount));
  const [error, setError] = useState<string | null>(null);

  function save() {
    const next = parseQuantity(input);
    if (next == null)
      return setError(ambiguousNumberHint(input) ?? "Enter an amount above zero, e.g. 12.50.");
    setOpen(false);
    if (next !== amount) onSave(next);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setInput(inputNumber(amount));
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
          className="cursor-pointer font-figure text-foreground decoration-dotted underline-offset-4 hover:underline disabled:opacity-60"
        >
          {formatMoney(amount, currency)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2.5 p-3">
        <label className="block text-xs font-medium text-muted-foreground">
          Amount
          <Input
            aria-label="Amount"
            inputMode="decimal"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="mt-1"
          />
        </label>
        {error && (
          <p role="alert" className="text-xs text-negative">
            {error}
          </p>
        )}
        <Button onClick={save} className="w-full px-3">
          Save
        </Button>
      </PopoverContent>
    </Popover>
  );
}
