import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisDateFormatter, formatISODate } from "@/lib/date";

interface ValueChartProps<T extends { ts: number; snapshot_date: string }> {
  data: Array<T>;
  dataKey: keyof T & string;
  name: string;
  // Dashed line drawn across gaps in the history, when the series carries one.
  estimateKey?: keyof T & string;
  onScrub: (index: number | null) => void;
}

// One line, no grid, no y-axis: hovering scrubs it and hands the day back to the page.
export function ValueChart<T extends { ts: number; snapshot_date: string }>({
  data,
  dataKey,
  name,
  estimateKey,
  onScrub,
}: ValueChartProps<T>) {
  const fillId = `${dataKey}-fill`;
  const formatTick = axisDateFormatter(data.at(0)?.snapshot_date, data.at(-1)?.snapshot_date);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
        onMouseMove={(state) =>
          onScrub(
            state?.isTooltipActive && state.activeTooltipIndex != null
              ? state.activeTooltipIndex
              : null,
          )
        }
        onMouseLeave={() => onScrub(null)}
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.16} />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(ts: number) => formatTick(formatISODate(new Date(ts)))}
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={56}
          interval="preserveStartEnd"
        />
        <YAxis hide domain={["auto", "auto"]} />
        <Tooltip
          content={() => null}
          cursor={{ stroke: "var(--color-foreground)", strokeOpacity: 0.25 }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          name={name}
          isAnimationActive={false}
          stroke="var(--color-primary)"
          strokeWidth={2}
          fill={`url(#${fillId})`}
          dot={false}
          activeDot={{
            r: 4,
            fill: "var(--color-primary)",
            stroke: "var(--color-background)",
            strokeWidth: 2,
          }}
        />
        {estimateKey && (
          <Line
            type="linear"
            dataKey={estimateKey}
            name="Estimate"
            isAnimationActive={false}
            stroke="var(--color-muted-foreground)"
            strokeWidth={1.5}
            strokeDasharray="2 4"
            dot={false}
            activeDot={false}
            connectNulls
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
