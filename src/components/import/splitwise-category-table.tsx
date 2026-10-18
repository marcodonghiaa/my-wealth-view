import { CATEGORIES } from "@/lib/categories";
import type { ClassifiedRow } from "@/lib/import/splitwise-classify";
import { ruleTextFor } from "@/lib/import/splitwise-categorize";

interface Props {
  rows: Array<ClassifiedRow>;
  /** The category each row will get; null when nothing recognised it. */
  categoryOf: Map<number, string | null>;
  /** Rows the user changed by hand. */
  picked: Map<number, string | null>;
  remembered: Set<number>;
  onPick: (row: number, category: string | null) => void;
  onRemember: (row: ClassifiedRow, category: string) => void;
  saving: boolean;
}

const money = (cents: number) => (cents / 100).toFixed(2);

/** One row per expense with its category: the unknown ones first, so they are not missed. */
export function CategoryTable({
  rows,
  categoryOf,
  picked,
  remembered,
  onPick,
  onRemember,
  saving,
}: Props) {
  const ordered = [...rows].sort(
    (a, b) =>
      Number(categoryOf.get(a.row) !== null) - Number(categoryOf.get(b.row) !== null) ||
      a.date.localeCompare(b.date),
  );

  return (
    <ul className="max-h-96 space-y-2 overflow-y-auto">
      {ordered.map((r) => {
        const category = categoryOf.get(r.row) ?? null;
        const changed = picked.get(r.row);
        return (
          <li key={r.row} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="w-14 shrink-0 text-muted-foreground">{r.date.slice(5)}</span>
            <span className="min-w-0 flex-1 truncate">{r.description.trim()}</span>
            <span className="font-figure shrink-0">
              {money(r.shareCents ?? 0)} {r.currency}
            </span>
            <select
              aria-label={`Category for ${r.description.trim()}`}
              value={category ?? ""}
              onChange={(e) => onPick(r.row, e.target.value === "" ? null : e.target.value)}
              className={`rounded-lg border bg-background px-2 py-1 text-base focus:ring-2 focus:ring-ring focus:outline-none ${category === null ? "border-amber-500" : ""}`}
            >
              <option value="">Choose…</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {changed && !remembered.has(r.row) && (
              <button
                type="button"
                disabled={saving}
                onClick={() => onRemember(r, changed)}
                className="text-xs text-primary underline disabled:opacity-50"
              >
                Remember "{ruleTextFor(r.description)}" as {changed}
              </button>
            )}
            {remembered.has(r.row) && (
              <span className="text-xs text-muted-foreground">Rule saved</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
