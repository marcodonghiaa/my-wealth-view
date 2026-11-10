import { Button, buttonVariants } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCategories } from "@/lib/use-categories";
import { parseQuantity } from "@/lib/holdings";
import { ADDED_TRANSACTION_QUERIES } from "@/lib/transactions";

type Direction = "DBIT" | "CRDT";

type NewTransaction = {
  date: string;
  description: string;
  amount: number;
  direction: Direction;
  category: string | null;
  source: string | null;
};

// Database function add_manual_transaction: puts the row on a manual account for its source.
async function addTransaction(tx: NewTransaction): Promise<void> {
  const { error } = await supabase.rpc("add_manual_transaction", {
    p_booking_date: tx.date,
    p_description: tx.description,
    p_amount: tx.amount,
    p_direction: tx.direction,
    p_category: tx.category,
    p_source: tx.source,
  });
  if (error) {
    // PGRST202: the function does not exist yet, so the backend migration was not applied.
    throw new Error(
      (error as { code?: string }).code === "PGRST202"
        ? "Adding needs a database update first: run supabase db push in the backend."
        : error.message,
    );
  }
}

const field = fieldClass();

// A transaction typed in by hand: for a bank that isn't linked, or cash. With no category,
// the next sync picks one (your rules first, then the AI).
export function AddTransaction({ today }: { today: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const categories = useCategories().list;
  const [direction, setDirection] = useState<Direction>("DBIT");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDirection("DBIT");
    setAmount("");
    setDate(today);
    setDescription("");
    setCategory("");
    setSource("");
    setError(null);
  }

  const add = useMutation({
    mutationFn: addTransaction,
    onSuccess: (_data, tx) => {
      toast.success(`${tx.description} added`);
      for (const k of ADDED_TRANSACTION_QUERIES)
        void queryClient.invalidateQueries({ queryKey: [k] });
      setOpen(false);
      reset();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't add"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseQuantity(amount);
    if (value == null) return setError("Enter an amount above zero, e.g. 12.50.");
    if (!description.trim()) return setError("Add a description, e.g. the shop or what it was.");
    if (!date) return setError("Pick a date.");
    setError(null);
    add.mutate({
      date,
      description: description.trim(),
      amount: value,
      direction,
      category: category || null,
      source: source.trim() || null,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        aria-label="Add transaction"
        className={cn(buttonVariants({ size: "icon" }), "[&_svg]:size-5")}
      >
        <Plus className="size-5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add transaction</DialogTitle>
          <DialogDescription>
            For a bank that isn't linked, or cash. Leave the category empty and the next sync picks
            one.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <div role="radiogroup" aria-label="Direction" className="grid grid-cols-2 gap-2">
            {(
              [
                ["DBIT", "Money out"],
                ["CRDT", "Money in"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={direction === value}
                onClick={() => setDirection(value)}
                className={`min-h-11 rounded-sm border text-sm font-medium ${
                  direction === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="block space-y-1 text-xs text-muted-foreground">
            <span>Amount (EUR)</span>
            <input
              aria-label="Amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={field}
            />
          </label>
          <label className="block space-y-1 text-xs text-muted-foreground">
            <span>Description</span>
            <input
              aria-label="Description"
              placeholder="e.g. Dinner at Mario's"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={field}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-2">
            <label className="block min-w-0 space-y-1 text-xs text-muted-foreground">
              <span>Date</span>
              <input
                aria-label="Date"
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                className={field}
              />
            </label>
            <label className="block min-w-0 space-y-1 text-xs text-muted-foreground">
              <span>From</span>
              <input
                aria-label="From"
                placeholder="Manual"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className={field}
              />
            </label>
          </div>
          <label className="block space-y-1 text-xs text-muted-foreground">
            <span>Category</span>
            <select
              aria-label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={field}
            >
              <option value="">Pick for me</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <Button type="submit" disabled={add.isPending} className="w-full">
            {add.isPending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
