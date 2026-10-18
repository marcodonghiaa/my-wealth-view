const BRAND_COLORS: Record<string, string> = { BTC: "#f7931a", ETH: "#8b5cf6" };

// None of these is close to Bitcoin's orange or Ethereum's purple.
const OTHER_COLORS = [
  "#22c55e",
  "#3b82f6",
  "#14b8a6",
  "#ec4899",
  "#ef4444",
  "#06b6d4",
  "#84cc16",
  "#64748b",
];

// Well-known coins keep their brand colour; the rest take the next unused colour in order.
export function colorsForAssets(symbols: Array<string>): Array<string> {
  let next = 0;
  return symbols.map(
    (symbol) => BRAND_COLORS[symbol.toUpperCase()] ?? OTHER_COLORS[next++ % OTHER_COLORS.length]!,
  );
}
