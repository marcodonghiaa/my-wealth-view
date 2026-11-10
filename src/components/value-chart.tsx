import { ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisDateFormatter, formatISODate } from "@/lib/date";

interface ValueChartProps<T extends { ts: number; snapshot_date: string }> {
  data: Array<T>;
  dataKey: keyof T & string;
  name: string;
  // Dashed line drawn across gaps in the history, when the series carries one.
  estimateKey?: keyof T & string;
  onScrub: (index: number | null) => void;
}

/** Marks the latest value only: an Ember dot in a soft Ember halo. */
export function latestDot(last: number) {
  return function LatestDot({ cx, cy, index }: { cx?: number; cy?: number; index?: number }) {
    if (index !== last || cx == null || cy == null) return <g key={index} />;
    return (
      <g key={index}>
        <circle cx={cx} cy={cy} r={6} fill="var(--color-ember)" fillOpacity={0.2} />
        <circle cx={cx} cy={cy} r={3} fill="var(--color-ember)" />
      </g>
    );
  };
}

// One line, no grid, no y-axis: hovering scrubs it and hands the day back to the page.
export function ValueChart<T extends { ts: number; snapshot_date: string }>({
  data,
  dataKey,
  name,
  estimateKey,
  onScrub,
}: ValueChartProps<T>) {
  const formatTick = axisDateFormatter(data.at(0)?.snapshot_date, data.at(-1)?.snapshot_date);
  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 24, bottom: 0, left: 24 }}
          onMouseMove={(state) =>
            onScrub(
              state?.isTooltipActive && state.activeTooltipIndex != null
                ? state.activeTooltipIndex
                : null,
            )
          }
          onMouseLeave={() => onScrub(null)}
        >
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(ts: number) => formatTick(formatISODate(new Date(ts)))}
            tick={{
              fill: "var(--color-muted-foreground)",
              fontSize: 11,
              fontFamily: "var(--font-figure)",
            }}
            tickLine={false}
            axisLine={false}
            minTickGap={56}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip
            content={() => null}
            cursor={{ stroke: "var(--color-foreground)", strokeWidth: 1, strokeDasharray: "2 3" }}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            name={name}
            isAnimationActive={false}
            stroke="var(--color-foreground)"
            strokeWidth={1.5}
            dot={latestDot(data.length - 1)}
            activeDot={{
              r: 3,
              fill: "var(--color-foreground)",
              stroke: "var(--color-background)",
              strokeWidth: 1.5,
            }}
          />
          {estimateKey && (
            <Line
              type="linear"
              dataKey={estimateKey}
              name="Estimate"
              isAnimationActive={false}
              stroke="var(--color-muted-foreground)"
              strokeWidth={1}
              strokeDasharray="2 3"
              dot={false}
              activeDot={false}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
