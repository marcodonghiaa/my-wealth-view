import { describe, expect, it } from "vitest";
import { runImport, undoImport, type Writer } from "./commit";

interface Call {
  op: "upsert" | "delete";
  table: string;
  rows?: Array<object>;
  onConflict?: string;
  filters?: Record<string, string>;
}

function fakeWriter(failOnUpsert?: number) {
  const calls: Array<Call> = [];
  let upserts = 0;
  const writer: Writer = {
    from: (table) => ({
      upsert: async (rows, opts) => {
        upserts += 1;
        calls.push({ op: "upsert", table, rows, onConflict: opts.onConflict });
        return { error: upserts === failOnUpsert ? { message: "boom" } : null };
      },
      delete: () => {
        const filters: Record<string, string> = {};
        const chain = {
          eq: (column: string, value: string) => {
            filters[column] = value;
            return Object.keys(filters).length === 2
              ? Promise.resolve({ error: null }).then((r) => {
                  calls.push({ op: "delete", table, filters: { ...filters } });
                  return r;
                })
              : chain;
          },
        };
        return chain as never;
      },
    }),
  };
  return { writer, calls };
}

describe("runImport", () => {
  // protects=imports only ever write the signed-in user's rows, tagged for undo; fails_when=a row
  // lacks user_id or batch_id, or the wrong conflict key is used; no_claim=real RLS (database side)
  it("stamps every row with the user and one batch id, and upserts on the table key", async () => {
    const { writer, calls } = fakeWriter();
    const batchId = await runImport(writer, "spend", "u1", [
      { month: "2024-02-01", category: "Rent", spend_eur: 5 },
    ]);
    expect(calls).toEqual([
      {
        op: "upsert",
        table: "spend_history",
        onConflict: "user_id,month,category",
        rows: [
          { month: "2024-02-01", category: "Rent", spend_eur: 5, user_id: "u1", batch_id: batchId },
        ],
      },
    ]);
    expect(batchId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("uses the net worth table and key", async () => {
    const { writer, calls } = fakeWriter();
    await runImport(writer, "net_worth", "u1", [{ snapshot_date: "2024-02-29", total_eur: 1 }]);
    expect(calls[0]).toMatchObject({
      table: "net_worth_history",
      onConflict: "user_id,snapshot_date",
    });
  });

  it("writes everything in one request, so a failure leaves nothing half-written", async () => {
    const { writer, calls } = fakeWriter(1);
    const rows = Array.from({ length: 1200 }, (_, i) => ({
      month: "2024-02-01",
      category: `c${i}`,
      spend_eur: 1,
    }));
    await expect(runImport(writer, "spend", "u1", rows)).rejects.toThrow("boom");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.rows).toHaveLength(1200);
  });

  it("refuses an empty import", async () => {
    await expect(runImport(fakeWriter().writer, "spend", "u1", [])).rejects.toThrow(
      /nothing to import/i,
    );
  });
});

describe("undoImport", () => {
  it("deletes only that batch for that user", async () => {
    const { writer, calls } = fakeWriter();
    await undoImport(writer, "net_worth", "u1", "b1");
    expect(calls).toEqual([
      { op: "delete", table: "net_worth_history", filters: { user_id: "u1", batch_id: "b1" } },
    ]);
  });
});
