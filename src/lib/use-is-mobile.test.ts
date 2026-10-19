import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIsMobile } from "./use-is-mobile";

type Listener = () => void;

function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<Listener>();
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return matches;
    },
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  }));
  return {
    set(next: boolean) {
      matches = next;
      listeners.forEach((l) => l());
    },
    listenerCount: () => listeners.size,
  };
}

describe("useIsMobile", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("returns true when the viewport is below the md breakpoint", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("updates when the viewport crosses the breakpoint", () => {
    const mql = stubMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => mql.set(true));
    expect(result.current).toBe(true);
  });

  it("removes its listener on unmount", () => {
    const mql = stubMatchMedia(false);
    const { unmount } = renderHook(() => useIsMobile());
    expect(mql.listenerCount()).toBe(1);
    unmount();
    expect(mql.listenerCount()).toBe(0);
  });
});
