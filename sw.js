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


// Pass-through fetch handler. It never calls respondWith(), so every request goes
// straight to the network exactly as before: nothing is cached, nothing can go
// stale. It exists because Chrome only fires `beforeinstallprompt` (the in-app
// "Install" button) for a service worker that has a fetch handler; the browser
// menu entry works without one, the button does not.
self.addEventListener("fetch", () => {});

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

  // TT2 D8.4: the server sends a silent "cleared" push when the presence question was
  // answered elsewhere or the cycle ended. Close the open notification and tell the open
  // pages; show nothing. Limitation: browsers that insist on a visible notification per
  // push (Safari/iOS web push) may show their generic fallback; a SW cannot prevent that.
  if (payload.data && payload.data.kind === "tt-presence-cleared") {
    event.waitUntil(
      self.registration.getNotifications({ tag: "tt-presence" }).then((open) => {
        open.forEach((n) => n.close());
        return clients.matchAll({ type: "window", includeUncontrolled: true });
      }).then((windowClients) => {
        windowClients.forEach((c) => c.postMessage({ type: "tt-presence-cleared" }));
      })
    );
    return;
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

  // The notification payload is data, not code: only a URL on this origin may be
  // opened. Anything else (an absolute URL to another site, javascript:, data:) falls
  // back to the tasks view instead of sending the user — or the focused CRM window —
  // somewhere an attacker chose.
  // A presence notification only opens the app at the time-tracking view (D8.4/C9): the
  // question is answered in the app, never from the notification.
  const isPresence = !!(event.notification.data && event.notification.data.kind === "tt-presence");
  let targetUrl = isPresence ? "/#time-tracking" : "/#tasks";
  try {
    const requested = isPresence ? "/#time-tracking" : event.notification.data && event.notification.data.url;
    if (requested) {
      const parsed = new URL(requested, self.location.origin);
      if (parsed.origin === self.location.origin) {
        targetUrl = parsed.href;
      }
    }
  } catch (_) {
    // malformed URL: keep the default
  }

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
