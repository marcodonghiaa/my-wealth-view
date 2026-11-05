import { EditHolding, type HoldingTarget } from "./edit-holding";

// Holdings marked sold (quantity 0) are hidden from the main list, but kept here: set a quantity
// to hold them again, or delete one entered by mistake. Adding it again would be refused.
export function SoldHoldings({
  items,
}: {
  items: Array<{ key: string; name: string; target: HoldingTarget }>;
}) {
  if (items.length === 0) return null;
  return (
    <details className="group mt-6">
      <summary className="ios-section-title flex min-h-11 cursor-pointer list-none items-center gap-2">
        Sold ({items.length})
      </summary>
      <ul className="divide-y overflow-hidden rounded-2xl bg-card">
        {items.map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-3 px-4 py-1">
            <span className="min-w-0 truncate text-sm text-muted-foreground">{item.name}</span>
            <EditHolding target={item.target} name={item.name} quantity={0} />
          </li>
        ))}
      </ul>
    </details>
  );
}
