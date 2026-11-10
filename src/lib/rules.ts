// Category rules: how a rule's text matches, and the "Make a rule" shortcut.

// "word" is the default: "bar" then matches "Bar Roma" but not "Barclays".
export const MATCH_MODES = [
  { value: "word", label: "has the word" },
  { value: "exact", label: "is exactly" },
  { value: "contains", label: "contains" },
];
export const modeLabel = (mode: string | null | undefined) =>
  MATCH_MODES.find((m) => m.value === mode)?.label ?? "contains";

// Short text matched anywhere hits unrelated names ("bar" in "Barclays").
export const SHORT_MATCH_TEXT = 4;
export const isLooseMatch = (text: string, mode: string) =>
  mode === "contains" && text.trim().length > 0 && text.trim().length < SHORT_MATCH_TEXT;

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
