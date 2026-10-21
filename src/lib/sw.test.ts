import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://app.test";
const source = readFileSync("public/sw.js", "utf8");

// Runs the service worker against a fake `self`, clicks a notification carrying `url`, and returns
// the address the worker asked the browser to open.
async function clickedWith(url: string): Promise<string | undefined> {
  const handlers: Record<string, (event: unknown) => void> = {};
  const openWindow = vi.fn();
  const fakeSelf = {
    location: { origin: ORIGIN },
    registration: { showNotification: vi.fn() },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      handlers[type] = fn;
    },
    clients: { matchAll: () => Promise.resolve([]), openWindow },
  };
  new Function("self", source)(fakeSelf);

  let pending: Promise<unknown> = Promise.resolve();
  handlers["notificationclick"]!({
    notification: { close: vi.fn(), data: { url } },
    waitUntil: (p: Promise<unknown>) => {
      pending = p;
    },
  });
  await pending;
  return openWindow.mock.calls[0]?.[0] as string | undefined;
}

describe("service worker notification click", () => {
  it("opens a normal same-origin path", async () => {
    const opened = await clickedWith("/transactions?highlight=a");
    expect(new URL(opened!, ORIGIN).href).toBe(`${ORIGIN}/transactions?highlight=a`);
  });

  // protects=a push payload can never send the user to another site;
  // fails_when=the checked path is handed back to the browser as a protocol-relative address
  it.each([
    "/.//evil.com/x",
    "//evil.com",
    "https://evil.com",
    "/\\evil.com",
    "javascript:alert(1)",
  ])("never leaves the app for %s", async (url) => {
    const opened = await clickedWith(url);
    // The browser resolves what we hand it against the page, so do the same here.
    expect(new URL(opened!, ORIGIN).origin).toBe(ORIGIN);
  });
});
