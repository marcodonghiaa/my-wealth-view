import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CATEGORIES, TRANSACTION_TYPES, categoryColor } from "@/lib/categories";
import type { TransactionRow } from "@/lib/transactions";
import { CategoryAvatar } from "@/components/category-avatar";

export function CategoryPicker({
  tx,
  onSelect,
  saving,
  variant = "pill",
}: {
  tx: TransactionRow;
  onSelect: (category: string) => void;
  saving: boolean;
  // "icon": the row's round category icon is the trigger (desktop table rows).
  variant?: "pill" | "icon";
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Change category for ${tx.creditor_name ?? "transaction"}`}
          disabled={saving}
          className="-m-2 inline-flex min-h-11 cursor-pointer items-center p-2 disabled:opacity-60"
        >
          {variant === "icon" ? (
            <span className="rounded-full transition-opacity hover:opacity-80">
              <CategoryAvatar category={tx.category} />
            </span>
          ) : tx.category ? (
            <span
              className="inline-flex min-w-24 items-center justify-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors"
              style={{
                backgroundColor: `color-mix(in srgb, ${categoryColor(tx.category)} 16%, transparent)`,
                borderColor: `color-mix(in srgb, ${categoryColor(tx.category)} 45%, transparent)`,
              }}
            >
              <span
                aria-hidden
                className="inline-block size-1.5 rounded-full"
                style={{ backgroundColor: categoryColor(tx.category) }}
              />
              {tx.category}
            </span>
          ) : (
            <span className="inline-flex min-w-24 justify-center rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent">
              Uncategorized
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        <div className="max-h-72 overflow-y-auto">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setOpen(false);
                if (c !== tx.category) onSelect(c);
              }}
              className={`block min-h-11 w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                c === tx.category ? "font-medium text-primary" : "text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function BulkCategoryPicker({
  onSelect,
  disabled,
}: {
  onSelect: (category: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-9 items-center rounded-full border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
        >
          {disabled ? "Saving…" : "Set category…"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        <div className="max-h-72 overflow-y-auto">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setOpen(false);
                onSelect(c);
              }}
              className="block min-h-11 w-full rounded-md px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent"
            >
              {c}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TypePicker({
  tx,
  onSelect,
  saving,
}: {
  tx: TransactionRow;
  onSelect: (type: string) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Change type for ${tx.creditor_name ?? "transaction"}`}
          disabled={saving}
          className="-m-2 inline-flex min-h-11 cursor-pointer items-center p-2 disabled:opacity-60"
        >
          {tx.transaction_type ? (
            <span className="inline-flex min-w-24 justify-center rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent">
              {tx.transaction_type}
            </span>
          ) : (
            <span className="inline-flex min-w-24 justify-center rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent">
              —
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        <div className="max-h-72 overflow-y-auto">
          {TRANSACTION_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setOpen(false);
                if (t !== tx.transaction_type) onSelect(t);
              }}
              className={`block min-h-11 w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                t === tx.transaction_type ? "font-medium text-primary" : "text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
