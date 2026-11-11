import { describe, expect, it, vi } from "vitest";
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

import { fetchIncomeWindow } from "./income-kind-query";

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
