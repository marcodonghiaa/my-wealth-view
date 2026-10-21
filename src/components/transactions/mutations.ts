import { useMutation, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import {
  restoredFlow,
  txId,
  type SplitwiseShare,
  type TransactionRow,
  type TxKey,
} from "@/lib/transactions";

// account_uid is part of the primary key; filtering on the reference alone would also
// touch the same reference in another account.
function forTx<Q extends { eq: (c: string, v: string) => Q; is: (c: string, v: null) => Q }>(
  query: Q,
  tx: TxKey,
): Q {
  const q = query.eq("entry_reference", tx.entry_reference);
  return tx.account_uid ? q.eq("account_uid", tx.account_uid) : q.is("account_uid", null);
}

// Shared shape behind updateCategory/updateType/answerWorthIt: update one column
// on one transaction, with optimistic cache update + rollback.
// writeColumn: the column to write when it differs from the one shown (a rename is stored in
// custom_name so the bank sync never overwrites it); the list is refetched to show the result.
export function useTransactionFieldMutation<
  K extends "category" | "transaction_type" | "worth_it" | "creditor_name",
>(
  queryClient: QueryClient,
  monthKey: string,
  column: K,
  opts: {
    errorMessage: string;
    successMessage?: (value: TransactionRow[K]) => string;
    writeColumn?: string;
  },
) {
  type Vars = { tx: TxKey; value: TransactionRow[K] };
  type Context = { previous: Array<TransactionRow> | undefined };

  return useMutation<void, Error, Vars, Context>({
    mutationFn: async ({ tx, value }) => {
      const { error } = await forTx(
        supabase.from("transactions").update({ [opts.writeColumn ?? column]: value } as never),
        tx,
      );
      if (error) throw error;
    },
    onMutate: async ({ tx, value }) => {
      await queryClient.cancelQueries({ queryKey: ["transactions", monthKey] });
      const previous = queryClient.getQueryData<Array<TransactionRow>>(["transactions", monthKey]);
      queryClient.setQueryData<Array<TransactionRow>>(["transactions", monthKey], (old) =>
        old ? old.map((row) => (txId(row) === txId(tx) ? { ...row, [column]: value } : row)) : old,
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["transactions", monthKey], context.previous);
      toast.error(opts.errorMessage, { description: error.message });
    },
    onSuccess: (_data, vars) => {
      if (opts.successMessage) toast.success(opts.successMessage(vars.value));
    },
    onSettled: () => {
      if (opts.writeColumn)
        void queryClient.invalidateQueries({ queryKey: ["transactions", monthKey] });
    },
  });
}

// Splitting updates personal_amount + owed_by together, so it's a separate
// mutation rather than another useTransactionFieldMutation call -- same
// optimistic-update/rollback shape either way.
export function useSplitMutation(queryClient: QueryClient, monthKey: string) {
  type Vars = { tx: TxKey; personalAmount: number | null; owedBy: string | null };
  type Context = { previous: Array<TransactionRow> | undefined };

  return useMutation<void, Error, Vars, Context>({
    mutationFn: async ({ tx, personalAmount, owedBy }) => {
      const { error } = await forTx(
        supabase.from("transactions").update({ personal_amount: personalAmount, owed_by: owedBy }),
        tx,
      );
      if (error) throw error;
    },
    onMutate: async ({ tx, personalAmount, owedBy }) => {
      await queryClient.cancelQueries({ queryKey: ["transactions", monthKey] });
      const previous = queryClient.getQueryData<Array<TransactionRow>>(["transactions", monthKey]);
      queryClient.setQueryData<Array<TransactionRow>>(["transactions", monthKey], (old) =>
        old
          ? old.map((row) =>
              txId(row) === txId(tx)
                ? { ...row, personal_amount: personalAmount, owed_by: owedBy }
                : row,
            )
          : old,
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["transactions", monthKey], context.previous);
      toast.error("Couldn't save split", { description: error.message });
    },
    onSuccess: () => toast.success("Split saved"),
  });
}

// One statement per account so the reference list can't match another account's rows.
async function updateTxs(txs: Array<TxKey>, patch: TablesUpdate<"transactions">) {
  const refsByAccount = new Map<string | null, Array<string>>();
  for (const tx of txs) {
    refsByAccount.set(tx.account_uid, [
      ...(refsByAccount.get(tx.account_uid) ?? []),
      tx.entry_reference,
    ]);
  }
  for (const [accountUid, refs] of refsByAccount) {
    const query = supabase.from("transactions").update(patch).in("entry_reference", refs);
    const { error } = await (accountUid
      ? query.eq("account_uid", accountUid)
      : query.is("account_uid", null));
    if (error) throw error;
  }
}

export function useBulkCategoryMutation(
  queryClient: QueryClient,
  monthKey: string,
  onDone: () => void,
) {
  return useMutation({
    mutationFn: ({ txs, category: next }: { txs: Array<TxKey>; category: string }) =>
      updateTxs(txs, { category: next }),
    onSuccess: (_data, vars) => {
      const ids = new Set(vars.txs.map(txId));
      queryClient.setQueryData<Array<TransactionRow>>(["transactions", monthKey], (old) =>
        old
          ? old.map((row) => (ids.has(txId(row)) ? { ...row, category: vars.category } : row))
          : old,
      );
      toast.success(
        `Set ${vars.txs.length} transaction${vars.txs.length === 1 ? "" : "s"} to ${vars.category}`,
      );
      onDone();
    },
    onError: (error) => {
      toast.error("Couldn't update categories", {
        description: (error as Error).message,
      });
    },
  });
}

// Soft delete: the bank sync re-pulls recent history, so a hard delete would come back.
// deleted: false is the undo.
export function useDeleteMutation(queryClient: QueryClient, onDone: () => void) {
  const mutation = useMutation({
    mutationFn: ({ txs, deleted }: { txs: Array<TxKey>; deleted: boolean }) =>
      updateTxs(txs, { deleted_at: deleted ? new Date().toISOString() : null }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      if (!vars.deleted) return;
      onDone();
      toast.success(`Deleted ${vars.txs.length} transaction${vars.txs.length === 1 ? "" : "s"}`, {
        action: {
          label: "Undo",
          onClick: () => mutation.mutate({ txs: vars.txs, deleted: false }),
        },
      });
    },
    onError: (error) => {
      toast.error("Couldn't update transactions", { description: error.message });
    },
  });
  return mutation;
}

// Renaming one transaction renames every one from the same bank merchant, past and future
// (see the rename_merchant function), so every cached month is refetched, not just this one.
export function useRenameMerchantMutation(queryClient: QueryClient) {
  return useMutation<number, Error, { tx: TxKey; name: string | null }>({
    mutationFn: async ({ tx, name }) => {
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => PromiseLike<{ data: number | null; error: Error | null }>
      )("rename_merchant", {
        p_entry_reference: tx.entry_reference,
        p_account_uid: tx.account_uid,
        p_name: name,
      });
      if (error) throw error;
      return data ?? 0;
    },
    onError: (error) => toast.error("Couldn't rename", { description: error.message }),
    onSuccess: (count) => toast.success(count > 1 ? `Renamed on ${count} transactions` : "Renamed"),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["transactions"] }),
  });
}

// A Splitwise share lives in splitwise_expenses; only its name and category can be edited.
// A new category moves spend between categories, so the totals built from it are refetched.
export function useShareMutation(queryClient: QueryClient, monthKey: string) {
  type Vars = { id: string; patch: { description?: string; category?: string } };
  type Context = { previous: Array<SplitwiseShare> | undefined };
  const key = ["splitwise-shares", monthKey];

  return useMutation<void, Error, Vars, Context>({
    mutationFn: async ({ id, patch }) => {
      const { error } = await supabase.from("splitwise_expenses").update(patch).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Array<SplitwiseShare>>(key);
      queryClient.setQueryData<Array<SplitwiseShare>>(key, (old) =>
        old?.map((share) => (share.id === id ? { ...share, ...patch } : share)),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error("Couldn't save change", { description: error.message });
    },
    onSettled: () => {
      for (const k of ["splitwise-shares", "spend-by-category", "category-transactions"]) {
        void queryClient.invalidateQueries({ queryKey: [k] });
      }
    },
  });
}

// Puts a transaction marked as a transfer back into spending or income. The row leaves the
// transfers list at once; the month's totals are refetched.
export function useFlowMutation(queryClient: QueryClient, monthKey: string) {
  type Vars = { tx: TransactionRow };
  type Context = { previous: Array<TransactionRow> | undefined };
  const key = ["transfers", monthKey];

  return useMutation<void, Error, Vars, Context>({
    mutationFn: async ({ tx }) => {
      const { error } = await forTx(
        supabase.from("transactions").update({ flow_type: restoredFlow(tx) }),
        tx,
      );
      if (error) throw error;
    },
    onMutate: async ({ tx }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Array<TransactionRow>>(key);
      queryClient.setQueryData<Array<TransactionRow>>(key, (old) =>
        old?.filter((row) => txId(row) !== txId(tx)),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error("Couldn't move transaction", { description: error.message });
    },
    onSuccess: (_data, { tx }) => {
      toast.success(`Counted as ${restoredFlow(tx)}`);
    },
    onSettled: () => {
      for (const k of ["transactions", "transfers", "spend-by-category", "category-transactions"]) {
        void queryClient.invalidateQueries({ queryKey: [k] });
      }
    },
  });
}
