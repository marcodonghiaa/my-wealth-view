export const CATEGORIES = [
  "Shopping",
  "Entertainment",
  "Groceries",
  "Dine Out",
  "Services",
  "Housing",
  "Transports",
  "Experiences",
  "Income",
  "Health",
  "Transfer",
  "Taxes",
  "Others",
] as const;

export const TRANSACTION_TYPES = ["Subscription", "One-time"] as const;

// One fixed colour per category, reused by the spending chart, its rows and the transaction
// pills so a category reads the same everywhere. Hex, not theme tokens: they must stay
// distinguishable from each other in both light and dark mode.
const CATEGORY_COLORS: Record<(typeof CATEGORIES)[number], string> = {
  Shopping: "#ec4899",
  Entertainment: "#8b5cf6",
  Groceries: "#6366f1",
  "Dine Out": "#f97316",
  Services: "#3b82f6",
  Housing: "#14b8a6",
  Transports: "#eab308",
  Experiences: "#06b6d4",
  Income: "#84cc16",
  Health: "#d946ef",
  Transfer: "#64748b",
  Taxes: "#a16207",
  Others: "#94a3b8",
};

const UNKNOWN_CATEGORY_COLOR = "var(--color-muted-foreground)";

export function categoryColor(category: string | null | undefined): string {
  if (!category) return UNKNOWN_CATEGORY_COLOR;
  return (CATEGORY_COLORS as Record<string, string>)[category] ?? UNKNOWN_CATEGORY_COLOR;
}
