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

import { fetchIncomeWindow, useMarkIncomeKind } from "./income-kind-query";
import { rulesQuery } from "./rules-query";

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
