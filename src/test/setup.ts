import "@testing-library/jest-dom/vitest";

// jsdom has no matchMedia; default to "no match" (desktop). Tests can stub their own.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
}
