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

// Your own categories get one of these, picked from the name so it stays the same everywhere.
const CUSTOM_COLORS = ["#0ea5e9", "#f43f5e", "#22c55e", "#a855f7", "#f59e0b", "#10b981", "#e11d48"];

export function categoryColor(category: string | null | undefined): string {
  // "Uncategorized" is what the spending views call a missing category.
  if (!category || category === "Uncategorized") return UNKNOWN_CATEGORY_COLOR;
  const builtIn = (CATEGORY_COLORS as Record<string, string>)[category];
  if (builtIn) return builtIn;
  let hash = 0;
  for (const ch of category) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return CUSTOM_COLORS[hash % CUSTOM_COLORS.length]!;
}

/** Built-ins nobody may hide: transfers and income depend on them (the database refuses too). */
export const ALWAYS_SHOWN: ReadonlyArray<string> = ["Transfer", "Income"];

/** Your list: the built-in categories minus the ones you hid, plus your own (user_categories). */
export function categoriesFor(rows: Array<{ name: string; hidden: boolean }>): Array<string> {
  const hidden = new Set(rows.filter((r) => r.hidden).map((r) => r.name));
  const builtIn = CATEGORIES as ReadonlyArray<string>;
  const own = rows.filter((r) => !r.hidden && !builtIn.includes(r.name)).map((r) => r.name);
  return [...builtIn.filter((c) => !hidden.has(c)), ...own];
}
