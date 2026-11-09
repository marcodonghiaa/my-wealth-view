import { Undo2 } from "lucide-react";

/** Marks a charge and the refund that reversed it; both stop counting as spend/income. */
export function RefundedBadge({ flowType }: { flowType: string | null }) {
  if (flowType !== "refunded") return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-rule px-1.5 py-0.5 font-figure text-[11px] uppercase tracking-wide text-muted-foreground">
      <Undo2 className="size-3" aria-hidden />
      Refunded
    </span>
  );
}
