// Web Push / Browser Notification Utility for CCRM (Desktop & PWA Mobile)

export type NotificationPermissionState = "granted" | "denied" | "default" | "unsupported";

export interface PushUserIdentity {
  name?: string;
  email?: string;
  id?: string;
}

/**
 * Converts a URL-safe Base64 string to a Uint8Array for applicationServerKey.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Returns current browser notification permission status.
 */
export const getBrowserNotificationPermission = (): NotificationPermissionState => {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission as NotificationPermissionState;
};

/**
 * Registers Web Push subscription via Service Worker PushManager and saves it in the CCRM backend.
 * Enables background mobile push notifications on installed PWAs (iOS 16.4+ and Android).
 */
export const registerWebPushSubscription = async (
  user?: PushUserIdentity | null
): Promise<boolean> => {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // 1. Fetch server VAPID public key
      const keyRes = await fetch("/api/push_subscription.php?action=vapid_public_key");
      if (!keyRes.ok) return false;
      const keyData = await keyRes.json();
      if (!keyData.success || !keyData.publicKey) {
        console.warn("[CCRM Push] Failed to retrieve VAPID public key", keyData);
        return false;
      }

      // 2. Subscribe via PushManager
      const convertedVapidKey = urlBase64ToUint8Array(keyData.publicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey as unknown as BufferSource,
      });
    }

    // 3. Resolve user identity for subscription attribution
    let targetName = user?.name;
    let targetEmail = user?.email;
    if (!targetName && !targetEmail) {
      try {
        const stored = sessionStorage.getItem("crm_current_user_rbac");
        if (stored) {
          const parsed = JSON.parse(stored);
          targetName = parsed.name;
          targetEmail = parsed.email;
        }
      } catch {}
    }

    // 4. Save subscription in backend
    const subJson = subscription.toJSON();
    const saveRes = await fetch("/api/push_subscription.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: subJson.keys,
        userName: targetName,
        userEmail: targetEmail,
      }),
    });

    const saveData = await saveRes.json();
    return !!saveData.success;
  } catch (err) {
    console.warn("[CCRM Push] Subscription registration failed:", err);
    return false;
  }
};

/**
 * Unregisters the Web Push subscription from both the browser and CCRM backend.
 */
export const unregisterWebPushSubscription = async (): Promise<boolean> => {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      try {
        await fetch("/api/push_subscription.php", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      } catch {}
      await subscription.unsubscribe();
    }
    return true;
  } catch (err) {
    console.warn("[CCRM Push] Unregister failed:", err);
    return false;
  }
};

/**
 * Sends a real backend Web Push test notification to verify delivery through APNs / FCM.
 */
export const sendTestPushNotification = async (
  user?: PushUserIdentity | null
): Promise<{ success: boolean; result?: any; error?: string }> => {
  try {
    let targetName = user?.name;
    let targetEmail = user?.email;
    if (!targetName && !targetEmail) {
      try {
        const stored = sessionStorage.getItem("crm_current_user_rbac");
        if (stored) {
          const parsed = JSON.parse(stored);
          targetName = parsed.name;
          targetEmail = parsed.email;
        }
      } catch {}
    }

    const res = await fetch("/api/push_subscription.php?action=test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userName: targetName,
        userEmail: targetEmail,
      }),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to trigger test push" };
  }
};

/**
 * Request notification permission from the browser and syncs Web Push subscription.
 * Must ideally be called in response to a user gesture (e.g. click).
 */
export const requestBrowserNotificationPermission = async (
  user?: PushUserIdentity | null
): Promise<boolean> => {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }
  if (Notification.permission === "granted") {
    registerWebPushSubscription(user).catch(() => {});
    return true;
  }
  if (Notification.permission !== "denied") {
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        registerWebPushSubscription(user).catch(() => {});
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
  return false;
};

/**
 * Plays a subtle, pleasant two-tone audio chime using the Web Audio API.
 * Synthesized purely in code — zero external audio assets required.
 */
export const playNotificationChime = (): void => {
  try {
    if (typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // First tone: D5 (587.33 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // Second tone: A5 (880 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.09);
    gain2.gain.setValueAtTime(0.15, now + 0.09);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.09);
    osc2.stop(now + 0.35);
  } catch (err) {
    // Autoplay restrictions or audio device issues shouldn't break the app
  }
};

/**
 * Trigger a browser desktop / mobile PWA notification if permitted.
 * Uses ServiceWorkerRegistration.showNotification when available (required for mobile iOS/Android PWA)
 * with graceful fallback to standard window.Notification.
 */
export const sendBrowserNotification = (
  title: string,
  options?: NotificationOptions & { onClickUrl?: string }
): boolean => {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }

  if (Notification.permission !== "granted") {
    return false;
  }

  const notificationOptions = {
    icon: "/icon_192.png",
    badge: "/favicon.svg",
    ...options,
    data: {
      url: options?.onClickUrl ? `/#${options.onClickUrl}` : "/#tasks",
    },
  };

  // If Service Worker is supported and ready, use showNotification (works on iOS & Android standalone PWAs!)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => {
        reg.showNotification(title, notificationOptions).catch(() => {
          fallbackWindowNotification(title, options);
        });
      })
      .catch(() => {
        fallbackWindowNotification(title, options);
      });
    return true;
  }

  return fallbackWindowNotification(title, options);
};

function fallbackWindowNotification(
  title: string,
  options?: NotificationOptions & { onClickUrl?: string }
): boolean {
  try {
    const notif = new Notification(title, {
      icon: "/icon_192.png",
      badge: "/favicon.svg",
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
}

export interface TaskNotificationOptions {
  title: string;
  body: string;
  onClickUrl?: string;
  type?: "assigned" | "done" | "info";
  playSound?: boolean;
}

/**
 * Unified task push notification:
 * 1. Plays gentle audio chime
 * 2. Delivers browser desktop / PWA notification if permitted
 * 3. Shows prominent in-app toast / banner notification
 */
export const sendTaskPushNotification = (options: TaskNotificationOptions): boolean => {
  if (options.playSound !== false) {
    playNotificationChime();
  }

  // 1. In-app feedback: showToast
  const showToast = typeof window !== "undefined" ? (window as any).showToast : null;
  if (typeof showToast === "function") {
    const toastType = options.type === "done" ? "success" : "info";
    showToast(`${options.title}: ${options.body}`, toastType);
  }

  // 2. Dispatch custom event for any listening components
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("ccrm:task-notification", {
        detail: options,
      })
    );
  }

  // 3. Desktop / OS push notification
  return sendBrowserNotification(options.title, {
    body: options.body,
    onClickUrl: options.onClickUrl || "tasks",
  });
};
