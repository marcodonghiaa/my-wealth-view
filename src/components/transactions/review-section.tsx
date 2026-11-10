import { formatMoney } from "@/lib/transactions";
import type { ReviewGroup } from "@/lib/transfer-review";
import type { ReviewChoice } from "./mutations";

const BUTTON =
  "h-9 shrink-0 rounded-full bg-muted px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50";

const countLabel = (direction: ReviewGroup["direction"]) =>
  direction === "mixed" ? "Not a transfer" : `Count as ${direction}`;

// Rows whose category and flow disagree (a "Transfer" counted as spend, an "Income" left out as a
// transfer), one line per merchant. The answer also becomes a rule for that merchant's future rows.
export function ReviewSection({
  groups,
  savingKey,
  onDecide,
}: {
  groups: Array<ReviewGroup>;
  savingKey: string | undefined;
  onDecide: (group: ReviewGroup, choice: ReviewChoice) => void;
}) {
  if (groups.length === 0) return null;
  return (
    <section className="mb-6 overflow-hidden rounded-2xl bg-card">
      <div className="px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-foreground">To review</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Category and counting disagree. Your answer applies to future ones too.
        </p>
      </div>
      <ul className="divide-y border-t">
        {groups.map((g) => (
          <li key={g.key} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">
                {g.name?.trim() || "No name"}
              </div>
              <div className="text-xs text-muted-foreground">
                {g.rows.length} transaction{g.rows.length === 1 ? "" : "s"} ·{" "}
                {g.totals.map((t) => formatMoney(t.amount, t.currency)).join(" + ")}
              </div>
            </div>
            <button
              type="button"
              disabled={savingKey === g.key}
              onClick={() => onDecide(g, "transfer")}
              className={BUTTON}
            >
              It's a transfer
            </button>
            <button
              type="button"
              disabled={savingKey === g.key}
              onClick={() => onDecide(g, "count")}
              className={BUTTON}
            >
              {countLabel(g.direction)}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
