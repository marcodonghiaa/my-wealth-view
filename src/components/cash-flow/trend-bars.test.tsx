import { describe, expect, it, vi } from "vitest";
import { cloneElement, type ReactElement } from "react";

vi.mock("recharts", async (orig) => ({
  ...(await orig<typeof import("recharts")>()),
  ResponsiveContainer: ({ children }: { children: ReactElement }) =>
    cloneElement(children as ReactElement<{ width: number; height: number }>, {
      width: 640,
      height: 160,
    }),
}));
import { render } from "@testing-library/react";
import { TrendBars, TrendTooltip } from "./trend-bars";
import type { TrendBar } from "@/lib/cash-flow";

const bar = (over: Partial<TrendBar>): TrendBar & { tick: string } => ({
  start: new Date(2026, 10, 1),
  key: "2026-11-01",
  tick: "Nov",
  income: 3000,
  spending: 2250,
  net: 750,
  savingsRate: 0.25,
  months: 1,
  ...over,
});

describe("TrendTooltip", () => {
  it("shows what was saved and the rate", () => {
    const { container } = render(<TrendTooltip bar={bar({})} />);
    expect(container).toHaveTextContent("Nov");
    // Polish 4 #10: no "+"; the words say the direction.
    expect(container).toHaveTextContent("€750.00 saved · 25% of income");
    expect(container).not.toHaveTextContent("+");
  });

  // Polish 3 #10: a period with nothing recorded says so, not "Saved +€0.00".
  it("says when nothing was recorded", () => {
    const { container } = render(
      <TrendTooltip bar={bar({ income: 0, spending: 0, net: 0, savingsRate: null, months: 0 })} />,
    );
    expect(container).toHaveTextContent("No activity");
    expect(container).not.toHaveTextContent("€0.00");
  });
});

// Polish 4 #7: like the app's other charts, the bars don't animate (reduced motion included).
it("draws the bars at once, without animation", () => {
  const { container } = render(
    <TrendBars
      bars={[bar({}), bar({ key: "2026-10-01", net: 300 })]}
      selected="2026-11-01"
      label="Saved per month"
      tickLabel={(b) => (b.key === "2026-10-01" ? "Oct" : "Nov")}
      onSelect={() => {}}
    />,
  );
  expect(container.querySelectorAll(".recharts-bar-rectangle path").length).toBe(2);
});
