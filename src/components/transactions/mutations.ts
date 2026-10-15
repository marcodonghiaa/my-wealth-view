import { useMutation, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { txId, type TransactionRow, type TxKey } from "@/lib/transactions";

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
export function useTransactionFieldMutation<K extends "category" | "transaction_type" | "worth_it">(
  queryClient: QueryClient,
  monthKey: string,
  column: K,
  opts: { errorMessage: string; successMessage?: (value: TransactionRow[K]) => string },
) {
  type Vars = { tx: TxKey; value: TransactionRow[K] };
  type Context = { previous: Array<TransactionRow> | undefined };

  return useMutation<void, Error, Vars, Context>({
    mutationFn: async ({ tx, value }) => {
      const { error } = await forTx(
        supabase.from("transactions").update({ [column]: value } as never),
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

export function useBulkCategoryMutation(
  queryClient: QueryClient,
  monthKey: string,
  onDone: () => void,
) {
  return useMutation({
    mutationFn: async ({ txs, category: next }: { txs: Array<TxKey>; category: string }) => {
      // One statement per account so the reference list can't match another account's rows.
      const refsByAccount = new Map<string | null, Array<string>>();
      for (const tx of txs) {
        refsByAccount.set(tx.account_uid, [
          ...(refsByAccount.get(tx.account_uid) ?? []),
          tx.entry_reference,
        ]);
      }
      for (const [accountUid, refs] of refsByAccount) {
        const query = supabase
          .from("transactions")
          .update({ category: next })
          .in("entry_reference", refs);
        const { error } = await (accountUid
          ? query.eq("account_uid", accountUid)
          : query.is("account_uid", null));
        if (error) throw error;
      }
    },
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
