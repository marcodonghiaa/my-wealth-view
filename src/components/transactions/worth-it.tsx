import { Button } from "@/components/ui/button";
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
        className="min-h-11 rounded-sm px-2 py-1 font-medium text-foreground transition-colors hover:bg-accent"
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => onAnswer("no")}
        className="min-h-11 rounded-sm px-2 py-1 font-medium text-foreground transition-colors hover:bg-accent"
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
          <p className="font-figure py-4 text-4xl text-foreground">
            {formatMoney(Math.abs(tx.amount ?? 0), tx.currency ?? "EUR")}
          </p>
          <div className="flex gap-3">
            <Button
              variant="quiet"
              onClick={() => {
                onAnswer(tx, "no");
                onClose();
              }}
              className="flex-1 bg-muted"
            >
              No
            </Button>
            <Button
              onClick={() => {
                onAnswer(tx, "yes");
                onClose();
              }}
              className="flex-1"
            >
              Yes
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
