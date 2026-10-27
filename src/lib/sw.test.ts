import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://app.test";
const source = readFileSync("public/sw.js", "utf8");

// Runs the service worker against a fake `self`, clicks a notification carrying `url`, and returns
// the address the worker asked the browser to open.
async function clickedWith(url: string, windows: unknown[] = []): Promise<string | undefined> {
  const handlers: Record<string, (event: unknown) => void> = {};
  const openWindow = vi.fn();
  const fakeSelf = {
    location: { origin: ORIGIN },
    registration: { showNotification: vi.fn() },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      handlers[type] = fn;
    },
    clients: { matchAll: () => Promise.resolve(windows), openWindow },
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

  // protects=tapping a push while the app is already open lands on the tapped page;
  // fails_when=the open window is only focused, not navigated
  it("navigates an already-open window instead of just focusing it", async () => {
    const focus = vi.fn(() => Promise.resolve());
    const navigate = vi.fn((to: string) => Promise.resolve({ url: to, focus }));
    const win = { url: `${ORIGIN}/net-worth`, focus: vi.fn(), navigate };
    const opened = await clickedWith("/transactions?highlight=a", [win]);
    expect(navigate).toHaveBeenCalledWith(`${ORIGIN}/transactions?highlight=a`);
    expect(focus).toHaveBeenCalled();
    expect(opened).toBeUndefined();
  });

  it("just focuses a window already on the tapped page", async () => {
    const win = { url: `${ORIGIN}/transactions?highlight=a`, focus: vi.fn(), navigate: vi.fn() };
    await clickedWith("/transactions?highlight=a", [win]);
    expect(win.focus).toHaveBeenCalled();
    expect(win.navigate).not.toHaveBeenCalled();
  });

  it("opens a new window when navigating the open one fails", async () => {
    const win = {
      url: `${ORIGIN}/net-worth`,
      focus: vi.fn(),
      navigate: vi.fn(() => Promise.reject(new TypeError("not controlled"))),
    };
    const opened = await clickedWith("/transactions?highlight=a", [win]);
    expect(opened).toBe(`${ORIGIN}/transactions?highlight=a`);
  });

  it("opens a new window when the open one has no navigate()", async () => {
    const win = { url: `${ORIGIN}/net-worth`, focus: vi.fn() };
    const opened = await clickedWith("/transactions?highlight=a", [win]);
    expect(opened).toBe(`${ORIGIN}/transactions?highlight=a`);
  });

  it("does not open a second window when focusing after navigate fails", async () => {
    const focus = vi.fn(() => Promise.reject(new Error("no focus")));
    const win = {
      url: `${ORIGIN}/net-worth`,
      focus,
      navigate: vi.fn((to: string) => Promise.resolve({ url: to, focus })),
    };
    const opened = await clickedWith("/transactions?highlight=a", [win]);
    expect(focus).toHaveBeenCalled();
    expect(opened).toBeUndefined();
  });
});
