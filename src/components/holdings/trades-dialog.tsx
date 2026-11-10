import { formatQuantity } from "@/lib/locale";
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
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
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
  label: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const done = (message: string) => {
    toast.success(message);
    void queryClient.invalidateQueries({ queryKey: ["holding-trades"] });
    void queryClient.invalidateQueries({ queryKey: ["holding-performance"] });
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
    <Dialog
      onOpenChange={(open) => {
        // Closing mid-edit must not leave "Save trade" overwriting that trade next time.
        if (!open) {
          setForm(blank());
          setEditing(null);
        }
      }}
    >
      <DialogTrigger
        title={`Trades for ${name}`}
        className="-my-2.5 inline-flex min-h-11 items-center underline-offset-2 hover:underline"
      >
        {label}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            Trades add up to {formatQuantity(net, 8)}; you hold {formatQuantity(quantity, 8)}.
            Prices are per share, in EUR.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 text-left">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="trade-side">
              Type
            </label>
            <Select id="trade-side" value={form.side} onChange={set("side")}>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="trade-date">
              Date
            </label>
            <Input
              id="trade-date"
              type="date"
              max={localToday()}
              value={form.date}
              onChange={set("date")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="trade-shares">
              Shares
            </label>
            <Input
              id="trade-shares"
              inputMode="decimal"
              value={form.shares}
              onChange={set("shares")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="trade-price">
              Price per share (EUR)
            </label>
            <Input
              id="trade-price"
              inputMode="decimal"
              value={form.price}
              onChange={set("price")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="trade-fee">
              Fee (EUR, optional)
            </label>
            <Input id="trade-fee" inputMode="decimal" value={form.fee} onChange={set("fee")} />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={save.isPending} className="w-full">
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save trade" : "Add trade"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="col-span-2 text-sm text-negative">
              {error}
            </p>
          )}
        </form>

        {sorted.length > 0 && (
          <ul className="max-h-64 divide-y divide-hairline overflow-y-auto rounded-lg bg-background text-sm">
            {sorted.map((t) => (
              <li key={t.id} className="flex items-center gap-2 px-3 py-1">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">
                    {t.side === "buy" ? "Bought" : "Sold"} {formatQuantity(t.shares, 8)}
                  </span>{" "}
                  at {formatEur(t.price_eur)}
                  <span className="block text-xs text-muted-foreground">
                    {formatDay(t.trade_date)}
                    {t.fee_eur > 0 && ` · fee ${formatEur(t.fee_eur)}`}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
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
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove trade of ${t.trade_date}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(t.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
