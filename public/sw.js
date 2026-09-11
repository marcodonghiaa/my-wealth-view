self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Finance Dashboard", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

// Only ever open a same-origin relative path -- a push payload is only as
// trustworthy as whatever server-side code builds it, and this service
// worker has no way to verify that at delivery time.
function safeNotificationUrl(rawUrl) {
  try {
    const resolved = new URL(rawUrl, self.location.origin);
    return resolved.origin === self.location.origin ? resolved.pathname + resolved.search : "/";
  } catch {
    return "/";
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeNotificationUrl(event.notification.data?.url || "/");
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
