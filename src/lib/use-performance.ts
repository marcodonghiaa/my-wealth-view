import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { ofKind } from "@/lib/performance";
import type { PerformanceRow } from "@/lib/performance";
import { fetchAllRows } from "@/lib/export/fetch-all";
import type { ExportRow } from "@/lib/export/tables";
import { measure, summarizeTrades } from "@/lib/trades";
import type { Measured, Trade } from "@/lib/trades";

export type PerformanceResult = { rows: Array<PerformanceRow> } | { unavailable: true };
export type SavedTrade = Trade & { id: string };
export type TradesResult = { trades: Array<SavedTrade> } | { unavailable: true };

// PostgREST answers these when the function or table is not in the database: the dashboard was
// deployed before the owner applied the migration. That is "not available yet", not a failure.
const isMissingFunction = (error: { code?: string }) => error.code === "PGRST202";
const isMissingTable = (error: { code?: string }) =>
  error.code === "PGRST205" || error.code === "42P01";

/**
 * The per-holding prices behind a range. One row per stock, fund or coin (about 25), so there is
 * no paging: nothing here can hit the 1000-row limit that silently cuts a long table.
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

/** Every trade, paged: savings plans over 25 holdings can pass the 1000-row limit. */
export async function fetchTrades(client: SupabaseClient<Database>): Promise<TradesResult> {
  let missing = false;
  const rows = await fetchAllRows("holding_trades", async (from, to) => {
    const { data, error, count } = await client
      .from("holding_trades")
      .select("id,kind,key,side,trade_date,shares,price_eur,fee_eur", { count: "exact" })
      .order("id")
      .range(from, to);
    if (error && isMissingTable(error)) {
      missing = true;
      return { data: [], error: null, count: 0 };
    }
    return { data: data as Array<ExportRow> | null, error, count };
  });
  return missing ? { unavailable: true } : { trades: rows as unknown as Array<SavedTrade> };
}

// Every holding's latest price: total return has no range, so any early date will do.
const EARLIEST = "1970-01-01";

/** Total return from your trades. `lastIso` is the latest data day; refetches when it moves. */
export function usePerformance(lastIso: string | undefined, kind: "stock" | "crypto") {
  const prices = useQuery({
    queryKey: ["holding-performance", lastIso],
    queryFn: () => fetchPerformance(supabase, EARLIEST, false),
    enabled: lastIso != null,
  });
  const saved = useQuery({ queryKey: ["holding-trades"], queryFn: () => fetchTrades(supabase) });

  const tradesByKey = useMemo(() => {
    const out = new Map<string, Array<SavedTrade>>();
    if (saved.data && "trades" in saved.data) {
      for (const t of saved.data.trades) {
        if (t.kind === kind) out.set(t.key, [...(out.get(t.key) ?? []), t]);
      }
    }
    return out;
  }, [saved.data, kind]);

  const measured = useMemo(() => {
    const rows = ofKind(prices.data && "rows" in prices.data ? prices.data.rows : [], kind);
    // Trades of something no longer in your holdings: sold, so their profit still counts.
    const known = new Set(rows.map((r) => r.key));
    const sold: Array<PerformanceRow> = [...tradesByKey.keys()]
      .filter((key) => !known.has(key))
      .map((key) => ({
        kind,
        key,
        name: null,
        quantity: 0,
        start_date: null,
        start_price_eur: null,
        end_date: null,
        end_price_eur: null,
        status: "no_price",
      }));
    return [...rows, ...sold].map((row) => ({
      row,
      measured: measure(row, tradesByKey.get(row.key) ?? []),
    }));
  }, [prices.data, tradesByKey, kind]);

  const summary = useMemo(() => summarizeTrades(measured, 1), [measured]);
  const measuredByKey = useMemo(
    () => new Map<string, Measured>(measured.map((m) => [m.row.key, m.measured])),
    [measured],
  );

  return {
    kind,
    summary,
    measuredByKey,
    tradesByKey,
    isPending: lastIso == null || prices.isPending || saved.isPending,
    unavailable:
      (prices.data != null && "unavailable" in prices.data) ||
      (saved.data != null && "unavailable" in saved.data),
    error: prices.error ?? saved.error ?? null,
  };
}
