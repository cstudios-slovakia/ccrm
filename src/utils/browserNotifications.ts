// Web Push / Browser Notification Utility for CCRM

/**
 * Request notification permission from the browser.
 */
export const requestBrowserNotificationPermission = async (): Promise<boolean> => {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }
  if (Notification.permission === "granted") {
    return true;
  }
  if (Notification.permission !== "denied") {
    try {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    } catch {
      return false;
    }
  }
  return false;
};

/**
 * Trigger a browser desktop / push notification if permitted.
 */
export const sendBrowserNotification = (
  title: string,
  options?: NotificationOptions & { onClickUrl?: string }
): boolean => {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }

  if (Notification.permission !== "granted") {
    // Attempt to request permission if not explicitly denied
    if (Notification.permission === "default") {
      requestBrowserNotificationPermission().then((granted) => {
        if (granted) {
          sendBrowserNotification(title, options);
        }
      });
    }
    return false;
  }

  try {
    const notif = new Notification(title, {
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      ...options,
    });

    if (options?.onClickUrl) {
      notif.onclick = (e) => {
        e.preventDefault();
        window.focus();
        if (options.onClickUrl) {
          window.location.hash = options.onClickUrl;
        }
        notif.close();
      };
    }

    return true;
  } catch (err) {
    console.warn("Browser notification failed to display", err);
    return false;
  }
};
