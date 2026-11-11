import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TrendTooltip } from "./trend-bars";
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
    expect(container).toHaveTextContent("Saved +€750.00 · 25%");
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
