import { supabase } from "@/integrations/supabase/client";
import type { HistoryRow, NetWorthRow, ReconstructedRow } from "./net-worth";

// The three sources behind every net worth view: live daily snapshots, months imported from the
// sheet, and months rebuilt from statements. Merged by withHistory.
export async function fetchNetWorth(): Promise<Array<NetWorthRow>> {
  const { data, error } = await supabase
    .from("v_net_worth_daily")
    .select("snapshot_date,total_eur,bank_total_eur,portfolio_total_eur,crypto_total_eur")
    .order("snapshot_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<NetWorthRow>;
}

export async function fetchHistory(): Promise<Array<HistoryRow>> {
  const { data, error } = await supabase
    .from("net_worth_history")
    .select(
      "snapshot_date,stocks_eur,bonds_eur,crypto_eur,cash_eur,other_eur,liabilities_eur,total_eur",
    )
    .order("snapshot_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<HistoryRow>;
}

export async function fetchReconstructed(): Promise<Array<ReconstructedRow>> {
  const { data, error } = await supabase
    .from("net_worth_reconstructed")
    .select("snapshot_date,stocks_eur,bonds_eur,cash_eur,crypto_eur")
    .order("snapshot_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
