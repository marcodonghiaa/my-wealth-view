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

function client(existing: Array<Record<string, unknown>>, failOn?: string) {
  const rpc = vi.fn(async (_fn: string, args: Record<string, unknown>) =>
    args["p_description"] === failOn
      ? { data: null, error: { message: "boom" } }
      : { data: [], error: null },
  );
  const range = vi.fn();
  const c: StatementClient = {
    rpc,
    from: () => ({
      select: () => ({
        gte: (_c: string, from: string) => ({
          lte: async (_c2: string, to: string) => {
            range(from, to);
            return { data: existing, error: null };
          },
        }),
      }),
    }),
  };
  return { c, rpc, range };
}

describe("newRows", () => {
  it("leaves out rows already in the app and repeats inside the file", async () => {
    const { c, range } = client([
      {
        booking_date: "2026-04-25",
        amount: 2.5,
        credit_debit_indicator: "DBIT",
        creditor_name: "COFFEE",
      },
    ]);
    const rows = await newRows(c, [coffee, salary, salary]);
    expect(rows).toEqual([salary]);
    expect(range).toHaveBeenCalledWith("2026-04-25", "2026-04-26");
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
      p_category: null,
      p_source: "Fineco",
    });
    expect(progress).toHaveBeenLastCalledWith(2);
  });

  it("stops at the first error and says how many were added", async () => {
    const { c } = client([], "Salary");
    await expect(importStatement(c, [coffee, salary], null, vi.fn(), 1)).rejects.toThrow(
      /1 of 2 added.*boom/,
    );
  });
});
