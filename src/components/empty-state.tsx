import type { ReactNode } from "react";

// Outline fox: the BrandMark silhouette, stroke only. Rule: never beside an amount or inside a
// chart; at most one fox per viewport.
const FOX_PATH =
  "M23.0 8.3 C22.7 9.0 22.1 9.9 22.0 11.6 C21.9 13.3 22.7 16.2 22.5 18.6 C22.3 21.1 22.6 23.2 20.6 26.3 C18.6 29.4 12.7 34.6 10.7 37.2 C8.7 39.9 8.8 40.4 8.4 42.2 C8.0 44.0 8.0 46.3 8.3 47.8 C8.6 49.3 8.7 50.1 10.2 51.4 C11.7 52.7 14.1 54.5 17.2 55.5 C20.2 56.5 25.6 57.4 28.5 57.6 C31.4 57.8 32.7 57.4 34.9 56.8 C37.1 56.1 39.0 55.4 41.5 53.7 C44.0 52.0 47.8 48.0 50.0 46.7 C52.2 45.4 53.9 46.0 54.8 45.7 C55.6 45.4 55.6 45.6 55.1 44.8 C54.6 43.9 52.9 41.7 51.7 40.6 C50.5 39.5 49.2 38.9 47.7 38.4 C46.2 37.9 44.8 37.5 42.7 37.4 C40.6 37.3 34.9 37.9 34.9 37.9 C34.9 37.9 36.0 34.3 36.1 32.0 C36.2 29.7 34.5 26.2 35.5 23.9 C36.5 21.6 40.9 19.7 42.2 18.4 C43.5 17.1 43.2 16.1 43.2 16.1 C43.2 16.1 38.8 15.2 37.3 14.6 C35.8 13.9 35.1 13.3 34.2 12.2 C33.3 11.1 31.7 8.1 31.7 8.1 C31.7 8.1 30.1 10.3 28.8 10.2 C27.5 10.1 23.6 7.5 23.6 7.5 C23.6 7.5 23.3 7.6 23.0 8.3ZM30.4 16.8a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0Z";

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
