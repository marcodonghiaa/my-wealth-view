import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatRate, type TrendBar } from "@/lib/cash-flow";
import { formatSignedEur } from "@/lib/transactions";

const TICK = {
  fill: "var(--color-muted-foreground)",
  fontSize: 11,
  fontFamily: "var(--font-figure)",
};

/** One bar's tooltip: its period, what was saved and the rate. */
export function TrendTooltip({ bar }: { bar: TrendBar & { tick: string } }) {
  return (
    <div className="rounded-sm border border-hairline bg-popover px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-medium text-foreground">{bar.tick}</p>
      <p className="font-figure text-muted-foreground">
        {/* Nothing recorded is not a net of zero. */}
        {bar.months === 0
          ? "No activity"
          : `Saved ${formatSignedEur(bar.net)} · ${formatRate(bar.savingsRate)}`}
      </p>
    </div>
  );
}

/**
 * What was saved in each of the last periods; a bar below the line is a period that spent more
 * than came in. The selected period is solid, the rest are faded; tapping a bar selects it.
 */
export function TrendBars({
  bars,
  selected,
  label,
  tickLabel,
  onSelect,
}: {
  bars: Array<TrendBar>;
  selected: string;
  label: string;
  tickLabel: (bar: TrendBar) => string;
  onSelect: (bar: TrendBar) => void;
}) {
  const data = bars.map((b) => ({ ...b, tick: tickLabel(b) }));
  return (
    <div role="img" aria-label={label} className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="tick" tick={TICK} tickLine={false} axisLine={false} interval={0} />
          <ReferenceLine y={0} stroke="var(--color-border)" />
          <Tooltip
            cursor={{ fill: "var(--color-muted)" }}
            content={({ active, payload }) => {
              const bar = active
                ? (payload?.[0]?.payload as (typeof data)[number] | undefined)
                : undefined;
              return bar ? <TrendTooltip bar={bar} /> : null;
            }}
          />
          <Bar
            dataKey="net"
            radius={[2, 2, 2, 2]}
            maxBarSize={28}
            onClick={(entry: { payload?: TrendBar }) => entry.payload && onSelect(entry.payload)}
            className="cursor-pointer"
          >
            {data.map((b) => (
              <Cell
                key={b.key}
                fill={b.net < 0 ? "var(--color-negative)" : "var(--color-positive)"}
                fillOpacity={b.key === selected ? 1 : 0.35}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
