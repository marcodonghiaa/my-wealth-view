self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "MyFinances", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

// Only ever open a same-origin address -- a push payload is only as
// trustworthy as whatever server-side code builds it, and this service
// worker has no way to verify that at delivery time.
function safeNotificationUrl(rawUrl) {
  try {
    const resolved = new URL(rawUrl, self.location.origin);
    return resolved.origin === self.location.origin ? resolved.href : "/";
  } catch {
    return "/";
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeNotificationUrl(event.notification.data?.url || "/");
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const already = clients.find((c) => c.url === url);
      if (already) return already.focus();
      // The app is open on another page (common for an installed iOS app):
      // send that window to the tapped page instead of just showing it.
      const client = clients[0];
      if (client) {
        // Inside .then so a missing navigate() also lands in the openWindow fallback;
        // a focus() failure after navigating must not open a second window.
        return Promise.resolve()
          .then(() => client.navigate(url))
          .then((c) => (c ?? client).focus().catch(() => {}))
          .catch(() => self.clients.openWindow(url));
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
