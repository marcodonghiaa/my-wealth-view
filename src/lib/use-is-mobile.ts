import { useSyncExternalStore } from "react";

// Tailwind's `md` breakpoint: below it the app shows the mobile layout.
const MOBILE_QUERY = "(max-width: 767px)";

/** True while the media query matches; false on the server. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** For props that Tailwind classes can't reach, e.g. recharts' numeric axis widths. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
