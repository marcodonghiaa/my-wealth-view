// One hue per asset class, used by every figure (Net Worth breakdown, Portfolio bar and rows),
// so a class looks the same wherever it appears. Tokens live in styles.css (light and dark).
export const ASSET_COLORS = {
  stock: "var(--alloc-stocks)",
  etf: "var(--alloc-etf)",
  fund: "var(--alloc-fund)",
  bond: "var(--alloc-bonds)",
  crypto: "var(--alloc-crypto)",
  cash: "var(--alloc-cash)",
  other: "var(--color-muted-foreground)",
} as const;

const BY_HOLDING_TYPE: Record<string, string> = {
  Stock: ASSET_COLORS.stock,
  ETF: ASSET_COLORS.etf,
  Fund: ASSET_COLORS.fund,
  Bond: ASSET_COLORS.bond,
};

/** A Portfolio holding type's colour; unknown types share the muted "other" colour. */
export function colorForHoldingType(type: string): string {
  return BY_HOLDING_TYPE[type] ?? ASSET_COLORS.other;
}
