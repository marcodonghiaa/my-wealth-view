import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState } from "react";
import { SegmentedControl } from "@/components/segmented-control";
import {
  ALLOCATION_RANGES,
  allocationHistory,
  allocationSeries,
  breakAtGaps,
  inRange,
  type AllocationPlotPoint,
  type ChartRange,
  type HistoryRow,
  type NetWorthRow,
  type ReconstructedRow,
} from "@/lib/net-worth";
import { axisDateFormatter, formatISODate } from "@/lib/date";
import { useIsMobile } from "@/lib/use-is-mobile";

const CLASSES = [
  { key: "stocks", label: "Stocks", color: "var(--color-chart-2)" },
  { key: "bonds", label: "Bonds", color: "var(--color-chart-4)" },
  { key: "crypto", label: "Crypto", color: "var(--color-chart-3)" },
  { key: "cash", label: "Cash", color: "var(--color-chart-1)" },
  { key: "other", label: "Unallocated", color: "var(--color-muted-foreground)" },
] as const;

export function AllocationChart({
  history,
  snapshots,
  reconstructed = [],
}: {
  history: Array<HistoryRow>;
  snapshots: Array<NetWorthRow>;
  reconstructed?: Array<ReconstructedRow>;
}) {
  const isMobile = useIsMobile();
  const [range, setRange] = useState<ChartRange>("1Y");
  const all = allocationSeries(allocationHistory(history, snapshots, undefined, reconstructed));
  if (all.length < 2) return null;
  const data = breakAtGaps(inRange(all, range));
  // The grey band only appears when some imported total has no split.
  const classes = CLASSES.filter((c) => c.key !== "other" || data.some((d) => (d.other ?? 0) > 0));
  const fmtTick = axisDateFormatter(data[0]?.snapshot_date, data.at(-1)?.snapshot_date);

  return (
    <section className="mt-6 rounded-2xl bg-card px-1 py-4 card-ring sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-2">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          Asset allocation over time
        </h2>
        <div className="w-full sm:w-auto">
          <SegmentedControl
            label="Allocation range"
            options={ALLOCATION_RANGES.map((r) => ({ value: r, label: r }))}
            value={range}
            onChange={setRange}
          />
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {classes.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block size-2 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              {c.label}
            </span>
          ))}
        </div>
      </div>
      <div
        className="h-64 w-full"
        role="img"
        aria-label="Asset allocation over time, share of stocks, bonds, crypto, cash and unallocated"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            stackOffset="expand"
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 6" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(ts: number) => fmtTick(formatISODate(new Date(ts)))}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
            />
            <YAxis
              width={isMobile ? 36 : 44}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={<AllocationTooltip classes={classes} />}
              cursor={{ stroke: "var(--color-primary)", strokeOpacity: 0.3 }}
            />
            {classes.map((c) => (
              <Area
                key={c.key}
                type="monotone"
                dataKey={c.key}
                name={c.label}
                stackId="mix"
                stroke={c.color}
                strokeWidth={1.5}
                fill={c.color}
                fillOpacity={0.55}
                dot={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {reconstructed.length > 0 && (
        <p className="mt-2 px-2 text-xs text-muted-foreground">
          Rebuilt months use today's quantities and exclude CDs.
        </p>
      )}
    </section>
  );
}

function AllocationTooltip({
  active,
  payload,
  classes,
}: {
  classes: ReadonlyArray<(typeof CLASSES)[number]>;
  active?: boolean;
  payload?: Array<{ payload?: AllocationPlotPoint }>;
}) {
  const point = payload?.at(0)?.payload;
  if (!active || !point || point.stocks === null) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground">
        {new Date(point.ts).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
      </p>
      <div className="mt-1 space-y-0.5 text-xs">
        {classes.map((c) => (
          <p key={c.key} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block size-2 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              {c.label}
            </span>
            <span className="font-figure">{(point[c.key] ?? 0).toFixed(1)}%</span>
          </p>
        ))}
      </div>
    </div>
  );
}
