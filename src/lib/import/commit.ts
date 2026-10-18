export type ImportKind = "net_worth" | "spend";

type Result = PromiseLike<{ error: { message: string } | null }>;

/** The slice of the Supabase client the import uses; keeps the logic testable without a network. */
export interface Writer {
  from(table: string): {
    upsert(rows: Array<object>, options: { onConflict: string }): Result;
    delete(): { eq(column: string, value: string): { eq(column: string, value: string): Result } };
  };
}

const TARGETS: Record<ImportKind, { table: string; conflict: string }> = {
  net_worth: { table: "net_worth_history", conflict: "user_id,snapshot_date" },
  spend: { table: "spend_history", conflict: "user_id,month,category" },
};

export const CHUNK_SIZE = 500;

/**
 * Writes rows for one user, all tagged with a new batch id, replacing rows that share the same
 * key. Returns the batch id. If a chunk fails, the chunks already written are removed.
 */
export async function runImport(
  writer: Writer,
  kind: ImportKind,
  userId: string,
  rows: Array<object>,
): Promise<string> {
  if (rows.length === 0) throw new Error("Nothing to import.");
  const { table, conflict } = TARGETS[kind];
  const batchId = crypto.randomUUID();
  const tagged = rows.map((row) => ({ ...row, user_id: userId, batch_id: batchId }));

  for (let start = 0; start < tagged.length; start += CHUNK_SIZE) {
    const { error } = await writer
      .from(table)
      .upsert(tagged.slice(start, start + CHUNK_SIZE), { onConflict: conflict });
    if (error) {
      await undoImport(writer, kind, userId, batchId).catch(() => undefined);
      throw new Error(error.message);
    }
  }
  return batchId;
}

/** Removes the rows one import wrote. Values it replaced are not restored. */
export async function undoImport(
  writer: Writer,
  kind: ImportKind,
  userId: string,
  batchId: string,
): Promise<void> {
  const { error } = await writer
    .from(TARGETS[kind].table)
    .delete()
    .eq("user_id", userId)
    .eq("batch_id", batchId);
  if (error) throw new Error(error.message);
}
