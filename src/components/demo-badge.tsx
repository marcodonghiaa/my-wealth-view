import { isDemoMode } from "@/lib/demo/mode";
import { cn } from "@/lib/utils";

// Always visible while exploring the demo: nothing here is real and nothing is saved.
// It sits inline (mobile top bar, desktop sidebar header) so it never covers page figures.
export function DemoBadge({ className }: { className?: string }) {
  if (!isDemoMode()) return null;
  return (
    <div
      role="status"
      className={cn(
        "rounded-md border border-rule bg-card px-2 py-1 font-figure text-[11px] uppercase tracking-wide text-foreground",
        className,
      )}
    >
      {/* On a phone the top bar has room for "Demo" only; screen readers still hear it all. */}
      Demo<span className="max-md:sr-only">, fake data</span>
    </div>
  );
}
