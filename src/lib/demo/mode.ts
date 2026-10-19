import { resetDemoClient } from "./fake-client";

// Demo mode lasts for the browser tab (sessionStorage). The sign-in page and the sign-out button
// both end it, so real data and demo data never mix in one visit.
const KEY = "mwv-demo";
let inMemory = false;

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
  resetDemoClient();
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
