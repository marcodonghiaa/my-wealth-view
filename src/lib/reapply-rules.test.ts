import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
import { invalidateAfterReapply, reapply } from "./reapply-rules";

beforeEach(() => invoke.mockReset());

describe("invalidateAfterReapply", () => {
  it("reads everything again except the reapply preview", async () => {
    const qc = new QueryClient();
    for (const key of [["transactions"], ["category-rules"], ["reapply-preview", "r1"]])
      qc.setQueryData(key, 1);
    await invalidateAfterReapply(qc);
    const stale = (key: string[]) => qc.getQueryState(key)?.isInvalidated;
    expect([
      stale(["transactions"]),
      stale(["category-rules"]),
      stale(["reapply-preview", "r1"]),
    ]).toEqual([true, true, false]);
  });
});

// Polish 3 #10: the request body and the fallback messages, tested directly.
describe("reapply", () => {
  const retired = {
    match_field: "creditor_name",
    match_text: "bar",
    match_mode: "contains",
    set_category: "Dine Out",
  };
  const ok = { data: { changes: 1, sample: [] }, error: null };

  it("sends only { apply } without a deleted rule, and the rule with one", async () => {
    invoke.mockResolvedValue(ok);
    expect(await reapply(false)).toEqual(ok.data);
    await reapply(true, retired);
    expect(invoke.mock.calls).toStrictEqual([
      ["reapply-rules", { body: { apply: false } }],
      ["reapply-rules", { body: { apply: true, retired } }],
    ]);
  });

  it("falls back to a plain message for a failed check or update", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("down") });
    await expect(reapply(false)).rejects.toThrow("Couldn't check your transactions.");
    await expect(reapply(true, retired)).rejects.toThrow("Couldn't update your transactions.");
  });

  it("shows the function's own reason when it gives one", async () => {
    const context = new Response(JSON.stringify({ error: "Request too large" }), { status: 413 });
    invoke.mockResolvedValue({ data: null, error: Object.assign(new Error("413"), { context }) });
    await expect(reapply(true, retired)).rejects.toThrow("Request too large");
  });
});
