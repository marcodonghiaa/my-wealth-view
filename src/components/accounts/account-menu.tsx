import { useState } from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { ACCOUNT_TYPES, isDebt, parseOwed } from "@/lib/account-types";

export interface MenuAccount {
  uid: string;
  name: string;
  account_type?: string | null | undefined;
  manual?: boolean | null | undefined;
  amount: number | null;
}

const field =
  "h-11 w-full min-w-0 rounded-full border bg-background px-4 text-base focus:ring-2 focus:ring-ring focus:outline-none";

// PGRST202: the function does not exist yet, so the backend migration was not applied.
function rpcError(error: { message: string; code?: string }): Error {
  return new Error(
    error.code === "PGRST202"
      ? "This needs a database update first: run supabase db push in the backend."
      : error.message,
  );
}

// A type or balance change moves the accounts list and net worth.
function refresh(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["bank-accounts-latest"] });
  void queryClient.invalidateQueries({ queryKey: ["net-worth-daily"] });
}

async function setType(uid: string, type: string): Promise<void> {
  const { error } = await supabase.rpc("set_account_type", { p_account: uid, p_type: type });
  if (error) throw rpcError(error);
}

async function setBalance(uid: string, amount: number): Promise<void> {
  const { error } = await supabase.rpc("set_manual_balance", { p_account: uid, p_amount: amount });
  if (error) throw rpcError(error);
}

function OwedForm({ account, onDone }: { account: MenuAccount; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(Math.abs(account.amount ?? 0)));
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (amount: number) => setBalance(account.uid, amount),
    onSuccess: () => {
      toast.success(`${account.name} updated`);
      refresh(queryClient);
      onDone();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't save"),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const amount = parseOwed(value);
        if (amount == null) return setError("Enter what you owe, e.g. 1250.");
        setError(null);
        save.mutate(amount);
      }}
      className="space-y-1"
    >
      <label className="block text-xs text-muted-foreground" htmlFor={`owed-${account.uid}`}>
        Owed now
      </label>
      <div className="flex gap-2">
        <input
          id={`owed-${account.uid}`}
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={field}
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
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
    </form>
  );
}

// For a debt added by mistake or paid off: gone from the list and from net worth.
function DeleteDebt({ account, onDone }: { account: MenuAccount; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("delete_manual_debt", { p_account: account.uid });
      if (error) throw rpcError(error);
    },
    onSuccess: () => {
      toast.success(`${account.name} deleted`);
      refresh(queryClient);
      onDone();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't delete"),
  });
  if (!confirm)
    return (
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="min-h-11 w-full rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted"
      >
        Delete
      </button>
    );
  return (
    <div className="space-y-2 rounded-lg bg-negative/10 p-3">
      <p className="text-xs text-foreground">Deletes {account.name}. It also leaves net worth.</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirm(false)}
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
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
    </div>
  );
}

// The account's menu: its type (for when the bank got it wrong) and, for a debt typed in by
// hand, what is owed now. One menu per bank row covers that bank's accounts.
export function AccountMenu({ title, accounts }: { title: string; accounts: Array<MenuAccount> }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retype = useMutation({
    mutationFn: ({ uid, type }: { uid: string; type: string }) => setType(uid, type),
    onSuccess: () => {
      toast.success("Account type saved");
      refresh(queryClient);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't save"),
  });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <PopoverTrigger
        aria-label={`Edit ${title}`}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Pencil className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="space-y-4">
        {accounts.map((a) => (
          <div key={a.uid} className="space-y-3">
            <label className="block space-y-1 text-xs text-muted-foreground">
              <span>{accounts.length > 1 ? `${a.name}: account type` : "Account type"}</span>
              <select
                value={a.account_type ?? "checking"}
                disabled={retype.isPending}
                onChange={(e) => {
                  setError(null);
                  retype.mutate({ uid: a.uid, type: e.target.value });
                }}
                className={field}
              >
                {/* A manual account only holds a debt typed in by hand. */}
                {ACCOUNT_TYPES.filter(([t]) => !a.manual || isDebt(t)).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {a.manual && (
              <>
                <OwedForm account={a} onDone={() => setOpen(false)} />
                <DeleteDebt account={a} onDone={() => setOpen(false)} />
              </>
            )}
          </div>
        ))}
        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

// A loan or card the bank doesn't show (or a bank that isn't linked): name and what is owed.
/** "Add a debt": a quiet last row of an accounts list that opens the dialog. */
export function AddDebt() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setAmount("");
    setCurrency("EUR");
    setError(null);
  }

  const add = useMutation({
    mutationFn: async (input: { name: string; amount: number; currency: string }) => {
      const { error } = await supabase.rpc("add_manual_debt", {
        p_name: input.name,
        p_amount: input.amount,
        p_currency: input.currency,
      });
      if (error) throw rpcError(error);
    },
    onSuccess: (_data, input) => {
      toast.success(`${input.name} added`);
      refresh(queryClient);
      setOpen(false);
      reset();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't add"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger className="flex min-h-11 w-full items-center gap-2 px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/40 sm:px-5">
        <Plus className="size-4" />
        Add a debt
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a debt</DialogTitle>
          <DialogDescription>
            A loan or card your bank doesn't show. Net worth subtracts it.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const owed = parseOwed(amount);
            if (!name.trim()) return setError("Give it a name, e.g. Car loan.");
            if (owed == null) return setError("Enter what you owe, e.g. 1250.");
            setError(null);
            add.mutate({ name: name.trim(), amount: owed, currency });
          }}
        >
          <label className="block space-y-1 text-xs text-muted-foreground">
            <span>Name</span>
            <input
              aria-label="Name"
              placeholder="e.g. Taxes owed, Family loan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={field}
            />
          </label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="block min-w-0 space-y-1 text-xs text-muted-foreground">
              <span>Owed</span>
              <input
                aria-label="Owed"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={field}
              />
            </label>
            <label className="block space-y-1 text-xs text-muted-foreground">
              <span>Currency</span>
              <select
                aria-label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={field}
              >
                {["EUR", "USD", "GBP", "CHF"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={add.isPending}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {add.isPending && <Loader2 className="size-4 animate-spin" />}
            Save
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
