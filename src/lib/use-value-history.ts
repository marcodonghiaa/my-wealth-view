import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { chartPoints, inRange, withHistory } from "@/lib/net-worth";
import type { ChartRange } from "@/lib/net-worth";
import { fetchHistory, fetchNetWorth, fetchReconstructed } from "@/lib/net-worth-queries";

type ValueKey = "portfolio_total_eur" | "crypto_total_eur";

/**
 * One slice of net worth (portfolio or crypto) over time, from the same merged history as the
 * Net Worth page (shared query cache). Scrubbing the chart swaps `shownEur` to that day.
 */
export function useValueHistory(key: ValueKey, todayEur: number) {
  const [range, setRange] = useState<ChartRange>("YTD");
  const netWorthQuery = useQuery({ queryKey: ["net-worth-daily"], queryFn: fetchNetWorth });
  const historyQuery = useQuery({ queryKey: ["net-worth-history"], queryFn: fetchHistory });
  const reconstructedQuery = useQuery({
    queryKey: ["net-worth-reconstructed"],
    queryFn: fetchReconstructed,
  });
  const chartData = useMemo(
    () =>
      inRange(
        chartPoints(
          withHistory(
            historyQuery.data ?? [],
            netWorthQuery.data ?? [],
            undefined,
            reconstructedQuery.data ?? [],
          ),
        ),
        range,
      ),
    [historyQuery.data, netWorthQuery.data, reconstructedQuery.data, range],
  );
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const scrubbed = scrubIndex != null ? chartData.at(scrubIndex) : undefined;
  const first = chartData.at(0);

  const shownEur = scrubbed?.[key] ?? todayEur;
  const delta = first ? shownEur - first[key] : null;
  const change = delta != null && first && first[key] !== 0 ? delta / Math.abs(first[key]) : null;
  const error = [netWorthQuery, historyQuery, reconstructedQuery].find((q) => q.isError)?.error;

  return {
    key,
    range,
    setRange,
    chartData,
    first,
    scrubbed,
    setScrubIndex,
    shownEur,
    delta,
    change,
    error,
  };
}

export type ValueHistory = ReturnType<typeof useValueHistory>;
