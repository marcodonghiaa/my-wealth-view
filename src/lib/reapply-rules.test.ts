import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { invalidateAfterReapply } from "./reapply-rules";

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
