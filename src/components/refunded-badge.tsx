import { Undo2 } from "lucide-react";

/** Marks a charge and the refund that reversed it; both stop counting as spend/income. */
export function RefundedBadge({ flowType }: { flowType: string | null }) {
  if (flowType !== "refunded") return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Undo2 className="size-3" aria-hidden />
      Refunded
    </span>
  );
}
