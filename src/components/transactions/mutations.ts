import { useMutation, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TransactionRow } from "@/lib/transactions";

// Shared shape behind updateCategory/updateType/answerWorthIt: update one column
// on one transaction, with optimistic cache update + rollback.
export function useTransactionFieldMutation<K extends "category" | "transaction_type" | "worth_it">(
  queryClient: QueryClient,
  monthKey: string,
  column: K,
  opts: { errorMessage: string; successMessage?: (value: TransactionRow[K]) => string },
) {
  type Vars = { entryReference: string; value: TransactionRow[K] };
  type Context = { previous: Array<TransactionRow> | undefined };

  return useMutation<void, Error, Vars, Context>({
    mutationFn: async ({ entryReference, value }) => {
      const { error } = await supabase
        .from("transactions")
        .update({ [column]: value } as never)
        .eq("entry_reference", entryReference);
      if (error) throw error;
    },
    onMutate: async ({ entryReference, value }) => {
      await queryClient.cancelQueries({ queryKey: ["transactions", monthKey] });
      const previous = queryClient.getQueryData<Array<TransactionRow>>(["transactions", monthKey]);
      queryClient.setQueryData<Array<TransactionRow>>(["transactions", monthKey], (old) =>
        old
          ? old.map((row) =>
              row.entry_reference === entryReference ? { ...row, [column]: value } : row,
            )
          : old,
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
  type Vars = { entryReference: string; personalAmount: number | null; owedBy: string | null };
  type Context = { previous: Array<TransactionRow> | undefined };

  return useMutation<void, Error, Vars, Context>({
    mutationFn: async ({ entryReference, personalAmount, owedBy }) => {
      const { error } = await supabase
        .from("transactions")
        .update({ personal_amount: personalAmount, owed_by: owedBy })
        .eq("entry_reference", entryReference);
      if (error) throw error;
    },
    onMutate: async ({ entryReference, personalAmount, owedBy }) => {
      await queryClient.cancelQueries({ queryKey: ["transactions", monthKey] });
      const previous = queryClient.getQueryData<Array<TransactionRow>>(["transactions", monthKey]);
      queryClient.setQueryData<Array<TransactionRow>>(["transactions", monthKey], (old) =>
        old
          ? old.map((row) =>
              row.entry_reference === entryReference
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
    mutationFn: async ({
      entryReferences,
      category: next,
    }: {
      entryReferences: Array<string>;
      category: string;
    }) => {
      const { error } = await supabase
        .from("transactions")
        .update({ category: next })
        .in("entry_reference", entryReferences);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.setQueryData<Array<TransactionRow>>(["transactions", monthKey], (old) =>
        old
          ? old.map((row) =>
              vars.entryReferences.includes(row.entry_reference)
                ? { ...row, category: vars.category }
                : row,
            )
          : old,
      );
      toast.success(
        `Set ${vars.entryReferences.length} transaction${vars.entryReferences.length === 1 ? "" : "s"} to ${vars.category}`,
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
