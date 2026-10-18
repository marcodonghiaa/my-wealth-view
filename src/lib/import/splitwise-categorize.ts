import type { AppCategory } from "./suggest-category";
import { suggestCategory } from "./suggest-category";

// Picks an app category for one Splitwise row from its description: the user's own rules first,
// then keywords, then the Splitwise category. When nothing recognises it the result is null, so
// the review screen can ask instead of silently filing it under Others.

export interface UserRule {
  match_text: string;
  set_category: string | null;
  priority: number;
}

export interface Guess {
  category: AppCategory | null;
  source: "rule" | "keyword" | "splitwise" | null;
}

const RULE_TEXT_MAX = 60;

// Whole words only ("tj" must not match inside another word). English and Italian, as the
// spreadsheet import does. The first group that matches wins; Housing goes before Groceries so
// "oil + toilet paper" is a household purchase.
const KEYWORDS: Array<[AppCategory, RegExp]> = [
  [
    "Transports",
    /\b(uber|lyft|waymo|airbear|taxi|metro|bart|muni|train|treno|fuel|benzina|parking|bus|bike|bici|bicycle)\b/,
  ],
  [
    "Housing",
    /\b(rent|affitto|household|pods?|scottex|toilet|handsoap|soap|detergent|brita|filters?|paper towels?|ikea|furniture|washing|laundry|home)\b/,
  ],
  [
    "Groceries",
    /\b(grocer\w*|supermerc\w*|spesa|market|target|traders?|tj|tjoe|whole foods|costco|safeway|lidl|coop|esselunga|banane|macinato|celsius|bread|oil|salmon)\b/,
  ],
  [
    "Dine Out",
    /\b(restaurant\w*|ristorant\w*|dining|burgers?|ramen|grill|bbq|pizza|pizzeria|cafe|caffe|coffee|bar|drinks?|alcohol|liquor|beer|wine|dinner|lunch|brunch|chili|duper|takeaway|shake shack|in n out)\b/,
  ],
  [
    "Entertainment",
    /\b(movies?|cinema|theatre|theater|rave|tickets?|concert|football|serata|netflix|spotify|game|bet)\b/,
  ],
  ["Experiences", /\b(hike|hiking|trip|travel|viaggio|hotel|holiday|vacanza)\b/],
  ["Health", /\b(pharmac\w*|farmac\w*|doctor|medic\w*|dentist|gym|palestra)\b/],
  ["Shopping", /\b(shop|goodwill|amazon|cloth\w*|abbigliament\w*|cake|gift|regalo|airtag)\b/],
];

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "").toLowerCase();

const isAppCategory = (value: string | null): value is AppCategory =>
  value !== null && suggestCategory(value) === value;

/** Category for one row, and where it came from. */
export function categorizeRow(
  row: { description: string; category: string },
  rules: Array<UserRule>,
): Guess {
  const text = norm(row.description);

  for (const r of rules) {
    const wanted = norm(r.match_text).trim();
    if (wanted !== "" && isAppCategory(r.set_category) && text.includes(wanted)) {
      return { category: r.set_category, source: "rule" };
    }
  }
  const byWord = KEYWORDS.find(([, pattern]) => pattern.test(text))?.[0];
  if (byWord) return { category: byWord, source: "keyword" };

  const fromSplitwise = suggestCategory(row.category);
  return fromSplitwise === "Others"
    ? { category: null, source: null }
    : { category: fromSplitwise, source: "splitwise" };
}

/** The text a new rule will match, taken from the description the user just corrected. */
export const ruleTextFor = (description: string): string =>
  description.trim().toLowerCase().slice(0, RULE_TEXT_MAX);
