// A tapped push sends the open app a { type: "navigate", url } message (public/sw.js).
// Returns the in-app path to go to, or null for anything else or another origin.
export function notificationPath(data: unknown, origin: string): string | null {
  if (!data || typeof data !== "object") return null;
  const { type, url } = data as { type?: unknown; url?: unknown };
  if (type !== "navigate" || typeof url !== "string") return null;
  try {
    const u = new URL(url, origin);
    return u.origin === origin ? u.pathname + u.search + u.hash : null;
  } catch {
    return null;
  }
}

// Subscribes to those messages; returns the unsubscribe function.
export function listenForNotificationNav(go: (path: string) => void): () => void {
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
  if (!sw) return () => {};
  const onMessage = (e: MessageEvent) => {
    const path = notificationPath(e.data, window.location.origin);
    if (path) go(path);
  };
  sw.addEventListener("message", onMessage);
  return () => sw.removeEventListener("message", onMessage);
}
