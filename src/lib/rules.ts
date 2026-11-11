import { plural } from "@/lib/plural";

// Category rules: how a rule's text matches, and the "Make a rule" shortcut.

// "word" is the default: "bar" then matches "Bar Roma" but not "Barclays". `label` is the
// picker's, `phrase` reads in a sentence ("Name has the word “Netflix”"), `hint` explains it.
export const MATCH_MODES = [
  {
    value: "word",
    label: "Whole word",
    phrase: "has the word",
    hint: "Matches it as a separate word: “bar” finds “Bar Roma”, not “Barclays”.",
  },
  {
    value: "exact",
    label: "Exact",
    phrase: "is exactly",
    hint: "Matches only when the whole name or description is exactly this, ignoring case: “Netflix” finds “NETFLIX”, not “Netflix Italia”.",
  },
  {
    value: "contains",
    label: "Contains",
    phrase: "contains",
    hint: "Matches it anywhere, even inside other words: “bar” finds “Barclays” too.",
  },
] as const;
export type MatchMode = (typeof MATCH_MODES)[number]["value"];
const modeOf = (mode: string | null | undefined) =>
  MATCH_MODES.find((m) => m.value === mode) ?? MATCH_MODES[2];
export const modeHint = (mode: string | null | undefined) => modeOf(mode).hint;

export const MATCH_FIELDS = [
  { value: "creditor_name", label: "Name", phrase: "Name" },
  { value: "remittance_info", label: "Description", phrase: "Description" },
  { value: "any", label: "Either", phrase: "Name or description" },
] as const;
export type MatchField = (typeof MATCH_FIELDS)[number]["value"];
const fieldPhrase = (field: string) => MATCH_FIELDS.find((f) => f.value === field)?.phrase ?? field;

// The rule's wording, whole phrases only, so a translation can reorder them: "Name has the
// word" + quoteText("Netflix"). Rules saved before match modes existed match anywhere.
export const ruleCondition = (field: string, mode: string | null | undefined) =>
  `${fieldPhrase(field)} ${modeOf(mode).phrase}`;
export const quoteText = (text: string) => `“${text}”`;

// The apply-to-past preview's headline; the examples list follows it.
export const previewLine = (changes: number, shown: number) =>
  `${plural(changes)} would change${shown < changes ? ", for example:" : ":"}`;

// The database caps rule text at this many characters (category_rules_match_text_length).
export const MAX_MATCH_TEXT = 200;

// Short text matched anywhere hits unrelated names ("bar" in "Barclays").
const SHORT_MATCH_TEXT = 4;
export const LOOSE_MATCH_HINT =
  "Short text also matches inside other words (“bar” is in “Barclays”). Whole word avoids that.";
export const isLooseMatch = (text: string, mode: string) =>
  mode === "contains" && text.trim().length > 0 && text.trim().length < SHORT_MATCH_TEXT;

// Same matching as the sync (rules.js / _shared/rules.ts), for rules run in the browser.
// Callers fold case and accents first. 'word': the text on its own, a boundary checked only on
// a letter or digit edge; 'exact': the whole field; both ignore outer spaces. Anything else
// (older rules) matches anywhere, text as typed.
const WORD_CHAR = "[\\p{L}\\p{N}\\p{M}]";
const isWordChar = (c: string | undefined) => c !== undefined && new RegExp(WORD_CHAR, "u").test(c);
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function textMatches(field: string, text: string, mode: string | null | undefined): boolean {
  if (!text.trim()) return false;
  if (mode === "exact") return field.trim() === text.trim();
  if (mode !== "word") return field.includes(text);
  const t = text.trim();
  const chars = [...t];
  const before = isWordChar(chars[0]) ? `(?<!${WORD_CHAR})` : "";
  const after = isWordChar(chars[chars.length - 1]) ? `(?!${WORD_CHAR})` : "";
  return new RegExp(before + escapeRegExp(t) + after, "u").test(field);
}

// "Make a rule" on the toast after a category change: opens Rules with the form filled in, so
// the next transactions from this name get the same category.
export function makeRuleAction(
  name: string | null | undefined,
  category: string | null,
  navigate: (opts: { to: "/rules"; search: { text: string; category: string } }) => unknown,
) {
  const text = name?.trim();
  if (!text || !category) return undefined;
  return {
    label: "Make a rule",
    onClick: () => void navigate({ to: "/rules", search: { text, category } }),
  };
}
