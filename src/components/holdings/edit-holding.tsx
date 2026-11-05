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

// Deletes the holding for good, with its price history and trades (database function
// delete_holding): for one added by mistake. Its value also leaves past net worth.
async function deleteHolding(target: HoldingTarget): Promise<void> {
  const { error } = await supabase.rpc("delete_holding", {
    p_kind: target.kind,
    p_key: target.kind === "stock" ? target.isin : target.symbol,
    p_source: target.kind === "crypto" ? target.source : null,
  });
  if (error) {
    // PGRST202: the function does not exist yet, so the backend migration was not applied.
    throw new Error(
      (error as { code?: string }).code === "PGRST202"
        ? "Deleting needs a database update first: run supabase db push in the backend."
        : error.message,
    );
  }
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
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: [target.kind === "stock" ? "portfolio-latest" : "crypto-latest"],
    });
    void queryClient.invalidateQueries({ queryKey: ["net-worth-daily"] });
    // Returns compare trades with the quantity held; delete also removes the trades.
    void queryClient.invalidateQueries({ queryKey: ["holding-performance"] });
    void queryClient.invalidateQueries({ queryKey: ["holding-trades"] });
  };

  const remove = useMutation({
    mutationFn: () => deleteHolding(target),
    onSuccess: () => {
      toast.success(`${name} deleted`);
      refresh();
      setOpen(false);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't delete"),
  });

  const save = useMutation({
    mutationFn: (next: number) => saveQuantity(target, next),
    onSuccess: (_data, next) => {
      toast.success(next === 0 ? `${name} marked as sold` : `${name} updated`);
      refresh();
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
          setConfirmDelete(false);
        }
      }}
    >
      <PopoverTrigger
        aria-label={`Edit ${name}`}
        className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
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
              className="min-w-0 flex-1 rounded-full border bg-background px-3 py-2 text-base focus:ring-2 focus:ring-ring focus:outline-none"
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
        {confirmDelete ? (
          <div className="space-y-2 rounded-lg bg-negative/10 p-3">
            <p className="text-xs text-foreground">
              Deletes {name}, its price history and trades. It also leaves your past net worth. Sold
              it? Use Mark as sold instead.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-negative px-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {remove.isPending && <Loader2 className="size-4 animate-spin" />}
                Delete for good
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="min-h-11 w-full rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted"
          >
            Delete
          </button>
        )}
        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
