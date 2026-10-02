/**
 * CCRM Service Worker (PWA Mobile & Desktop Web Push).
 *
 * Handles background push notifications when the app is installed as a PWA or closed.
 * Network-only strategy for fetch to prevent stale cache issues during updates.
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});


// Web Push event listener (RFC 8291/8292 payloads from Apple APNs / Google FCM)
self.addEventListener("push", (event) => {
  let payload = {
    title: "CCRM",
    body: "You have an update in CCRM.",
    icon: "/icon_192.png",
    badge: "/favicon.svg",
    url: "/#tasks",
    tag: "ccrm-notification",
    data: {}
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = Object.assign({}, payload, parsed);
    } catch (e) {
      payload.body = event.data.text() || payload.body;
    }
  }

  const notificationOptions = {
    body: payload.body,
    icon: payload.icon || "/icon_192.png",
    badge: payload.badge || "/favicon.svg",
    tag: payload.tag || "ccrm-" + Date.now(),
    vibrate: [200, 100, 200],
    renotify: true,
    data: Object.assign({ url: payload.url || "/#tasks" }, payload.data || {})
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, notificationOptions)
  );
});

// Open or focus CRM when user taps the notification
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : "/#tasks";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // If a CRM window is already open, focus it
      for (let client of windowClients) {
        if ("focus" in client) {
          if (client.url && client.url.includes(self.registration.scope)) {
            client.focus();
            if ("navigate" in client) {
              client.navigate(targetUrl);
            }
            return;
          }
        }
      }
      // If no window is open, open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
