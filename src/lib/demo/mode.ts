// Demo mode lasts for the browser tab (sessionStorage). The sign-in page and the sign-out button
// both end it, so real data and demo data never mix in one visit.
const KEY = "mwv-demo";
let inMemory = false;
// The fake client lives in its own chunk, loaded only for the demo; it registers its reset here
// so leaving the demo starts the next visit from scratch without this file importing it.
let resetDemo: (() => void) | null = null;
export function onDemoExit(reset: () => void): void {
  resetDemo = reset;
}

export function isDemoMode(): boolean {
  if (inMemory) return true;
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function enterDemoMode(): void {
  inMemory = true;
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    // Storage blocked: the in-memory flag still covers this page load.
  }
}

export function exitDemoMode(): void {
  inMemory = false;
  resetDemo?.();
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
