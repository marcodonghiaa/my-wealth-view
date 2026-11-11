import { describe, expect, it } from "vitest";
import { PAGE, readPages } from "./read-pages";

// A server holding `total` rows that answers at most `cap` per request.
const server = (total: number, cap: number) => {
  const asked: Array<[number, number]> = [];
  const page = async (from: number, to: number) => {
    asked.push([from, to]);
    const end = Math.min(to + 1, from + cap, total);
    return {
      data: Array.from({ length: Math.max(0, end - from) }, (_, i) => from + i),
      error: null,
    };
  };
  return { page, asked };
};

describe("readPages", () => {
  it("asks for PAGE rows at a time and stops at the empty page", async () => {
    const s = server(1500, PAGE);
    expect(await readPages(s.page)).toHaveLength(1500);
    expect(s.asked).toEqual([
      [0, 999],
      [1000, 1999],
      [1500, 2499],
    ]);
  });
  it("keeps going past short pages when the server caps them lower", async () => {
    const rows = await readPages(server(7, 3).page);
    expect(rows).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it("throws the error of a failed page", async () => {
    const boom = { message: "boom" };
    await expect(readPages(async () => ({ data: null, error: boom }))).rejects.toBe(boom);
  });
});
