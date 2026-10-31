import { describe, expect, it, vi } from "vitest";
import { fetchPerformance, fetchTrades } from "./use-performance";

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

describe("fetchTrades", () => {
  const paged = (pages: Array<unknown>) => {
    const range = vi.fn(async () => pages.shift());
    return {
      client: {
        from: () => ({ select: () => ({ order: () => ({ range }) }) }),
      } as unknown as Parameters<typeof fetchTrades>[0],
      range,
    };
  };

  it("pages past the 1000-row limit", async () => {
    const first = Array.from({ length: 1000 }, (_, i) => ({ id: String(i) }));
    const { client, range } = paged([
      { data: first, error: null, count: 1001 },
      { data: [{ id: "last" }], error: null, count: 1001 },
    ]);
    const out = await fetchTrades(client);
    expect("trades" in out && out.trades.length).toBe(1001);
    expect(range).toHaveBeenCalledTimes(2);
  });

  it("treats a database without the table as not available yet", async () => {
    const { client } = paged([
      { data: null, error: { code: "PGRST205", message: "x" }, count: null },
    ]);
    expect(await fetchTrades(client)).toEqual({ unavailable: true });
  });

  it("throws on any other error", async () => {
    const { client } = paged([
      { data: null, error: { code: "500", message: "boom" }, count: null },
    ]);
    await expect(fetchTrades(client)).rejects.toThrow("boom");
  });
});
