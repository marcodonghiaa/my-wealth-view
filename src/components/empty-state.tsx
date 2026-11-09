import type { ReactNode } from "react";

// Outline fox: the BrandMark path, stroke only. Rule: never beside an amount or inside a
// chart; at most one fox per viewport.
const FOX_PATH =
  "M9 7Q10 6 11 7L25 21H39L53 7Q54 6 55 7L56 30Q56 33 54 35L35 55Q32 58 29 55L10 35Q8 33 8 30ZM14 34Q22 33 27 40L32 47L37 40Q42 33 50 34L36 50Q32 54 28 50ZM20.5 29a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0ZM38.5 29a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0ZM29 46H35L32 50Z";

export function EmptyState({
  title,
  hint,
  action,
  className = "",
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center px-4 py-12 text-center text-muted-foreground ${className}`}
    >
      <svg viewBox="0 0 64 64" aria-hidden className="size-12" data-testid="empty-fox">
        <path fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" d={FOX_PATH} />
      </svg>
      <p className="mt-4 text-[0.9375rem] font-medium text-foreground">{title}</p>
      {hint && <p className="mt-1 text-sm">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
