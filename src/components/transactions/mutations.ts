import { useMutation, type QueryClient } from "@tanstack/react-query";
import type { SplitRow } from "@/lib/splits";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import type { ReviewGroup, ReviewRow } from "@/lib/transfer-review";
import {
  restoredFlow,
  txId,
  type SplitwiseShare,
  type TransactionRow,
  type TxKey,
} from "@/lib/transactions";

// Picking the Transfer category also moves the row out of spending and income (flow_type),
// the same way the bank sync marks a transfer: it then shows in the Transfers list. A flow the
// user picked is marked as theirs (flow_source "user"), so the next sync leaves it alone.
export const TRANSFER_CATEGORY = "Transfer";
export function categoryPatch(category: string | null): TablesUpdate<"transactions"> {
  return category === TRANSFER_CATEGORY
    ? { category, flow_type: "transfer", flow_source: "user" }
    : { category };
}

// Lists and totals a move into or out of the transfers changes.
const FLOW_KEYS = [
  "transactions",
  "transfers",
  "income",
  "spend-by-category",
  "category-transactions",
  "transfer-review",
];
function refetchFlows(queryClient: QueryClient) {
  for (const k of FLOW_KEYS) void queryClient.invalidateQueries({ queryKey: [k] });
}
// A new category can put a row on the "To review" list or take it off.
const refetchReview = (queryClient: QueryClient) =>
  void queryClient.invalidateQueries({ queryKey: ["transfer-review"] });

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
// on one transaction, with optimistic cache update + rollback. (Renames go through
// useRenameMerchantMutation, which renames the merchant's other rows too.)
export function useTransactionFieldMutation<K extends "category" | "transaction_type" | "worth_it">(
  queryClient: QueryClient,
  monthKey: string,
  column: K,
  opts: {
    errorMessage: string;
    successMessage?: (value: TransactionRow[K]) => string;
    // A button on the success toast, e.g. "Make a rule" after a category change.
    successAction?: (vars: {
      tx: TxKey & Partial<Pick<TransactionRow, "creditor_name">>;
      value: TransactionRow[K];
    }) => { label: string; onClick: () => void } | undefined;
  },
) {
  type Vars = {
    tx: TxKey & Partial<Pick<TransactionRow, "creditor_name">>;
    value: TransactionRow[K];
  };
  type Context = { previous: Array<TransactionRow> | undefined };

  return useMutation<void, Error, Vars, Context>({
    mutationFn: async ({ tx, value }) => {
      const patch =
        column === "category" ? categoryPatch(value as string | null) : { [column]: value };
      const { error } = await forTx(supabase.from("transactions").update(patch as never), tx);
      if (error) throw error;
    },
    onMutate: async ({ tx, value }) => {
      await queryClient.cancelQueries({ queryKey: ["transactions", monthKey] });
      const previous = queryClient.getQueryData<Array<TransactionRow>>(["transactions", monthKey]);
      const toTransfer = column === "category" && value === TRANSFER_CATEGORY;
      queryClient.setQueryData<Array<TransactionRow>>(["transactions", monthKey], (old) =>
        old
          ? toTransfer
            ? old.filter((row) => txId(row) !== txId(tx))
            : old.map((row) => (txId(row) === txId(tx) ? { ...row, [column]: value } : row))
          : old,
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["transactions", monthKey], context.previous);
      toast.error(opts.errorMessage, { description: error.message });
    },
    onSuccess: (_data, vars) => {
      if (opts.successMessage) {
        toast.success(opts.successMessage(vars.value), { action: opts.successAction?.(vars) });
      }
    },
    onSettled: (_data, _error, vars) => {
      if (column !== "category") return;
      if (vars.value === TRANSFER_CATEGORY) refetchFlows(queryClient);
      else refetchReview(queryClient);
    },
  });
}

// New amount for a transaction added by hand. The database refuses it on bank rows.
// A split share above the new amount would break the database's share <= amount rule, so the
// split goes too and can be set again.
export function useManualAmountMutation(queryClient: QueryClient) {
  type Vars = { tx: TxKey & { personal_amount?: number | null }; amount: number };
  return useMutation<void, Error, Vars>({
    mutationFn: async ({ tx, amount }) => {
      const splitTooBig = tx.personal_amount != null && tx.personal_amount > amount;
      const patch = splitTooBig ? { amount, personal_amount: null, owed_by: null } : { amount };
      const { error } = await forTx(supabase.from("transactions").update(patch), tx);
      if (error) throw error;
    },
    onError: (error) => toast.error("Couldn't change amount", { description: error.message }),
    onSuccess: () => toast.success("Amount changed"),
    onSettled: () => refetchFlows(queryClient),
  });
}

// Category of an income row (Income page). Picking Transfer moves it out of income.
export function useIncomeCategoryMutation(queryClient: QueryClient) {
  return useMutation<void, Error, { tx: TxKey; category: string }>({
    mutationFn: async ({ tx, category }) => {
      const { error } = await forTx(
        supabase.from("transactions").update(categoryPatch(category)),
        tx,
      );
      if (error) throw error;
    },
    onError: (error) => toast.error("Couldn't save category", { description: error.message }),
    onSuccess: (_data, { category }) => {
      if (category === TRANSFER_CATEGORY) toast.success("Moved to transfers");
    },
    onSettled: () => refetchFlows(queryClient),
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
    // A new name becomes a saved contact; the Splitwise page's owed totals change too.
    onSettled: () => {
      for (const k of ["split-contacts", "splits"])
        void queryClient.invalidateQueries({ queryKey: [k] });
    },
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
      updateTxs(txs, categoryPatch(next)),
    onSuccess: (_data, vars) => {
      const ids = new Set(vars.txs.map(txId));
      const toTransfer = vars.category === TRANSFER_CATEGORY;
      queryClient.setQueryData<Array<TransactionRow>>(["transactions", monthKey], (old) =>
        old
          ? toTransfer
            ? old.filter((row) => !ids.has(txId(row)))
            : old.map((row) => (ids.has(txId(row)) ? { ...row, category: vars.category } : row))
          : old,
      );
      if (toTransfer) refetchFlows(queryClient);
      else refetchReview(queryClient);
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

// Counting a transfer again also clears its "Transfer" label, which would otherwise stay on a
// row that now counts as spend, and block picking Transfer again (the picker ignores the
// current category). The next sync categorizes it.
export function restorePatch(tx: Pick<TransactionRow, "credit_debit_indicator" | "category">) {
  return tx.category === TRANSFER_CATEGORY
    ? { flow_type: restoredFlow(tx), flow_source: "user", category: null, category_source: null }
    : { flow_type: restoredFlow(tx), flow_source: "user" };
}

// Puts a transaction marked as a transfer back into spending or income. The row leaves the
// transfers list at once; the month's totals are refetched.
export function useFlowMutation(queryClient: QueryClient, monthKey: string) {
  type Vars = { tx: TransactionRow };
  type Context = { previous: Array<TransactionRow> | undefined };
  const key = ["transfers", monthKey];

  return useMutation<void, Error, Vars, Context>({
    mutationFn: async ({ tx }) => {
      // `as never`: category_source is not in the generated types.
      const patch = restorePatch(tx) as never;
      const { error } = await forTx(supabase.from("transactions").update(patch), tx);
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
    onSettled: () => refetchFlows(queryClient),
  });
}

// Marks a split as settled (or not): it then drops out of the open total on the Splitwise page.
// Optimistic, so the button flips at once and a quick second tap reads the new state.
export function useSettleSplitMutation(queryClient: QueryClient) {
  type Vars = { tx: TxKey; settled: boolean };
  type Context = { previous: Array<SplitRow> | undefined };
  return useMutation<void, Error, Vars, Context>({
    mutationFn: async ({ tx, settled }) => {
      const { error } = await forTx(
        supabase.from("transactions").update({
          owed_settled: settled,
          settled_at: settled ? new Date().toISOString() : null,
        }),
        tx,
      );
      if (error) throw error;
    },
    onMutate: async ({ tx, settled }) => {
      await queryClient.cancelQueries({ queryKey: ["splits"] });
      const previous = queryClient.getQueryData<Array<SplitRow>>(["splits"]);
      queryClient.setQueryData<Array<SplitRow>>(["splits"], (old) =>
        old?.map((r) => (txId(r) === txId(tx) ? { ...r, owed_settled: settled } : r)),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["splits"], context.previous);
      toast.error("Couldn't save", { description: error.message });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["splits"] }),
  });
}

// Answers an auto-paired transfer: keep it, or put both sides back in spending and income.
export function useResolvePairMutation(queryClient: QueryClient) {
  return useMutation<void, Error, { pairId: string; keep: boolean }>({
    mutationFn: async ({ pairId, keep }) => {
      const { error } = await supabase.rpc("resolve_transfer_pair", {
        p_pair: pairId,
        p_keep: keep,
      });
      if (error) throw error;
    },
    // The sync may have changed a side since the list loaded (then Keep is refused): the
    // refetch below shows what is true now.
    onError: (error) =>
      toast.error("Couldn't save. List refreshed.", { description: error.message }),
    onSuccess: (_data, { keep }) => toast.success(keep ? "Kept as transfer" : "Counted again"),
    onSettled: () => {
      refetchFlows(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["transfer-pairs"] });
    },
  });
}

export type ReviewChoice = "transfer" | "count";

// Settles a "To review" group: its rows take the chosen flow (a non-transfer row counts by its
// own direction), and a rule makes future rows from the same name follow.
export function useReviewGroupMutation(queryClient: QueryClient) {
  type Context = { previous: Array<ReviewRow> | undefined };
  return useMutation<void, Error, { group: ReviewGroup; choice: ReviewChoice }, Context>({
    mutationFn: async ({ group, choice }) => {
      if (choice === "transfer") {
        await updateTxs(group.rows, { flow_type: "transfer", flow_source: "user" });
      } else {
        const debits = group.rows.filter((r) => restoredFlow(r) === "spend");
        const credits = group.rows.filter((r) => restoredFlow(r) === "income");
        await updateTxs(debits, { flow_type: "spend", flow_source: "user" });
        await updateTxs(credits, { flow_type: "income", flow_source: "user" });
      }
      if (!group.name) return; // nothing a rule could match on
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("You are signed out. Sign in again.");
      // The sync reads "spend" and "income" alike as "not a transfer: count by direction".
      const setFlowType = choice === "transfer" ? "transfer" : restoredFlow(group.rows[0]!);
      // A second answer for the same name changes its rule instead of adding another.
      const { data: existing, error: findError } = await supabase
        .from("category_rules")
        .select("id")
        .eq("match_field", "creditor_name")
        .eq("match_text", group.name)
        .not("set_flow_type", "is", null)
        .limit(1);
      if (findError) throw findError;
      const id = existing?.[0]?.id;
      const { error } = id
        ? await supabase.from("category_rules").update({ set_flow_type: setFlowType }).eq("id", id)
        : await supabase.from("category_rules").insert({
            user_id: data.user.id,
            match_field: "creditor_name",
            match_text: group.name,
            set_category: null,
            set_flow_type: setFlowType,
          });
      if (error) throw error;
    },
    // The group leaves the list at once; the saves and refetches run behind it.
    onMutate: async ({ group }) => {
      await queryClient.cancelQueries({ queryKey: ["transfer-review"] });
      const previous = queryClient.getQueryData<Array<ReviewRow>>(["transfer-review"]);
      const ids = new Set(group.rows.map(txId));
      queryClient.setQueryData<Array<ReviewRow>>(["transfer-review"], (old) =>
        old?.filter((r) => !ids.has(txId(r))),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["transfer-review"], context.previous);
      toast.error("Couldn't save", { description: error.message });
    },
    onSuccess: (_data, { group }) =>
      toast.success(
        `Updated ${group.rows.length} transaction${group.rows.length === 1 ? "" : "s"}`,
      ),
    onSettled: () => {
      refetchFlows(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["category-rules"] });
    },
  });
}
