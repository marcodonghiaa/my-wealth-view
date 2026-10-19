import { useSyncExternalStore } from "react";

// Tailwind's `md` breakpoint: below it the app shows the mobile layout.
const MOBILE_QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** For props that Tailwind classes can't reach, e.g. recharts' numeric axis widths. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}
