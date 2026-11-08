import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SplitwiseShare, TransactionRow } from "@/lib/transactions";

type Call = {
  update: unknown;
  eq: Record<string, unknown>;
  is: Record<string, unknown>;
  in: Record<string, unknown[]>;
};
const calls: Call[] = [];
const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => {
      const call: Call = { update: null, eq: {}, is: {}, in: {} };
      const q = {
        update(u: unknown) {
          call.update = u;
          return q;
        },
        eq(col: string, val: unknown) {
          call.eq[col] = val;
          return q;
        },
        is(col: string, val: unknown) {
          call.is[col] = val;
          return q;
        },
        in(col: string, vals: unknown[]) {
          call.in[col] = vals;
          return q;
        },
        then(resolve: (v: { error: null }) => void) {
          calls.push(call);
          resolve({ error: null });
        },
      };
      return q;
    },
  },
}));

import {
  useBulkCategoryMutation,
  useDeleteMutation,
  useFlowMutation,
  useIncomeCategoryMutation,
  useManualAmountMutation,
  restorePatch,
  useRenameMerchantMutation,
  useShareMutation,
  useSettleSplitMutation,
  useSplitMutation,
  useTransactionFieldMutation,
} from "./mutations";

const MONTH = "2026-10-01";
const row = (account_uid: string, entry_reference: string): TransactionRow => ({
  entry_reference,
  account_uid,
  booking_date: "2026-10-02",
  category: "Others",
  transaction_type: null,
  creditor_name: "Shop",
  currency: "EUR",
  amount: 20,
  signed_amount_eur: -20,
  credit_debit_indicator: "DBIT",
  created_at: null,
  worth_it: null,
  personal_amount: null,
  owed_by: null,
  flow_type: "spend",
  refund_of: null,
});

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  // Same reference in two accounts: only one of them may ever change.
  queryClient.setQueryData(["transactions", MONTH], [row("a1", "r1"), row("a2", "r1")]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const cached = () => queryClient.getQueryData<TransactionRow[]>(["transactions", MONTH])!;
  return { queryClient, wrapper, cached };
}

beforeEach(() => {
  calls.length = 0;
});

describe("transaction mutations are scoped to one account", () => {
  it("field update filters on account and reference, and changes only that cached row", async () => {
    const { queryClient, wrapper, cached } = setup();
    const { result } = renderHook(
      () => useTransactionFieldMutation(queryClient, MONTH, "category", { errorMessage: "fail" }),
      { wrapper },
    );
    await act(() =>
      result.current.mutateAsync({
        tx: { account_uid: "a1", entry_reference: "r1" },
        value: "Health",
      }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.eq).toEqual({ account_uid: "a1", entry_reference: "r1" });
    expect(cached().map((r) => r.category)).toEqual(["Health", "Others"]);
  });

  it("split update filters on account and reference, and changes only that cached row", async () => {
    const { queryClient, wrapper, cached } = setup();
    const { result } = renderHook(() => useSplitMutation(queryClient, MONTH), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        tx: { account_uid: "a2", entry_reference: "r1" },
        personalAmount: 5,
        owedBy: "Sam",
      }),
    );
    expect(calls[0]?.eq).toEqual({ account_uid: "a2", entry_reference: "r1" });
    expect(cached().map((r) => r.owed_by)).toEqual([null, "Sam"]);
  });

  // protects=the Settle button; fails_when=it writes the wrong row or leaves settled_at stale
  it("settling a split marks that row settled with a date, and unsettling clears it", async () => {
    const { queryClient, wrapper } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSettleSplitMutation(queryClient), { wrapper });
    const tx = { account_uid: "a2", entry_reference: "r1" };
    await act(() => result.current.mutateAsync({ tx, settled: true }));
    expect(calls[0]?.eq).toEqual(tx);
    expect(calls[0]?.update).toMatchObject({ owed_settled: true, settled_at: expect.any(String) });
    await act(() => result.current.mutateAsync({ tx, settled: false }));
    expect(calls[1]?.update).toEqual({ owed_settled: false, settled_at: null });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["splits"] });
  });

  it("bulk update sends one statement per account and changes only the chosen rows", async () => {
    const { queryClient, wrapper, cached } = setup();
    const { result } = renderHook(() => useBulkCategoryMutation(queryClient, MONTH, vi.fn()), {
      wrapper,
    });
    act(() =>
      result.current.mutate({
        txs: [
          { account_uid: "a1", entry_reference: "r1" },
          { account_uid: "a2", entry_reference: "r2" },
          { account_uid: "a2", entry_reference: "r3" },
        ],
        category: "Health",
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls).toHaveLength(2);
    const byAccount = Object.fromEntries(calls.map((c) => [c.eq["account_uid"] as string, c.in]));
    expect(byAccount).toEqual({
      a1: { entry_reference: ["r1"] },
      a2: { entry_reference: ["r2", "r3"] },
    });
    expect(cached().map((r) => r.category)).toEqual(["Health", "Others"]);
  });

  // Regression: picking Transfer only changed the label, so the row stayed in spending.
  it("picking Transfer also marks the row as a transfer and takes it off the list", async () => {
    const { queryClient, wrapper, cached } = setup();
    const { result } = renderHook(
      () => useTransactionFieldMutation(queryClient, MONTH, "category", { errorMessage: "fail" }),
      { wrapper },
    );
    await act(() =>
      result.current.mutateAsync({
        tx: { account_uid: "a1", entry_reference: "r1" },
        value: "Transfer",
      }),
    );
    expect(calls[0]?.update).toEqual({ category: "Transfer", flow_type: "transfer" });
    expect(cached().map((r) => r.account_uid)).toEqual(["a2"]);
  });

  it("picking another category leaves flow_type alone", async () => {
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(
      () => useTransactionFieldMutation(queryClient, MONTH, "category", { errorMessage: "fail" }),
      { wrapper },
    );
    await act(() =>
      result.current.mutateAsync({
        tx: { account_uid: "a1", entry_reference: "r1" },
        value: "Health",
      }),
    );
    expect(calls[0]?.update).toEqual({ category: "Health" });
  });

  it("bulk Transfer marks every chosen row as a transfer and takes them off the list", async () => {
    const { queryClient, wrapper, cached } = setup();
    const { result } = renderHook(() => useBulkCategoryMutation(queryClient, MONTH, vi.fn()), {
      wrapper,
    });
    act(() =>
      result.current.mutate({
        txs: [{ account_uid: "a2", entry_reference: "r1" }],
        category: "Transfer",
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls[0]?.update).toEqual({ category: "Transfer", flow_type: "transfer" });
    expect(cached().map((r) => r.account_uid)).toEqual(["a1"]);
  });

  it("income: picking Transfer moves the row out of income and refetches the income list", async () => {
    const { queryClient, wrapper } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useIncomeCategoryMutation(queryClient), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        tx: { account_uid: "a1", entry_reference: "r1" },
        category: "Transfer",
      }),
    );
    expect(calls[0]?.update).toEqual({ category: "Transfer", flow_type: "transfer" });
    expect(calls[0]?.eq).toEqual({ account_uid: "a1", entry_reference: "r1" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["income"] });
  });

  it("income: another category changes only the label", async () => {
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useIncomeCategoryMutation(queryClient), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        tx: { account_uid: "a1", entry_reference: "r1" },
        category: "Income",
      }),
    );
    expect(calls[0]?.update).toEqual({ category: "Income" });
  });

  it("a manual row's new amount is written to that row only and the totals refetch", async () => {
    const { queryClient, wrapper } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useManualAmountMutation(queryClient), { wrapper });
    await act(() =>
      result.current.mutateAsync({ tx: { account_uid: "a2", entry_reference: "r1" }, amount: 40 }),
    );
    expect(calls[0]?.update).toEqual({ amount: 40 });
    expect(calls[0]?.eq).toEqual({ account_uid: "a2", entry_reference: "r1" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["transactions"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["spend-by-category"] });
  });

  // Regression: lowering the amount below a split share was refused by the database.
  it("a new amount below the split share clears the split", async () => {
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useManualAmountMutation(queryClient), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        tx: { account_uid: "a1", entry_reference: "r1", personal_amount: 30 },
        amount: 20,
      }),
    );
    expect(calls[0]?.update).toEqual({ amount: 20, personal_amount: null, owed_by: null });
    await act(() =>
      result.current.mutateAsync({
        tx: { account_uid: "a1", entry_reference: "r1", personal_amount: 10 },
        amount: 20,
      }),
    );
    expect(calls[1]?.update).toEqual({ amount: 20 });
  });

  it("soft delete stamps deleted_at per account and undo clears it", async () => {
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useDeleteMutation(queryClient, vi.fn()), { wrapper });
    act(() =>
      result.current.mutate({
        txs: [
          { account_uid: "a1", entry_reference: "r1" },
          { account_uid: "a2", entry_reference: "r1" },
        ],
        deleted: true,
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.eq["account_uid"]).sort()).toEqual(["a1", "a2"]);
    expect(typeof (calls[0]!.update as { deleted_at: unknown }).deleted_at).toBe("string");

    calls.length = 0;
    act(() =>
      result.current.mutate({
        txs: [{ account_uid: "a1", entry_reference: "r1" }],
        deleted: false,
      }),
    );
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.update).toEqual({ deleted_at: null });
  });

  it("rename calls rename_merchant and refetches every month", async () => {
    rpc.mockResolvedValue({ data: 3, error: null });
    const { queryClient, wrapper } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useRenameMerchantMutation(queryClient), { wrapper });
    act(() =>
      result.current.mutate({
        tx: { account_uid: "a1", entry_reference: "r1" },
        name: "Wash machine",
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith("rename_merchant", {
      p_entry_reference: "r1",
      p_account_uid: "a1",
      p_name: "Wash machine",
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["transactions"] });
  });

  it("rename surfaces an rpc error", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("nope") });
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useRenameMerchantMutation(queryClient), { wrapper });
    act(() =>
      result.current.mutate({ tx: { account_uid: null, entry_reference: "r1" }, name: null }),
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("Splitwise share edits", () => {
  const share = (id: string): SplitwiseShare => ({
    id,
    booking_date: "2026-10-02",
    category: "Others",
    description: "Dinner",
    group_name: "Trip",
    currency: "EUR",
    amount: 10,
    amount_eur: 10,
  });

  it("writes the one share by id and shows the change at once", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    queryClient.setQueryData(["splitwise-shares", MONTH], [share("s1"), share("s2")]);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useShareMutation(queryClient, MONTH), { wrapper });
    await act(() => result.current.mutateAsync({ id: "s2", patch: { category: "Dine Out" } }));
    expect(calls[0]?.update).toEqual({ category: "Dine Out" });
    expect(calls[0]?.eq).toEqual({ id: "s2" });
    const cached = queryClient.getQueryData<SplitwiseShare[]>(["splitwise-shares", MONTH])!;
    expect(cached.map((r) => r.category)).toEqual(["Others", "Dine Out"]);
  });
});

describe("Moving a transfer back to spend or income", () => {
  const transfer = (account_uid: string, entry_reference: string, dir: string): TransactionRow => ({
    ...row(account_uid, entry_reference),
    flow_type: "transfer",
    credit_debit_indicator: dir,
  });

  function setupTransfers() {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    queryClient.setQueryData(
      ["transfers", MONTH],
      [transfer("a1", "r1", "DBIT"), transfer("a2", "r2", "CRDT")],
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useFlowMutation(queryClient, MONTH), { wrapper });
    const cached = () => queryClient.getQueryData<TransactionRow[]>(["transfers", MONTH])!;
    return { result, cached };
  }

  it("writes spend for a debit on that one account and drops it from the transfers list", async () => {
    const { result, cached } = setupTransfers();
    await act(() => result.current.mutateAsync({ tx: transfer("a1", "r1", "DBIT") }));
    expect(calls[0]?.update).toEqual({ flow_type: "spend" });
    expect(calls[0]?.eq).toEqual({ account_uid: "a1", entry_reference: "r1" });
    expect(cached().map((r) => r.entry_reference)).toEqual(["r2"]);
  });

  it("writes income for a credit", async () => {
    const { result } = setupTransfers();
    await act(() => result.current.mutateAsync({ tx: transfer("a2", "r2", "CRDT") }));
    expect(calls[0]?.update).toEqual({ flow_type: "income" });
  });
});

// Regression: counting a transfer again left its "Transfer" label on a row that now counted as
// spend, and picking Transfer again did nothing (same category).
describe("restorePatch", () => {
  it("clears the Transfer label so the next sync categorizes the row", () => {
    expect(restorePatch({ credit_debit_indicator: "DBIT", category: "Transfer" })).toEqual({
      flow_type: "spend",
      category: null,
      category_source: null,
    });
  });

  it("keeps any other category", () => {
    expect(restorePatch({ credit_debit_indicator: "CRDT", category: "Income" })).toEqual({
      flow_type: "income",
    });
  });
});
