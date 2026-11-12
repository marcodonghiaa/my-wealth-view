import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

const NOW = new Date(2026, 9, 19, 12);
const client = vi.hoisted(() => ({ current: null as unknown as SupabaseClient }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createFakeClient } = await import("@/lib/demo/fake-client");
  client.current = createFakeClient(new Date(2026, 9, 19, 12)) as unknown as SupabaseClient;
  return {
    get supabase() {
      return client.current;
    },
  };
});

import {
  fetchIncomeWindow,
  markIncomeKind,
  undoMark,
  useMarkIncomeKind,
} from "./income-kind-query";
import { rulesQuery, type RuleRow } from "./rules-query";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("fetchIncomeWindow", () => {
  // Polish #3: a credit the sync hasn't classified yet (flow_type NULL) is income on the Income
  // list (the view reads NULL as the direction), so it must be in the window too.
  it("includes credits whose flow is not decided yet", async () => {
    const { data: salary } = await client.current
      .from("transactions")
      .select("account_uid,entry_reference")
      .eq("credit_debit_indicator", "CRDT")
      .eq("flow_type", "income")
      .gte("booking_date", "2026-10-01")
      .limit(1);
    const row = salary![0]!;
    await client.current
      .from("transactions")
      .update({ flow_type: null })
      .eq("account_uid", row.account_uid)
      .eq("entry_reference", row.entry_reference);

    const rows = await fetchIncomeWindow(NOW);
    expect(rows.map((r) => r.entry_reference)).toContain(row.entry_reference);
    expect(
      rows.every((r) => r.booking_date! >= "2026-05-01" && r.booking_date! < "2026-11-01"),
    ).toBe(true);
  });

  // Polish #9: pages are read by offset, so the order must be total: the same reference on the
  // same day in two accounts could otherwise swap between pages (one read twice, one never).
  it("pages in a total order (date, account, reference)", async () => {
    const real = client.current.from.bind(client.current);
    const orders: Array<string> = [];
    const spy = vi.spyOn(client.current, "from").mockImplementation(((table: string) => {
      const q = real(table as never) as unknown as {
        order: (col: string, opts?: unknown) => unknown;
      };
      const order = q.order.bind(q);
      q.order = (col: string, opts?: unknown) => {
        orders.push(col);
        return order(col, opts);
      };
      return q;
    }) as never);
    await fetchIncomeWindow(NOW);
    spy.mockRestore();
    expect(orders.slice(0, 3)).toEqual(["booking_date", "account_uid", "entry_reference"]);
  });

  // Polish 2 #2: a self-hoster can set PostgREST's max_rows below our page size; a short page
  // is then not the end, and stopping there would drop regular income without a word.
  it("reads everything when the server caps pages below 1000 rows", async () => {
    const all = await fetchIncomeWindow(NOW);
    expect(all.length).toBeGreaterThan(3);
    const real = client.current.from.bind(client.current);
    const spy = vi.spyOn(client.current, "from").mockImplementation(((table: string) => {
      const q = real(table as never) as unknown as { range: (f: number, t: number) => unknown };
      const range = q.range.bind(q);
      q.range = (from: number, to: number) => range(from, Math.min(to, from + 2)); // max_rows 3
      return q;
    }) as never);
    const capped = await fetchIncomeWindow(NOW);
    spy.mockRestore();
    expect(capped).toEqual(all);
  });

  it("leaves out credits that count as a transfer", async () => {
    const rows = await fetchIncomeWindow(NOW);
    const { data: transfers } = await client.current
      .from("transactions")
      .select("entry_reference")
      .eq("credit_debit_indicator", "CRDT")
      .eq("flow_type", "transfer");
    const refs = new Set(rows.map((r) => r.entry_reference));
    expect((transfers ?? []).length).toBeGreaterThan(0);
    for (const t of transfers ?? []) expect(refs.has(t.entry_reference)).toBe(false);
  });
});

describe("useMarkIncomeKind", () => {
  // Polish #5: until the rules refetch lands, a second "Mark" on another row of the same name
  // would not see the new rule and add a duplicate. The cache gets the rule at once.
  it("puts a new rule in the rules cache straight away", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(rulesQuery.queryKey, []);
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useMarkIncomeKind(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        tx: { creditor_name: "Side Gig Ltd", remittance_info: null },
        kind: "regular",
        rules: [],
      }),
    );
    const cached = queryClient.getQueryData<Array<Record<string, unknown>>>(rulesQuery.queryKey);
    expect(cached).toEqual([
      expect.objectContaining({
        match_text: "Side Gig Ltd",
        match_mode: "exact",
        set_income_kind: "regular",
      }),
    ]);
  });

  it("changes the cached rule it updated", async () => {
    const queryClient = new QueryClient();
    const { data } = await client.current
      .from("category_rules")
      .insert({
        user_id: "x",
        match_field: "creditor_name",
        match_text: "acme",
        match_mode: "word",
        set_category: null,
        set_income_kind: "regular",
      })
      .select("*")
      .single();
    queryClient.setQueryData(rulesQuery.queryKey, [data]);
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useMarkIncomeKind(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        tx: { creditor_name: "ACME Payroll", remittance_info: null },
        kind: "one_off",
        rules: [data],
      }),
    );
    const cached = queryClient.getQueryData<Array<Record<string, unknown>>>(rulesQuery.queryKey);
    expect(cached?.map((r) => r["set_income_kind"])).toEqual(["one_off"]);
  });
});

// Polish 3 #1: Undo left the deleted rule in the cache, so a Mark before the refetch updated a
// rule that no longer exists (0 rows, no error) and said it had saved.
describe("Undo, then Mark again", () => {
  it("drops the undone rule from the cache, so the next Mark saves a new one", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(rulesQuery.queryKey, []);
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useMarkIncomeKind(), { wrapper });
    const tx = { creditor_name: "Undo Again Srl", remittance_info: null };
    vi.mocked(toast.success).mockClear();
    await act(() => result.current.mutateAsync({ tx, kind: "regular", rules: [] }));
    const undo = vi.mocked(toast.success).mock.calls[0]![1]!.action as unknown as {
      onClick: () => void;
    };
    await act(async () => {
      undo.onClick();
      await vi.waitFor(() =>
        expect(queryClient.getQueryData<Array<unknown>>(rulesQuery.queryKey)).toEqual([]),
      );
    });
    const rules = queryClient.getQueryData<Array<RuleRow>>(rulesQuery.queryKey)!;
    const done = await act(() => result.current.mutateAsync({ tx, kind: "one_off", rules }));
    expect(done.kind).toBe("inserted");
  });

  it("refuses to change a rule that was deleted meanwhile", async () => {
    const first = await markIncomeKind({
      tx: { creditor_name: "Gone Co", remittance_info: null },
      kind: "regular",
      rules: [],
    });
    if (first.kind !== "inserted") throw new Error(first.kind);
    await undoMark(first);
    await expect(
      markIncomeKind({
        tx: { creditor_name: "Gone Co", remittance_info: null },
        kind: "one_off",
        rules: [first.rule],
      }),
    ).rejects.toThrow("deleted");
  });
});

describe("markIncomeKind and undoMark", () => {
  const tx = (name: string | null) => ({ creditor_name: name, remittance_info: null });
  const readRule = async (id: string) =>
    (await client.current.from("category_rules").select("*").eq("id", id).single()).data as Record<
      string,
      unknown
    > | null;

  it("adds an exact rule, and Undo removes it", async () => {
    const done = await markIncomeKind({ tx: tx("Undo Me Srl"), kind: "one_off", rules: [] });
    if (done.kind !== "inserted") throw new Error(done.kind);
    expect(await readRule(done.id)).toMatchObject({
      match_text: "Undo Me Srl",
      set_income_kind: "one_off",
    });
    await undoMark(done);
    expect(await readRule(done.id)).toBeNull();
  });

  it("flips the deciding rule, and Undo restores it", async () => {
    const first = await markIncomeKind({ tx: tx("Flip Co"), kind: "regular", rules: [] });
    if (first.kind !== "inserted") throw new Error(first.kind);
    const flipped = await markIncomeKind({
      tx: tx("Flip Co"),
      kind: "one_off",
      rules: [first.rule],
    });
    expect(flipped).toMatchObject({ kind: "updated", previous: "regular" });
    await undoMark(flipped);
    expect((await readRule(first.id))?.["set_income_kind"]).toBe("regular");
  });

  // Polish #6 (checked, no change): with two kinds, an older Undo can only restore the kind the
  // user's later mark already chose.
  it("an older Undo after a newer mark leaves the newer choice", async () => {
    const first = await markIncomeKind({ tx: tx("Order Co"), kind: "regular", rules: [] });
    if (first.kind !== "inserted") throw new Error(first.kind);
    const a = await markIncomeKind({ tx: tx("Order Co"), kind: "one_off", rules: [first.rule] });
    await markIncomeKind({
      tx: tx("Order Co"),
      kind: "regular",
      rules: [{ ...first.rule, set_income_kind: "one_off" }],
    });
    await undoMark(a);
    expect((await readRule(first.id))?.["set_income_kind"]).toBe("regular");
  });

  it("does nothing when the rule already says so", async () => {
    const first = await markIncomeKind({ tx: tx("Same Co"), kind: "regular", rules: [] });
    if (first.kind !== "inserted") throw new Error(first.kind);
    const again = await markIncomeKind({ tx: tx("Same Co"), kind: "regular", rules: [first.rule] });
    expect(again).toEqual({ kind: "none" });
    await undoMark(again);
    expect((await readRule(first.id))?.["set_income_kind"]).toBe("regular");
  });

  it("refuses a payment without a name, or one too long for a rule (Polish #14)", async () => {
    await expect(markIncomeKind({ tx: tx("  "), kind: "regular", rules: [] })).rejects.toThrow(
      "no name",
    );
    await expect(
      markIncomeKind({ tx: tx("x".repeat(201)), kind: "regular", rules: [] }),
    ).rejects.toThrow("too long");
  });

  it("refuses when signed out", async () => {
    const spy = vi
      .spyOn(client.current.auth, "getUser")
      .mockResolvedValueOnce({ data: { user: null }, error: null } as never);
    await expect(markIncomeKind({ tx: tx("Someone"), kind: "regular", rules: [] })).rejects.toThrow(
      "signed out",
    );
    spy.mockRestore();
  });
});
