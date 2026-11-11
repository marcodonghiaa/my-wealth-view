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

// Categories are one hue ordered by lightness, not a rainbow: a colour is a RANK. Rank 0 is
// the darkest tone (chart-1); ranks 4 and up share the lightest (chart-5).
export function categoryTone(rank: number): string {
  const step = Math.min(Math.max(Math.floor(rank), 0), 4) + 1;
  return `var(--color-chart-${step})`;
}

// One fixed colour per category, reused by the spending chart, its rows, avatars and pills so a
// category reads the same everywhere. A better-tuned palette is still to be chosen (2026-11-09).
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

/** The category's colour; your own categories hash to one of the custom colours. */
export function categoryColor(category: string | null | undefined): string {
  // "Uncategorized" is what the spending views call a missing category.
  if (!category || category === "Uncategorized") return UNKNOWN_CATEGORY_COLOR;
  // Own keys only, so a category called "constructor" isn't read off Object.prototype.
  if (Object.hasOwn(CATEGORY_COLORS, category))
    return (CATEGORY_COLORS as Record<string, string>)[category]!;
  let hash = 0;
  for (const ch of category) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return CUSTOM_COLORS[hash % CUSTOM_COLORS.length]!;
}

const CATEGORY_CODES: Record<(typeof CATEGORIES)[number], string> = {
  Shopping: "SH",
  Entertainment: "EN",
  Groceries: "GR",
  "Dine Out": "DO",
  Services: "SE",
  Housing: "HO",
  Transports: "TR",
  Experiences: "EX",
  Income: "IN",
  Health: "HE",
  Transfer: "TF",
  Taxes: "TX",
  Others: "OT",
};

/** Two-letter uppercase code for the category avatar; "--" when there is none. */
export function categoryCode(category: string | null | undefined): string {
  if (!category || category === "Uncategorized") return "--";
  const builtIn = (CATEGORY_CODES as Record<string, string>)[category];
  if (builtIn) return builtIn;
  const words = category.trim().split(/\s+/).filter(Boolean);
  const code = words.length >= 2 ? words[0]![0]! + words[1]![0]! : category.slice(0, 2);
  return code.toUpperCase().padEnd(2, "-");
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
