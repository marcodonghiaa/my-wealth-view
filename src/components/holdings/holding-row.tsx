import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A holding on a phone: name and amount left, value and return right. Tapping the row opens its
 * details (price, return's trades, edit) under it. One row instead of a labelled five-field card.
 */
export function HoldingRow({
  avatar,
  name,
  title,
  amount,
  value,
  returnText,
  children,
}: {
  avatar?: ReactNode;
  name: string;
  /** The full name, when `name` is shortened. */
  title?: string | undefined;
  amount: ReactNode;
  value: string;
  returnText: ReactNode;
  /** The details shown when the row is open: DetailRow lines. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
      >
        {avatar}
        <span className="min-w-0 flex-1">
          <span
            className="line-clamp-2 text-[0.9375rem] font-medium break-words text-foreground"
            title={title}
          >
            {name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{amount}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-figure text-[0.9375rem] text-foreground">{value}</span>
          <span className="block text-sm">{returnText}</span>
        </span>
        <ChevronDown
          aria-hidden
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <dl id={id} className="mx-4 mb-2 divide-y divide-hairline border-t border-hairline text-sm">
          {children}
        </dl>
      )}
    </div>
  );
}

/** One label and value in an open HoldingRow, 44px tall so a value that is a button fits. */
export function DetailRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 text-right">{children}</dd>
    </div>
  );
}
