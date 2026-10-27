import { ThumbsDown, ThumbsUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatMoney, isWorthItEligible, type TransactionRow } from "@/lib/transactions";

export function WorthItPrompt({
  tx,
  onAnswer,
}: {
  tx: TransactionRow;
  onAnswer: (worthIt: "yes" | "no") => void;
}) {
  if (tx.worth_it) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        {tx.worth_it === "yes" ? (
          <ThumbsUp className="size-3" />
        ) : (
          <ThumbsDown className="size-3" />
        )}
        {tx.worth_it === "yes" ? "Worth it" : "Not worth it"}
      </span>
    );
  }
  if (!isWorthItEligible(tx)) return null;
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      Worth it?
      <button
        type="button"
        onClick={() => onAnswer("yes")}
        className="min-h-11 rounded-md px-2 py-1 font-medium text-positive transition-colors hover:bg-positive/10"
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => onAnswer("no")}
        className="min-h-11 rounded-md px-2 py-1 font-medium text-negative transition-colors hover:bg-negative/10"
      >
        No
      </button>
    </span>
  );
}

export function WorthItSpotlight({
  tx,
  onAnswer,
  onClose,
}: {
  tx: TransactionRow | null;
  onAnswer: (tx: TransactionRow, worthIt: "yes" | "no") => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={tx != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {tx && (
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-center text-xl">Worth it?</DialogTitle>
            <DialogDescription className="text-center">
              {tx.creditor_name ?? "A purchase"} · {tx.category}
            </DialogDescription>
          </DialogHeader>
          <p className="font-figure py-4 text-4xl font-semibold text-foreground">
            {formatMoney(Math.abs(tx.amount ?? 0), tx.currency ?? "EUR")}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                onAnswer(tx, "no");
                onClose();
              }}
              className="min-h-11 flex-1 rounded-full bg-negative/10 text-sm font-semibold text-negative transition-colors hover:bg-negative/20"
            >
              No
            </button>
            <button
              type="button"
              onClick={() => {
                onAnswer(tx, "yes");
                onClose();
              }}
              className="min-h-11 flex-1 rounded-full border border-positive/30 bg-positive/10 text-sm font-semibold text-positive transition-colors hover:bg-positive/20"
            >
              Yes
            </button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
