import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useMemo } from "react";
import { byKey, ofKind, rangeQuery, summarize } from "@/lib/performance";
import type { HoldingRange, PerformanceRow } from "@/lib/performance";

export type PerformanceResult = { rows: Array<PerformanceRow> } | { unavailable: true };

// PostgREST answers PGRST202 when the function is not in the database: the dashboard was deployed
// before the owner applied the migration. That is "not available yet", not a failure.
const isMissingFunction = (error: { code?: string }) => error.code === "PGRST202";

/**
 * The per-holding prices behind a range. One row per held stock, fund or coin (about 25), so there
 * is no paging: nothing here can hit the 1000-row limit that silently cuts a long table.
 */
export async function fetchPerformance(
  client: SupabaseClient<Database>,
  from: string,
  lastMove: boolean,
): Promise<PerformanceResult> {
  const { data, error } = await client.rpc("holding_performance", {
    p_from: from,
    p_last_move: lastMove,
  });
  if (error) {
    if (isMissingFunction(error)) return { unavailable: true };
    throw error;
  }
  return { rows: data ?? [] };
}

/** `lastIso` is the latest day of the value history; the query waits until it is known. */
export function usePerformance(
  range: HoldingRange,
  lastIso: string | undefined,
  kind: "stock" | "crypto",
) {
  const query = lastIso == null ? null : rangeQuery(range, lastIso);
  const result = useQuery({
    queryKey: ["holding-performance", query?.from, query?.lastMove],
    queryFn: () => fetchPerformance(supabase, query!.from, query!.lastMove),
    enabled: query != null,
  });
  const rows = useMemo(
    () => ofKind(result.data && "rows" in result.data ? result.data.rows : [], kind),
    [result.data, kind],
  );
  const summary = useMemo(() => summarize(rows), [rows]);
  const rowsByKey = useMemo(() => byKey(rows), [rows]);
  return {
    rows,
    rowsByKey,
    summary,
    isPending: lastIso == null || result.isPending,
    unavailable: result.data != null && "unavailable" in result.data,
    error: result.isError ? result.error : null,
  };
}
