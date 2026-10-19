import { describe, expect, it, vi } from "vitest";
import { runSplitwiseImport, undoSplitwiseImport, type RpcClient } from "./splitwise-commit";
import type { WritePlan } from "./splitwise-plan";

const plan = (over: Partial<WritePlan> = {}): WritePlan => ({
  group: "berkeley",
  from: "2026-08-01",
  to: "2026-08-31",
  shares: [
    {
      fingerprint: "f",
      booking_date: "2026-08-16",
      description: "Dinner",
      category: "Dining",
      amount: 30,
      currency: "USD",
      linked_account_uid: null,
      linked_entry_reference: null,
    },
  ],
  links: [],
  problems: [],
  ...over,
});

const client = (result: { data: unknown; error: { message: string } | null }) => {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as RpcClient, rpc };
};

describe("runSplitwiseImport", () => {
  // protects=what is sent to the database in one call; fails_when=a blocked plan is sent, a
  // failure is swallowed or the batch id is lost; no_claim=the database rules (tested apart)
  it("sends the whole plan in one call and returns the batch and counts", async () => {
    const { client: c, rpc } = client({ data: { shares: 1, links: 0 }, error: null });
    const result = await runSplitwiseImport(c, plan());

    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe("import_splitwise");
    expect(args).toMatchObject({
      p_group: "berkeley",
      p_from: "2026-08-01",
      p_to: "2026-08-31",
      p_shares: plan().shares,
      p_links: [],
    });
    expect(args["p_batch"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(result).toEqual({ batchId: args["p_batch"], shares: 1, links: 0 });
  });

  it("refuses a plan with problems without calling the database", async () => {
    const { client: c, rpc } = client({ data: null, error: null });
    await expect(
      runSplitwiseImport(c, plan({ problems: ["No exchange rate for CHF."] })),
    ).rejects.toThrow(/No exchange rate for CHF/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses an empty plan", async () => {
    const { client: c, rpc } = client({ data: null, error: null });
    await expect(runSplitwiseImport(c, plan({ shares: [] }))).rejects.toThrow(/nothing to import/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes on the database's message when the call fails", async () => {
    const { client: c } = client({ data: null, error: { message: "A bank transaction changed" } });
    await expect(runSplitwiseImport(c, plan())).rejects.toThrow(/bank transaction changed/);
  });

  it("does not trust an answer that is not the expected counts", async () => {
    const { client: c } = client({ data: { shares: "many" }, error: null });
    await expect(runSplitwiseImport(c, plan())).rejects.toThrow(/unexpected/i);
  });
});

describe("undoSplitwiseImport", () => {
  it("asks the database to undo one batch and returns the counts", async () => {
    const { client: c, rpc } = client({ data: { shares: 4, links: 2 }, error: null });
    expect(await undoSplitwiseImport(c, "batch-1")).toEqual({ shares: 4, links: 2 });
    expect(rpc).toHaveBeenCalledWith("undo_splitwise_import", { p_batch: "batch-1" });
  });

  it("reports a failure", async () => {
    const { client: c } = client({ data: null, error: { message: "Not signed in" } });
    await expect(undoSplitwiseImport(c, "batch-1")).rejects.toThrow(/not signed in/i);
  });
});
