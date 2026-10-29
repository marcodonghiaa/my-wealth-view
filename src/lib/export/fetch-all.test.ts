import { describe, expect, it, vi } from "vitest";
import { ExportError, fetchAllRows, PAGE_SIZE, type PageFetcher } from "./fetch-all";

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ i }));

// A server holding `total` rows that never returns more than `cap` per request.
function server(total: number, cap = PAGE_SIZE): PageFetcher & ReturnType<typeof vi.fn> {
  return vi.fn(async (from: number, to: number) => ({
    data: rows(total).slice(from, Math.min(to + 1, from + cap)),
    error: null,
    count: total,
  }));
}

// protects=no table is ever exported short; fails_when=paging stops early or ignores the row count
describe("fetchAllRows", () => {
  it.each([0, 1, 999, 1000, 1001, 2500])("returns all %i rows", async (n) => {
    const fetchPage = server(n);
    const got = await fetchAllRows("t", fetchPage);
    expect(got).toHaveLength(n);
    expect(got.map((r) => r["i"])).toEqual(rows(n).map((r) => r.i));
  });

  it("asks for consecutive 1000-row windows", async () => {
    const fetchPage = server(2500);
    await fetchAllRows("t", fetchPage);
    expect(fetchPage.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("keeps going when the server caps pages below 1000", async () => {
    const got = await fetchAllRows("t", server(450, 100));
    expect(got).toHaveLength(450);
  });

  it("reports progress after each page", async () => {
    const onProgress = vi.fn();
    await fetchAllRows("t", server(1500), onProgress);
    expect(onProgress.mock.calls).toEqual([
      ["t", 1000, 1500],
      ["t", 1500, 1500],
    ]);
  });

  it("fails naming the table when a page errors mid-way", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: rows(1000), error: null, count: 1500 })
      .mockResolvedValueOnce({ data: null, error: { message: "boom" }, count: null });
    const err = await fetchAllRows("transactions", fetchPage).catch((e) => e);
    expect(err).toBeInstanceOf(ExportError);
    expect(err).toMatchObject({ table: "transactions", message: "boom" });
  });

  it("fails instead of returning fewer rows than the table counted", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: rows(1000), error: null, count: 1500 })
      .mockResolvedValueOnce({ data: [], error: null, count: 1500 });
    await expect(fetchAllRows("t", fetchPage)).rejects.toThrow(/fewer rows/);
  });

  it("fails when the server gives no count", async () => {
    const fetchPage = vi.fn().mockResolvedValue({ data: rows(3), error: null, count: null });
    await expect(fetchAllRows("t", fetchPage)).rejects.toThrow(/row count/);
  });
});
