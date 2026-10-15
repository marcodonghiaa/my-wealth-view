// Text alternatives for charts: screen readers get the numbers the picture shows.
export function shareSummary(
  title: string,
  items: Array<{ label: string; value: number }>,
): string {
  const total = items.reduce((sum, i) => sum + Math.abs(i.value), 0);
  if (total === 0) return `${title}: no data.`;
  const parts = [...items]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .map((i) => `${i.label} ${Math.round((Math.abs(i.value) / total) * 100)}%`);
  return `${title}: ${parts.join(", ")}.`;
}

export function trendSummary(
  title: string,
  start: number,
  end: number,
  format: (value: number) => string,
): string {
  if (start === end) return `${title}: unchanged at ${format(end)}.`;
  return `${title}: ${end > start ? "rose" : "fell"} from ${format(start)} to ${format(end)}.`;
}
