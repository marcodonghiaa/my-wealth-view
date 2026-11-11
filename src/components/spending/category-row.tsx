import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { CategoryAvatar } from "@/components/category-avatar";
import { UNCATEGORIZED_LABEL } from "@/lib/spending";
import { UNCATEGORIZED, formatEur, monthParam } from "@/lib/transactions";

// One category of the month: what, how much, its share; opens Activity on that category and month.
export function CategoryRow({
  category,
  total,
  share,
  month,
}: {
  category: string;
  total: number;
  /** The category's share of the month, e.g. "58%". */
  share: string;
  month: Date;
}) {
  const isNone = category === UNCATEGORIZED_LABEL;
  return (
    <li>
      <Link
        to="/transactions"
        search={{ category: isNone ? UNCATEGORIZED : category, month: monthParam(month) }}
        className="flex min-h-11 items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-5"
      >
        <CategoryAvatar category={isNone ? null : category} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">{category}</span>
          <span className="block font-figure text-xs text-muted-foreground">{share}</span>
        </span>
        <span className="font-figure shrink-0 text-foreground">{formatEur(total)}</span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}
