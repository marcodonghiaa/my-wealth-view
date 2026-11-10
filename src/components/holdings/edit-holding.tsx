import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { parseQuantity } from "@/lib/holdings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export type HoldingTarget =
  { kind: "stock"; isin: string } | { kind: "crypto"; symbol: string; source: string };

// set_holding_quantity also writes today's value from the latest price, so net worth moves at
// once (it is built from each holding's latest price snapshot). Before that backend migration
// (PGRST202) only the quantity changes, and net worth follows at the next price sync.
async function saveQuantity(target: HoldingTarget, quantity: number): Promise<void> {
  const { error } = await supabase.rpc("set_holding_quantity", {
    p_kind: target.kind,
    p_key: target.kind === "stock" ? target.isin : target.symbol,
    p_quantity: quantity,
    p_source: target.kind === "crypto" ? target.source : null,
  });
  if (!error) return;
  if ((error as { code?: string }).code !== "PGRST202") throw error;
  const { error: fallback } =
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
  if (fallback) throw fallback;
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
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Edit ${name}`}>
          <Pencil />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="space-y-3">
        <form onSubmit={handleSave} className="space-y-3">
          <label className="block text-xs text-muted-foreground" htmlFor={`qty-${name}`}>
            How many you hold now
          </label>
          <div className="flex gap-2">
            <Input
              id={`qty-${name}`}
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </div>
        </form>
        <Button
          variant="destructive"
          onClick={() => save.mutate(0)}
          disabled={save.isPending}
          className="w-full"
        >
          Mark as sold
        </Button>
        {confirmDelete ? (
          <div className="space-y-2 rounded-lg bg-negative/10 p-3">
            <p className="text-xs text-foreground">
              Deletes {name}, its price history and trades. It also leaves your past net worth. Sold
              it? Use Mark as sold instead.
            </p>
            <div className="flex gap-2">
              <Button variant="quiet" onClick={() => setConfirmDelete(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
                className="flex-1 bg-negative text-white"
              >
                {remove.isPending && <Loader2 className="size-4 animate-spin" />}
                Delete for good
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="w-full">
            Delete
          </Button>
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
