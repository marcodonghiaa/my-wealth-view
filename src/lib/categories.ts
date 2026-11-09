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

const UNKNOWN_CATEGORY_COLOR = "var(--color-muted-foreground)";

/** The category's tone, from its place in the built-in list; your own categories hash to one. */
export function categoryColor(category: string | null | undefined): string {
  // "Uncategorized" is what the spending views call a missing category.
  if (!category || category === "Uncategorized") return UNKNOWN_CATEGORY_COLOR;
  const index = (CATEGORIES as ReadonlyArray<string>).indexOf(category);
  if (index >= 0) return categoryTone(index);
  let hash = 0;
  for (const ch of category) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return categoryTone(hash % 5);
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
