import { isDemoMode } from "@/lib/demo/mode";

// Always visible while exploring the demo: nothing here is real and nothing is saved.
export function DemoBadge() {
  if (!isDemoMode()) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed top-[calc(0.6rem+env(safe-area-inset-top))] right-3 z-50 md:top-auto md:bottom-4 rounded-md border border-rule bg-card px-2 py-1 font-figure text-[11px] uppercase tracking-wide text-foreground"
    >
      {/* Under 360px the full text runs into the centred "Alopex" title; screen readers still hear it. */}
      Demo<span className="max-[359px]:sr-only">, fake data</span>
    </div>
  );
}
