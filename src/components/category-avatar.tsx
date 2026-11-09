import { categoryCode } from "@/lib/categories";

/** Two-letter category code in a hairline square, so rows scan by what the money went on. */
export function CategoryAvatar({ category }: { category: string | null }) {
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-md border border-hairline bg-card font-figure text-[11px] text-foreground"
    >
      {categoryCode(category)}
    </span>
  );
}
