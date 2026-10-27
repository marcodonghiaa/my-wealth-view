const BRAND_COLORS: Record<string, string> = { BTC: "#f7931a", ETH: "#8b5cf6" };

// None of these is close to Bitcoin's orange or Ethereum's purple, nor to the gain green or
// loss red, so a coin's colour never reads as a price move.
const OTHER_COLORS = [
  "#0ea5e9",
  "#3b82f6",
  "#14b8a6",
  "#ec4899",
  "#d946ef",
  "#06b6d4",
  "#eab308",
  "#64748b",
];

// Well-known coins keep their brand colour; the rest take the next unused colour in order.
export function colorsForAssets(symbols: Array<string>): Array<string> {
  let next = 0;
  return symbols.map(
    (symbol) => BRAND_COLORS[symbol.toUpperCase()] ?? OTHER_COLORS[next++ % OTHER_COLORS.length]!,
  );
}
