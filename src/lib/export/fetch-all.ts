import type { SupabaseClient } from "@supabase/supabase-js";
import { EXPORT_TABLES, type ExportData, type ExportRow, type ExportTableName } from "./tables";

/** Rows per request; Supabase's default API cap is 1000, so bigger pages would be cut silently. */
export const PAGE_SIZE = 1000;

export class ExportError extends Error {
  readonly table: string;
  constructor(table: string, message: string) {
    super(message);
    this.name = "ExportError";
    this.table = table;
  }
}

export interface PageResult {
  data: Array<ExportRow> | null;
  error: { message: string } | null;
  count: number | null;
}
export type PageFetcher = (from: number, to: number) => PromiseLike<PageResult>;
export type Progress = (table: string, done: number, total: number) => void;

/**
 * Every row of one table, a page at a time. The server's exact row count decides when to stop
 * (a short page alone can't tell the end from a lower server cap), so a table that comes back
 * with fewer rows than it counted is an error, never a quietly smaller file.
 */
export async function fetchAllRows(
  table: string,
  fetchPage: PageFetcher,
  onProgress?: Progress,
): Promise<Array<ExportRow>> {
  const rows: Array<ExportRow> = [];
  let total = 0;
  let first = true;
  while (first || rows.length < total) {
    const { data, error, count } = await fetchPage(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw new ExportError(table, error.message);
    if (count === null) throw new ExportError(table, "the server did not report a row count");
    total = count;
    first = false;
    if (!data || data.length === 0) {
      if (rows.length < total) throw new ExportError(table, "fewer rows came back than exist");
      break;
    }
    rows.push(...data);
    onProgress?.(table, Math.min(rows.length, total), total);
  }
  return rows;
}

/** All tables, one after another, under the signed-in user's own session. */
export async function fetchAllTables(
  client: SupabaseClient,
  userId: string,
  onProgress?: Progress,
): Promise<ExportData> {
  const out: Partial<ExportData> = {};
  for (const { name, order } of EXPORT_TABLES) {
    out[name as ExportTableName] = await fetchAllRows(
      name,
      (from, to) => {
        // eq(user_id) is belt and braces: row-level security already limits rows to the owner.
        let q = client.from(name).select("*", { count: "exact" }).eq("user_id", userId);
        for (const col of order) q = q.order(col, { ascending: true });
        return q.range(from, to) as unknown as PromiseLike<PageResult>;
      },
      onProgress,
    );
  }
  return out as ExportData;
}
