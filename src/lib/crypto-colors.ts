// Coins take the category lightness ramp (DESIGN.md "One Hue Rule"): callers pass symbols largest
// first, so rank 1 is the darkest. Past five coins the ramp repeats.
export function colorsForAssets(symbols: Array<string>): Array<string> {
  return symbols.map((_, i) => `var(--color-chart-${(i % 5) + 1})`);
}
