import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Trash2 } from "lucide-react";
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
import { formatDay } from "@/lib/date";
import { localToday, netShares, parseAmount } from "@/lib/trades";
import { parseQuantity } from "@/lib/holdings";
import { formatEur } from "@/lib/transactions";
import type { SavedTrade } from "@/lib/use-performance";

interface Form {
  side: string;
  date: string;
  shares: string;
  price: string;
  fee: string;
}

const blank = (): Form => ({ side: "buy", date: localToday(), shares: "", price: "", fee: "" });

const INPUT =
  "w-full rounded-lg border bg-background px-3 py-2 text-base focus:ring-2 focus:ring-ring focus:outline-none";

function validate(form: Form) {
  const shares = parseQuantity(form.shares);
  const price = parseAmount(form.price);
  const fee = form.fee.trim() === "" ? 0 : parseAmount(form.fee);
  if (!form.date) return { error: "Pick the date of the trade." };
  if (form.date > localToday()) return { error: "The date can't be in the future." };
  if (shares == null) return { error: "Shares must be a number above zero." };
  if (price == null) return { error: "Price must be a number." };
  if (fee == null) return { error: "Fee must be a number." };
  return {
    values: {
      side: form.side,
      trade_date: form.date,
      shares,
      price_eur: price,
      fee_eur: fee,
    },
  };
}

/** Every buy and sell of one holding: add, correct or remove them. */
export function TradesDialog({
  kind,
  holdingKey,
  name,
  quantity,
  trades,
  label,
}: {
  kind: "stock" | "crypto";
  holdingKey: string;
  name: string;
  quantity: number;
  trades: Array<SavedTrade>;
  label: string;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const done = (message: string) => {
    toast.success(message);
    void queryClient.invalidateQueries({ queryKey: ["holding-trades"] });
    setForm(blank());
    setEditing(null);
    setError(null);
  };
  const failed = (err: Error) => setError(err.message);

  const save = useMutation({
    mutationFn: async (values: NonNullable<ReturnType<typeof validate>["values"]>) => {
      if (editing) {
        const { error: e } = await supabase.from("holding_trades").update(values).eq("id", editing);
        if (e) throw e;
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("You're signed out. Sign in and try again.");
      const { error: e } = await supabase
        .from("holding_trades")
        .insert({ ...values, kind, key: holdingKey, user_id: data.user.id });
      if (e) throw e;
    },
    onSuccess: () => done(editing ? "Trade updated" : "Trade added"),
    onError: failed,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: e } = await supabase.from("holding_trades").delete().eq("id", id);
      if (e) throw e;
    },
    onSuccess: () => done("Trade removed"),
    onError: failed,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = validate(form);
    if (result.values) save.mutate(result.values);
    else setError(result.error);
  }

  const set = (field: keyof Form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const sorted = [...trades].sort((a, b) => b.trade_date.localeCompare(a.trade_date));
  const net = netShares(trades);

  return (
    <Dialog>
      <DialogTrigger className="min-h-6 text-xs text-primary underline-offset-2 hover:underline">
        {label}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            Trades add up to {net.toLocaleString("en-IE", { maximumFractionDigits: 8 })}; you hold{" "}
            {quantity.toLocaleString("en-IE", { maximumFractionDigits: 8 })}. Prices are per share,
            in EUR.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 text-left">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="trade-side">
              Type
            </label>
            <select id="trade-side" value={form.side} onChange={set("side")} className={INPUT}>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="trade-date">
              Date
            </label>
            <input
              id="trade-date"
              type="date"
              max={localToday()}
              value={form.date}
              onChange={set("date")}
              className={INPUT}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="trade-shares">
              Shares
            </label>
            <input
              id="trade-shares"
              inputMode="decimal"
              value={form.shares}
              onChange={set("shares")}
              className={INPUT}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="trade-price">
              Price per share (EUR)
            </label>
            <input
              id="trade-price"
              inputMode="decimal"
              value={form.price}
              onChange={set("price")}
              className={INPUT}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="trade-fee">
              Fee (EUR, optional)
            </label>
            <input
              id="trade-fee"
              inputMode="decimal"
              value={form.fee}
              onChange={set("fee")}
              className={INPUT}
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={save.isPending}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save trade" : "Add trade"}
            </button>
          </div>
          {error && (
            <p role="alert" className="col-span-2 text-sm text-negative">
              {error}
            </p>
          )}
        </form>

        {sorted.length > 0 && (
          <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border text-sm">
            {sorted.map((t) => (
              <li key={t.id} className="flex items-center gap-2 px-3 py-1">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">
                    {t.side === "buy" ? "Bought" : "Sold"} {t.shares}
                  </span>{" "}
                  at {formatEur(t.price_eur)}
                  <span className="block text-xs text-muted-foreground">
                    {formatDay(t.trade_date)}
                    {t.fee_eur > 0 && ` · fee ${formatEur(t.fee_eur)}`}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Edit trade of ${t.trade_date}`}
                  onClick={() => {
                    setEditing(t.id);
                    setError(null);
                    setForm({
                      side: t.side,
                      date: t.trade_date,
                      shares: String(t.shares),
                      price: String(t.price_eur),
                      fee: t.fee_eur ? String(t.fee_eur) : "",
                    });
                  }}
                  className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Remove trade of ${t.trade_date}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(t.id)}
                  className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
