import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { parseQuantity } from "@/lib/holdings";

export type HoldingTarget =
  { kind: "stock"; isin: string } | { kind: "crypto"; symbol: string; source: string };

async function saveQuantity(target: HoldingTarget, quantity: number): Promise<void> {
  const { error } =
    target.kind === "stock"
      ? await supabase
          .from("portfolio_holdings")
          .update({ shares: quantity })
          .eq("isin", target.isin)
      : await supabase
          .from("crypto_holdings")
          .update({ amount: quantity })
          .eq("asset_symbol", target.symbol)
          .eq("source", target.source);
  if (error) throw error;
}

// Change how many you hold, or mark it sold. Sold sets the quantity to 0 instead of deleting the
// row, so the holding's price history (and past net worth) stays.
export function EditHolding({
  target,
  name,
  quantity,
}: {
  target: HoldingTarget;
  name: string;
  quantity: number;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(quantity));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (next: number) => saveQuantity(target, next),
    onSuccess: (_data, next) => {
      toast.success(next === 0 ? `${name} marked as sold` : `${name} updated`);
      void queryClient.invalidateQueries({
        queryKey: [target.kind === "stock" ? "portfolio-latest" : "crypto-latest"],
      });
      void queryClient.invalidateQueries({ queryKey: ["net-worth-daily"] });
      setOpen(false);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't save"),
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const next = parseQuantity(value);
    if (next == null) {
      setError("Enter a number above zero, or use Mark as sold.");
      return;
    }
    setError(null);
    save.mutate(next);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValue(String(quantity));
          setError(null);
        }
      }}
    >
      <PopoverTrigger
        aria-label={`Edit ${name}`}
        className="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Pencil className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="space-y-3">
        <form onSubmit={handleSave} className="space-y-3">
          <label className="block text-xs text-muted-foreground" htmlFor={`qty-${name}`}>
            How many you hold now
          </label>
          <div className="flex gap-2">
            <input
              id={`qty-${name}`}
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-base focus:ring-2 focus:ring-ring focus:outline-none"
            />
            <button
              type="submit"
              disabled={save.isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              Save
            </button>
          </div>
        </form>
        <button
          type="button"
          onClick={() => save.mutate(0)}
          disabled={save.isPending}
          className="min-h-11 w-full rounded-lg border px-3 text-sm font-medium text-negative hover:bg-negative/10 disabled:opacity-50"
        >
          Mark as sold
        </button>
        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
