/** Pending count on a nav item, in mono Ember digits; hidden at 0. */
export function NavBadge({ count }: { count: number | undefined }) {
  if (!count) return null;
  return (
    <span className="ml-auto font-figure text-xs text-ember">
      {count}
      <span className="sr-only"> to review</span>
    </span>
  );
}
