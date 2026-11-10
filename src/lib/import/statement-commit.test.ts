import { describe, expect, it, vi } from "vitest";
import { importStatement, newRows, type StatementClient } from "./statement-commit";
import type { StatementRow } from "./statement";

const coffee: StatementRow = {
  date: "2026-04-25",
  description: "Coffee",
  amount: 2.5,
  direction: "DBIT",
};
const salary: StatementRow = {
  date: "2026-04-26",
  description: "Salary",
  amount: 1500,
  direction: "CRDT",
};

// Fake client: serves `existing` in pages of 1000 like PostgREST, and records each request.
function client(existing: Array<Record<string, unknown>>, failOn?: string) {
  const rpc = vi.fn(async (_fn: string, args: Record<string, unknown>) =>
    args["p_description"] === failOn
      ? { data: null, error: { message: "boom" } }
      : { data: [], error: null },
  );
  const requests: Array<{ from: string; to: string; deleted: unknown; page: [number, number] }> =
    [];
  const c: StatementClient = {
    rpc,
    from: () => ({
      select: () => ({
        is: (_col: string, deleted: null) => ({
          gte: (_c: string, from: string) => ({
            lte: (_c2: string, to: string) => ({
              order: () => ({
                range: async (a: number, b: number) => {
                  requests.push({ from, to, deleted, page: [a, b] });
                  return { data: existing.slice(a, b + 1), error: null };
                },
              }),
            }),
          }),
        }),
      }),
    }),
  };
  return { c, rpc, requests };
}

const inApp = (row: StatementRow, description = row.description) => ({
  booking_date: row.date,
  amount: row.amount,
  credit_debit_indicator: row.direction,
  creditor_name: description,
});

describe("newRows", () => {
  it("polish-3 #13 asks the app once per date range when given a cache", async () => {
    const { c, requests } = client([inApp(coffee)]);
    const cache = new Map();
    expect(await newRows(c, [coffee, salary], cache)).toEqual([salary]);
    expect(await newRows(c, [salary, coffee], cache)).toEqual([salary]);
    expect(requests).toHaveLength(1);
  });

  it("only treats a row as already there when the currency matches too", async () => {
    const usd = { ...inApp(coffee), currency: "USD" };
    expect(await newRows(client([usd]).c, [coffee])).toEqual([coffee]);
    expect(await newRows(client([usd]).c, [{ ...coffee, currency: "USD" }])).toEqual([]);
  });

  it("leaves out rows already in the app, over the file's date range, deleted rows excluded", async () => {
    const { c, requests } = client([inApp(coffee, "COFFEE")]);
    expect(await newRows(c, [coffee, salary])).toEqual([salary]);
    expect(requests[0]).toMatchObject({ from: "2026-04-25", to: "2026-04-26", deleted: null });
  });

  // Regression: two identical coffees on the same day in one statement became one.
  it("keeps repeats inside the file, and skips them all once they are in the app", async () => {
    expect(await newRows(client([]).c, [coffee, coffee])).toEqual([coffee, coffee]);
    expect(await newRows(client([inApp(coffee)]).c, [coffee, coffee])).toEqual([coffee]);
    expect(await newRows(client([inApp(coffee), inApp(coffee)]).c, [coffee, coffee])).toEqual([]);
  });

  // Regression: only the first 1000 rows in the app were compared, so a long history re-imported.
  it("reads every page of rows already in the app", async () => {
    const filler = Array.from({ length: 1000 }, () => inApp(salary, "Other"));
    const { c, requests } = client([...filler, inApp(coffee)]);
    expect(await newRows(c, [coffee])).toEqual([]);
    expect(requests.map((r) => r.page)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
});

describe("importStatement", () => {
  it("adds every row with its source and reports progress", async () => {
    const { c, rpc } = client([]);
    const progress = vi.fn();
    const done = await importStatement(c, [coffee, salary], "Fineco", progress);
    expect(done).toBe(2);
    expect(rpc).toHaveBeenCalledWith("add_manual_transaction", {
      p_booking_date: "2026-04-25",
      p_description: "Coffee",
      p_amount: 2.5,
      p_direction: "DBIT",
      p_currency: "EUR",
      p_category: null,
      p_source: "Fineco",
    });
    expect(progress).toHaveBeenLastCalledWith(2);
  });

  it("sends the row's currency and a Transfer category", async () => {
    const { c, rpc } = client([]);
    await importStatement(
      c,
      [{ ...coffee, currency: "USD", category: "Transfer" }],
      null,
      () => {},
    );
    expect(rpc).toHaveBeenCalledWith(
      "add_manual_transaction",
      expect.objectContaining({ p_currency: "USD", p_category: "Transfer" }),
    );
  });

  it("stops at the first error and says how many were added", async () => {
    const { c } = client([], "Salary");
    await expect(importStatement(c, [coffee, salary], null, vi.fn(), 1)).rejects.toThrow(
      /1 of 2 added.*boom/,
    );
  });
});

describe("RPC types", () => {
  it("polish-3 #16 the import client only takes add_manual_transaction's real arguments", () => {
    const typed = (c: StatementClient) =>
      c.rpc("add_manual_transaction", {
        p_booking_date: "2026-01-01",
        p_description: "x",
        // @ts-expect-error p_amount is a number in the database function
        p_amount: "1",
        p_direction: "DBIT",
      });
    expect(typeof typed).toBe("function");
  });
});
