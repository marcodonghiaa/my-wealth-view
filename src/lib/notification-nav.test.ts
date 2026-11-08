import { afterEach, describe, expect, it, vi } from "vitest";
import { listenForNotificationNav, notificationPath } from "./notification-nav";

const O = "https://app.test";

describe("notificationPath", () => {
  it("returns the in-app path for a navigate message", () => {
    expect(notificationPath({ type: "navigate", url: `${O}/transactions?highlight=a` }, O)).toBe(
      "/transactions?highlight=a",
    );
  });

  it.each([
    null,
    "x",
    { type: "other", url: `${O}/x` },
    { type: "navigate", url: 5 },
    { type: "navigate", url: "https://evil.com/x" },
    { type: "navigate", url: "http://[" },
  ])("ignores %j", (data) => {
    expect(notificationPath(data, O)).toBeNull();
  });
});

describe("listenForNotificationNav", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("routes on a navigate message and unsubscribes", () => {
    const target = new EventTarget();
    vi.stubGlobal("navigator", { serviceWorker: target });
    const go = vi.fn();
    const stop = listenForNotificationNav(go);
    const url = `${window.location.origin}/transactions`;
    target.dispatchEvent(new MessageEvent("message", { data: { type: "navigate", url } }));
    target.dispatchEvent(new MessageEvent("message", { data: { type: "other" } }));
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith("/transactions");
    stop();
    target.dispatchEvent(new MessageEvent("message", { data: { type: "navigate", url } }));
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("is a no-op without service workers", () => {
    vi.stubGlobal("navigator", {});
    expect(() => listenForNotificationNav(vi.fn())()).not.toThrow();
  });
});
