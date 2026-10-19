import { isDemoMode } from "@/lib/demo/mode";

// Always visible while exploring the demo: nothing here is real and nothing is saved.
export function DemoBadge() {
  if (!isDemoMode()) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed top-[calc(0.6rem+env(safe-area-inset-top))] right-3 z-50 md:top-auto md:bottom-4 rounded-full border border-primary/30 bg-card/90 px-3 py-1 text-xs font-medium text-primary shadow-sm backdrop-blur"
    >
      Demo, fake data
    </div>
  );
}
