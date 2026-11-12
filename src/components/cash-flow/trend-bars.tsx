import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatRate, type TrendBar } from "@/lib/cash-flow";
import { formatSignedEur } from "@/lib/transactions";

const TICK = {
  fill: "var(--color-muted-foreground)",
  fontSize: 11,
  fontFamily: "var(--font-figure)",
};

/** What one bar says: what was saved and the share of income, or that nothing was recorded. */
function barText(bar: TrendBar): string {
  // Nothing recorded is not a net of zero.
  if (bar.months === 0) return "No activity";
  const rate = bar.savingsRate == null ? "" : ` · ${formatRate(bar.savingsRate)} of income`;
  return `Saved ${formatSignedEur(bar.net)}${rate}`;
}

/** One bar's tooltip: its period, what was saved and the rate. */
export function TrendTooltip({ bar }: { bar: TrendBar & { tick: string } }) {
  return (
    <div className="rounded-sm border border-hairline bg-popover px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-medium text-foreground">{bar.tick}</p>
      <p className="font-figure text-muted-foreground">{barText(bar)}</p>
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
  // The values otherwise live only in the hover tooltip: name every bar for screen readers.
  const named = `${label}: ${data.map((b) => `${b.tick} ${barText(b)}`).join("; ")}.`;
  return (
    <div role="img" aria-label={named} className="h-40">
      <div aria-hidden="true" className="size-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
            // The whole column picks its period: a break-even bar is too short to tap.
            onClick={(state: { activeTooltipIndex?: number } | null) => {
              const bar = data[state?.activeTooltipIndex ?? -1];
              if (bar) onSelect(bar);
            }}
            className="cursor-pointer"
          >
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
            <Bar dataKey="net" radius={[2, 2, 2, 2]} maxBarSize={28}>
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
    </div>
  );
}
