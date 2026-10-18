const BRAND_COLORS: Record<string, string> = { BTC: "#f7931a", ETH: "#8b5cf6" };

const PALETTE = [1, 2, 3, 4, 5].map((n) => `var(--color-chart-${n})`);

// Well-known coins keep their brand colour; the rest rotate through the chart palette.
export const colorForAsset = (symbol: string, index: number): string =>
  BRAND_COLORS[symbol.toUpperCase()] ?? PALETTE[index % PALETTE.length]!;
