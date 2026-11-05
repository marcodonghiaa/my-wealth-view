// Writes a read statement: leaves out what is already in the app, then adds the rest one by one
// with the database function add_manual_transaction.
import { dedupeKey, type StatementRow } from "./statement";

type Result<T> = PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>;

/** The slice of the Supabase client the import uses; keeps the logic testable without a network. */
export interface StatementClient {
  rpc(fn: "add_manual_transaction", args: Record<string, unknown>): Result<unknown>;
  from(table: "v_transactions_eur"): {
    select(cols: string): {
      gte(
        col: string,
        value: string,
      ): {
        lte(col: string, value: string): Result<Array<Record<string, unknown>>>;
      };
    };
  };
}

/** Rows not in the app yet (same day, direction, amount and description), each once. */
export async function newRows(
  client: StatementClient,
  rows: Array<StatementRow>,
): Promise<Array<StatementRow>> {
  if (rows.length === 0) return [];
  const dates = rows.map((r) => r.date).sort();
  const { data, error } = await client
    .from("v_transactions_eur")
    .select("booking_date,amount,credit_debit_indicator,creditor_name")
    .gte("booking_date", dates[0]!)
    .lte("booking_date", dates.at(-1)!);
  if (error) throw new Error(error.message);
  const seen = new Set(
    (data ?? []).map((t) =>
      dedupeKey({
        date: String(t["booking_date"]),
        description: String(t["creditor_name"] ?? ""),
        amount: Math.abs(Number(t["amount"])),
        direction: t["credit_debit_indicator"] === "DBIT" ? "DBIT" : "CRDT",
      }),
    ),
  );
  return rows.filter((r) => {
    const key = dedupeKey(r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Adds the rows, a few at a time. Stops at the first error: what was added stays, and importing
 * the same file again skips it. Returns how many were added.
 */
export async function importStatement(
  client: StatementClient,
  rows: Array<StatementRow>,
  source: string | null,
  onProgress: (added: number) => void,
  parallel = 5,
): Promise<number> {
  let added = 0;
  for (let i = 0; i < rows.length; i += parallel) {
    const results = await Promise.all(
      rows.slice(i, i + parallel).map((r) =>
        client.rpc("add_manual_transaction", {
          p_booking_date: r.date,
          p_description: r.description,
          p_amount: r.amount,
          p_direction: r.direction,
          p_category: null,
          p_source: source,
        }),
      ),
    );
    const failed = results.find((r) => r.error);
    added += results.filter((r) => !r.error).length;
    onProgress(added);
    if (failed?.error) {
      const reason =
        failed.error.code === "PGRST202"
          ? "Importing needs a database update first: run supabase db push in the backend."
          : failed.error.message;
      throw new Error(`${added} of ${rows.length} added, then: ${reason}`);
    }
  }
  return added;
}
