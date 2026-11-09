import { CATEGORIES } from "@/lib/categories";
import type { ClassifiedRow } from "@/lib/import/splitwise-classify";
import { ruleTextFor } from "@/lib/import/splitwise-categorize";
import { money, shortDate } from "@/lib/import/splitwise-format";

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
    <ul className="divide-y divide-border">
      {ordered.map((r) => {
        const category = categoryOf.get(r.row) ?? null;
        const changed = picked.get(r.row);
        return (
          <li key={r.row} className="px-4 py-2.5">
            <div className="flex min-h-11 items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-medium">
                  {r.description.trim()}
                </span>
                <span className="block text-[0.8125rem] text-muted-foreground">
                  {shortDate(r.date)} · {r.kind === "paid_by_me" ? "paid by you" : "paid by others"}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-figure text-[0.9375rem]">
                  {money(r.shareCents ?? 0, r.currency)}
                </span>
                <select
                  aria-label={`Category for ${r.description.trim()}`}
                  value={category ?? ""}
                  onChange={(e) => onPick(r.row, e.target.value === "" ? null : e.target.value)}
                  className={`max-w-40 cursor-pointer appearance-none truncate rounded-full px-2.5 py-0.5 text-center text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                    category === null
                      ? "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/50 dark:text-amber-300"
                      : "bg-foreground/[0.07] text-muted-foreground"
                  }`}
                >
                  <option value="">Choose category</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </span>
            </div>
            {changed && !remembered.has(r.row) && (
              <button
                type="button"
                disabled={saving}
                onClick={() => onRemember(r, changed)}
                className="mt-1 min-h-8 text-xs font-medium text-primary disabled:opacity-50"
              >
                Remember "{ruleTextFor(r.description)}" as {changed}
              </button>
            )}
            {remembered.has(r.row) && (
              <span className="mt-1 block text-xs text-muted-foreground">Rule saved</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
