import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { BalanceRow } from "@/lib/import/splitwise-balances";

async function fetchBalances(): Promise<Array<BalanceRow>> {
  const { data, error } = await supabase
    .from("splitwise_balances")
    .select("group_name,person,balance,currency,is_me,updated_at");
  if (error) throw error;
  return data ?? [];
}

// Latest rate per currency; fx_rates holds a row per day, newest first here.
async function fetchLatestRates(currencies: Array<string>): Promise<Record<string, number>> {
  if (currencies.length === 0) return {};
  const { data, error } = await supabase
    .from("fx_rates")
    .select("currency,rate_to_eur,date")
    .in("currency", currencies)
    .order("date", { ascending: false })
    .limit(500);
  if (error) throw error;
  const latest: Record<string, number> = {};
  for (const r of data ?? []) if (!(r.currency in latest)) latest[r.currency] = r.rate_to_eur;
  return latest;
}

/** Stored Splitwise balances plus a euro rate lookup for their currencies. */
export function useSplitwiseBalances() {
  const balances = useQuery({ queryKey: ["splitwise-balances"], queryFn: fetchBalances });
  const currencies = useMemo(
    () => [...new Set((balances.data ?? []).map((b) => b.currency))].filter((c) => c !== "EUR"),
    [balances.data],
  );
  const rates = useQuery({
    queryKey: ["splitwise-balance-rates", currencies],
    queryFn: () => fetchLatestRates(currencies),
    enabled: balances.isSuccess,
    staleTime: 5 * 60_000,
  });
  const rate = useMemo(
    () => (currency: string) => (currency === "EUR" ? 1 : (rates.data?.[currency] ?? null)),
    [rates.data],
  );
  return { balances, rates, rate, rows: balances.data ?? [] };
}
