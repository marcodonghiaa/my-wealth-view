// Writes a read statement: leaves out what is already in the app, then adds the rest one by one
// with the database function add_manual_transaction.
import { dedupeKey, type StatementRow } from "./statement";

type Result<T> = PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>;

/** The slice of the Supabase client the import uses; keeps the logic testable without a network. */
export interface StatementClient {
  rpc(fn: "add_manual_transaction", args: Record<string, unknown>): Result<unknown>;
  from(table: "transactions"): {
    select(cols: string): {
      is(
        col: string,
        value: null,
      ): {
        gte(
          col: string,
          value: string,
        ): {
          lte(
            col: string,
            value: string,
          ): {
            order(col: string): {
              range(from: number, to: number): Result<Array<Record<string, unknown>>>;
            };
          };
        };
      };
    };
  };
}

const PAGE = 1000; // PostgREST returns at most 1000 rows per request

/** How many transactions the app has per dedupe key between two days. */
async function keysInApp(
  client: StatementClient,
  first: string,
  last: string,
): Promise<Map<string, number>> {
  const inApp = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("transactions")
      .select("booking_date,amount,currency,credit_debit_indicator,creditor_name")
      .is("deleted_at", null)
      .gte("booking_date", first)
      .lte("booking_date", last)
      .order("entry_reference")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const t of data ?? []) {
      const key = dedupeKey({
        date: String(t["booking_date"]),
        description: String(t["creditor_name"] ?? ""),
        amount: Math.abs(Number(t["amount"])),
        direction: t["credit_debit_indicator"] === "DBIT" ? "DBIT" : "CRDT",
        currency: String(t["currency"] ?? "EUR"),
      });
      inApp.set(key, (inApp.get(key) ?? 0) + 1);
    }
    if (!data || data.length < PAGE) break;
  }
  return inApp;
}

/**
 * Rows not in the app yet (same day, direction, amount and description). Repeats are counted,
 * not collapsed: two identical coffees in the file stay two, and importing the file again adds
 * nothing because both are then in the app. Compares the bank's own description, not a rename.
 */
export async function newRows(
  client: StatementClient,
  rows: Array<StatementRow>,
  cache?: Map<string, Map<string, number>>,
): Promise<Array<StatementRow>> {
  if (rows.length === 0) return [];
  const dates = rows.map((r) => r.date).sort();
  const [first, last] = [dates[0]!, dates.at(-1)!];
  // Re-reading the same file with other columns or options covers the same days: ask once.
  const range = `${first}|${last}`;
  // Only answers already in are reused: a newer read never waits behind an older one.
  let known = cache?.get(range);
  if (!known) {
    known = await keysInApp(client, first, last);
    cache?.set(range, known);
  }
  const inApp = new Map(known);
  return rows.filter((r) => {
    const key = dedupeKey(r);
    const left = inApp.get(key) ?? 0;
    if (left === 0) return true;
    inApp.set(key, left - 1);
    return false;
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
          p_currency: r.currency ?? "EUR",
          p_category: r.category ?? null,
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
