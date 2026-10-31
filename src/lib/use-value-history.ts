import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { chartPoints, inRange, withHistory } from "@/lib/net-worth";
import type { HoldingRange } from "@/lib/performance";
import { fetchHistory, fetchNetWorth, fetchReconstructed } from "@/lib/net-worth-queries";

// monthAgo counts months; a week is the 1D chart window.
function lastWeek<T extends { snapshot_date: string }>(points: Array<T>): Array<T> {
  const last = points.at(-1)?.snapshot_date;
  if (last == null) return points;
  const start = new Date(Date.parse(`${last}T00:00:00Z`) - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return points.filter((p) => p.snapshot_date >= start);
}

type ValueKey = "portfolio_total_eur" | "crypto_total_eur";

/**
 * One slice of net worth (portfolio or crypto) over time, from the same merged history as the
 * Net Worth page (shared query cache). Scrubbing the chart swaps `shownEur` to that day.
 */
export function useValueHistory(key: ValueKey, todayEur: number) {
  const [range, setRange] = useState<HoldingRange>("YTD");
  const netWorthQuery = useQuery({ queryKey: ["net-worth-daily"], queryFn: fetchNetWorth });
  const historyQuery = useQuery({ queryKey: ["net-worth-history"], queryFn: fetchHistory });
  const reconstructedQuery = useQuery({
    queryKey: ["net-worth-reconstructed"],
    queryFn: fetchReconstructed,
  });
  const chartData = useMemo(() => {
    const points = chartPoints(
      withHistory(
        historyQuery.data ?? [],
        netWorthQuery.data ?? [],
        undefined,
        reconstructedQuery.data ?? [],
      ),
    );
    // A day is two points, a flat line: the 1D chip shows the last week, its return is for the day.
    return range === "1D" ? lastWeek(points) : inRange(points, range);
  }, [historyQuery.data, netWorthQuery.data, reconstructedQuery.data, range]);
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
