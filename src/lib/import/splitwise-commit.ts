import type { WritePlan } from "./splitwise-plan";

/** The slice of the Supabase client the Splitwise import uses; keeps it testable without a network. */
export interface RpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** The page keeps the flow open while this is running, so the result is always seen. */
export const IMPORT_KEY = ["splitwise-import"];

export interface ImportCounts {
  shares: number;
  links: number;
}

function readCounts(data: unknown): ImportCounts {
  const d = data as Partial<Record<keyof ImportCounts, unknown>> | null;
  if (typeof d?.shares !== "number" || typeof d.links !== "number") {
    throw new Error("The database gave an unexpected answer. Check your data before trying again.");
  }
  return { shares: d.shares, links: d.links };
}

/**
 * Writes a reviewed plan in one all-or-nothing database call. Returns the batch id, which Undo
 * needs, and how many rows were written.
 */
export async function runSplitwiseImport(
  client: RpcClient,
  plan: WritePlan,
): Promise<ImportCounts & { batchId: string }> {
  if (plan.problems.length > 0) throw new Error(plan.problems.join(" "));
  if (plan.shares.length === 0 && plan.links.length === 0) throw new Error("Nothing to import.");

  const batchId = crypto.randomUUID();
  const { data, error } = await client.rpc("import_splitwise", {
    p_batch: batchId,
    p_group: plan.group,
    p_from: plan.from,
    p_to: plan.to,
    p_shares: plan.shares,
    p_links: plan.links,
  });
  if (error) throw new Error(error.message);
  return { batchId, ...readCounts(data) };
}

/** Removes what one import wrote and frees the bank transactions it changed. */
export async function undoSplitwiseImport(
  client: RpcClient,
  batchId: string,
): Promise<ImportCounts> {
  const { data, error } = await client.rpc("undo_splitwise_import", { p_batch: batchId });
  if (error) throw new Error(error.message);
  return readCounts(data);
}
