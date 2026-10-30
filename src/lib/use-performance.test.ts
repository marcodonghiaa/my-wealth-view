import { describe, expect, it, vi } from "vitest";
import { fetchPerformance } from "./use-performance";

const client = (result: unknown) =>
  ({ rpc: vi.fn(async () => result) }) as unknown as Parameters<typeof fetchPerformance>[0];

describe("fetchPerformance", () => {
  it("asks for the range start and passes the rows through", async () => {
    const c = client({ data: [{ key: "A" }], error: null });
    expect(await fetchPerformance(c, "2026-09-30", false)).toEqual({ rows: [{ key: "A" }] });
    expect(c.rpc).toHaveBeenCalledWith("holding_performance", {
      p_from: "2026-09-30",
      p_last_move: false,
    });
  });

  it("treats a database without the function as not available yet, not as an error", async () => {
    const c = client({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });
    expect(await fetchPerformance(c, "2026-09-30", false)).toEqual({ unavailable: true });
  });

  it("throws any other error", async () => {
    const error = { code: "42501", message: "permission denied" };
    await expect(fetchPerformance(client({ data: null, error }), "2026-09-30", false)).rejects.toBe(
      error,
    );
  });

  it("no rows is an empty list", async () => {
    expect(await fetchPerformance(client({ data: null, error: null }), "2026-09-30", true)).toEqual(
      { rows: [] },
    );
  });
});
