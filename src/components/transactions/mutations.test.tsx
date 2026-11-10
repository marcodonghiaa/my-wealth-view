import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SplitwiseShare, TransactionRow } from "@/lib/transactions";

type Call = {
  table?: string;
  insert?: unknown;
  select?: boolean;
  update: unknown;
  eq: Record<string, unknown>;
  is: Record<string, unknown>;
  in: Record<string, unknown[]>;
};
const calls: Call[] = [];
const rpc = vi.fn();
const getUser = vi.fn(async () => ({ data: { user: { id: "u1" } as { id: string } | null } }));
let insertError: Error | null = null;
let existingRule: Array<{ id: string }> = [];

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { getUser: () => getUser() },
    from: (table: string) => {
      const call: Call = { table, update: null, eq: {}, is: {}, in: {} };
      const q = {
        select() {
          call.select = true;
          return q;
        },
        not() {
          return q;
        },
        limit() {
          return q;
        },
        insert(row: unknown) {
          call.insert = row;
          return q;
        },
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
        then(resolve: (v: { data?: unknown; error: Error | null }) => void) {
          calls.push(call);
          if (call.select) resolve({ data: existingRule, error: null });
          else resolve({ error: call.insert ? insertError : null });
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
  useResolvePairMutation,
  useReviewGroupMutation,
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
  insertError = null;
  existingRule = [];
});

describe("success toast action", () => {
  // "Make a rule" after a category change: the action gets the row and the new value.
  it("adds the action the caller builds from the saved row", async () => {
    toastSuccess.mockReset();
    const { queryClient, wrapper } = setup();
    const onClick = vi.fn();
    const successAction = vi.fn(() => ({ label: "Make a rule", onClick }));
    const { result } = renderHook(
      () =>
        useTransactionFieldMutation(queryClient, MONTH, "category", {
          errorMessage: "fail",
          successMessage: (v) => `Saved — ${v}`,
          successAction,
        }),
      { wrapper },
    );
    const tx = { account_uid: "a1", entry_reference: "r1", creditor_name: "BAR ROMA" };
    await act(() => result.current.mutateAsync({ tx, value: "Dine Out" }));
    expect(successAction).toHaveBeenCalledWith({ tx, value: "Dine Out" });
    expect(toastSuccess).toHaveBeenCalledWith("Saved — Dine Out", {
      action: { label: "Make a rule", onClick },
    });
  });
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
    queryClient.setQueryData(["splits"], [{ ...tx, owed_settled: false }]);
    await act(() => result.current.mutateAsync({ tx, settled: true }));
    expect(
      queryClient.getQueryData<Array<{ owed_settled: boolean }>>(["splits"])?.[0],
    ).toMatchObject({ owed_settled: true });
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
    expect(calls[0]?.update).toEqual({
      category: "Transfer",
      flow_type: "transfer",
      flow_source: "user",
    });
    expect(cached().map((r) => r.account_uid)).toEqual(["a2"]);
  });

  it("picking another category leaves flow_type alone but refetches To review", async () => {
    const { queryClient, wrapper } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
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
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["transfer-review"] }));
  });

  it("bulk: another category refetches To review", async () => {
    const { queryClient, wrapper } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useBulkCategoryMutation(queryClient, MONTH, vi.fn()), {
      wrapper,
    });
    act(() =>
      result.current.mutate({
        txs: [{ account_uid: "a2", entry_reference: "r1" }],
        category: "Health",
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["transfer-review"] });
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
    expect(calls[0]?.update).toEqual({
      category: "Transfer",
      flow_type: "transfer",
      flow_source: "user",
    });
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
    expect(calls[0]?.update).toEqual({
      category: "Transfer",
      flow_type: "transfer",
      flow_source: "user",
    });
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
    expect(calls[0]?.update).toEqual({ flow_type: "spend", flow_source: "user" });
    expect(calls[0]?.eq).toEqual({ account_uid: "a1", entry_reference: "r1" });
    expect(cached().map((r) => r.entry_reference)).toEqual(["r2"]);
  });

  it("writes income for a credit", async () => {
    const { result } = setupTransfers();
    await act(() => result.current.mutateAsync({ tx: transfer("a2", "r2", "CRDT") }));
    expect(calls[0]?.update).toEqual({ flow_type: "income", flow_source: "user" });
  });
});

// Regression: counting a transfer again left its "Transfer" label on a row that now counted as
// spend, and picking Transfer again did nothing (same category).
describe("restorePatch", () => {
  it("clears the Transfer label so the next sync categorizes the row", () => {
    expect(restorePatch({ credit_debit_indicator: "DBIT", category: "Transfer" })).toEqual({
      flow_type: "spend",
      flow_source: "user",
      category: null,
      category_source: null,
    });
  });

  it("keeps any other category", () => {
    expect(restorePatch({ credit_debit_indicator: "CRDT", category: "Income" })).toEqual({
      flow_type: "income",
      flow_source: "user",
    });
  });
});

describe("auto-paired transfers", () => {
  function setupPair() {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useResolvePairMutation(queryClient), { wrapper });
    return { result, invalidate };
  }

  // protects=Keep / Not a transfer reach the database and every list refreshes
  it("calls resolve_transfer_pair and refetches the flows and the pairs", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { result, invalidate } = setupPair();
    await act(() => result.current.mutateAsync({ pairId: "p1", keep: false }));
    expect(rpc).toHaveBeenCalledWith("resolve_transfer_pair", { p_pair: "p1", p_keep: false });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["transfers"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["transfer-pairs"] });
  });

  // protects=Keep on a pair the sync changed meanwhile: an error toast and a fresh list, no crash
  it("surfaces an rpc error and still refetches", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("pair is stale") });
    const { result, invalidate } = setupPair();
    await expect(
      act(() => result.current.mutateAsync({ pairId: "p1", keep: true })),
    ).rejects.toThrow("pair is stale");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["transfer-pairs"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["transfers"] });
  });
});

describe("settling a To review group", () => {
  const rr = (account_uid: string, ref: string, dir: string) => ({
    account_uid,
    entry_reference: ref,
    booking_date: "2026-10-02",
    category: "Transfer",
    creditor_name: "Revolut",
    merchant_key: "revolut",
    currency: "EUR",
    amount: 10,
    credit_debit_indicator: dir,
    flow_type: dir === "DBIT" ? "spend" : "income",
    flow_source: "default",
  });
  const group = (rows: ReturnType<typeof rr>[], name: string | null = "Revolut") => ({
    key: "revolut",
    name,
    rows,
    totals: [],
    direction: "mixed" as const,
  });
  function setupGroup() {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return renderHook(() => useReviewGroupMutation(queryClient), { wrapper }).result;
  }
  function setupGroupWithCache(rows: Array<ReturnType<typeof rr>>) {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    queryClient.setQueryData(["transfer-review"], rows);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const result = renderHook(() => useReviewGroupMutation(queryClient), { wrapper }).result;
    return { result, queryClient };
  }

  // protects=answering a group feels instant: it leaves the list before the saves finish
  it("removes the answered group from the review list right away", async () => {
    const a = rr("a1", "r1", "DBIT");
    const other = rr("a1", "r9", "DBIT");
    const { result, queryClient } = setupGroupWithCache([a, other]);
    await act(() => result.current.mutateAsync({ group: group([a]), choice: "transfer" }));
    expect(queryClient.getQueryData(["transfer-review"])).toEqual([other]);
  });

  it("puts the group back when the save fails", async () => {
    insertError = new Error("denied");
    const a = rr("a1", "r1", "DBIT");
    const { result, queryClient } = setupGroupWithCache([a]);
    await expect(
      act(() => result.current.mutateAsync({ group: group([a]), choice: "count" })),
    ).rejects.toThrow("denied");
    expect(queryClient.getQueryData(["transfer-review"])).toEqual([a]);
  });

  it("transfer: marks every row as the user's transfer and adds a rule for the name", async () => {
    const result = setupGroup();
    await act(() =>
      result.current.mutateAsync({ group: group([rr("a1", "r1", "DBIT")]), choice: "transfer" }),
    );
    expect(calls[0]?.update).toEqual({ flow_type: "transfer", flow_source: "user" });
    expect(calls[0]?.eq).toEqual({ account_uid: "a1" });
    expect(calls[1]).toMatchObject({
      table: "category_rules",
      select: true,
      eq: { match_field: "creditor_name", match_text: "Revolut" },
    });
    expect(calls[2]?.insert).toEqual({
      user_id: "u1",
      match_field: "creditor_name",
      match_text: "Revolut",
      set_category: null,
      set_flow_type: "transfer",
    });
  });

  // protects=a mixed group counts each row by its own direction, never a credit as spend
  it("count: debits become spend and credits income", async () => {
    const result = setupGroup();
    await act(() =>
      result.current.mutateAsync({
        group: group([rr("a1", "r1", "DBIT"), rr("a1", "r2", "CRDT")]),
        choice: "count",
      }),
    );
    expect(calls[0]).toMatchObject({
      update: { flow_type: "spend", flow_source: "user" },
      in: { entry_reference: ["r1"] },
    });
    expect(calls[1]).toMatchObject({
      update: { flow_type: "income", flow_source: "user" },
      in: { entry_reference: ["r2"] },
    });
    expect(calls[3]?.insert).toMatchObject({ set_flow_type: "spend" });
  });

  // protects=answering the same name twice changes its rule instead of piling up rules
  it("updates the name's existing flow rule instead of adding one", async () => {
    existingRule = [{ id: "rule1" }];
    const result = setupGroup();
    await act(() =>
      result.current.mutateAsync({ group: group([rr("a1", "r1", "DBIT")]), choice: "transfer" }),
    );
    expect(calls[2]).toMatchObject({
      table: "category_rules",
      update: { set_flow_type: "transfer" },
      eq: { id: "rule1" },
    });
    expect(calls.some((c) => c.insert)).toBe(false);
  });

  it("adds no rule when the rows have no name to match", async () => {
    const result = setupGroup();
    await act(() =>
      result.current.mutateAsync({ group: group([rr("a1", "r1", "DBIT")], null), choice: "count" }),
    );
    expect(calls.map((c) => c.table)).toEqual(["transactions"]);
  });

  it("fails when signed out", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    const result = setupGroup();
    await expect(
      act(() =>
        result.current.mutateAsync({ group: group([rr("a1", "r1", "DBIT")]), choice: "count" }),
      ),
    ).rejects.toThrow("signed out");
  });

  it("surfaces a rule insert error", async () => {
    insertError = new Error("denied");
    const result = setupGroup();
    await expect(
      act(() =>
        result.current.mutateAsync({ group: group([rr("a1", "r1", "DBIT")]), choice: "count" }),
      ),
    ).rejects.toThrow("denied");
  });
});
