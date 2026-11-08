/** Pending-count pill on a nav item; hidden at 0. */
export function NavBadge({ count }: { count: number | undefined }) {
  if (!count) return null;
  return (
    <span className="ml-auto min-w-5 rounded-full bg-primary px-1.5 text-center text-xs font-medium text-primary-foreground">
      {count}
      <span className="sr-only"> to review</span>
    </span>
  );
}
