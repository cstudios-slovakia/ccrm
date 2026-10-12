import { useSyncExternalStore } from "react";
import {
  detectInstallPlatform,
  dismissalStorageKey,
  isEmbedUrl,
  isQaUrl,
  isStandaloneDisplay,
  parseDismissedAt,
  type InstallPlatform,
} from "./pwaInstallLogic.ts";

/**
 * "Install CCRM as an app" — the browser-facing half.
 *
 * `beforeinstallprompt` fires once, early, usually before React has rendered
 * anything. The listener therefore lives at module level and main.tsx imports
 * this file first; a component that subscribed in an effect would miss it.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

export interface PwaInstallState {
  /** The browser has offered an install prompt that has not been used yet. */
  canInstall: boolean;
  /** Running as an installed app, or installed on this device earlier. */
  isInstalled: boolean;
  /** Running inside the installed app window right now (not merely installed). */
  isStandalone: boolean;
  platform: InstallPlatform;
  isSecureContext: boolean;
}

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

const INSTALLED_FLAG_KEY = "ccrm_pwa_installed";

const safeGet = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const safeSet = (key: string, value: string | null): void => {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage can be blocked; the feature just forgets */
  }
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

const readStandalone = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return isStandaloneDisplay(
    (q) => window.matchMedia(q).matches,
    (window.navigator as Navigator & { standalone?: boolean }).standalone,
  );
};

const readPlatform = (): InstallPlatform => {
  if (typeof navigator === "undefined") return "other";
  const nav = navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } };
  return detectInstallPlatform({
    userAgent: navigator.userAgent,
    brands: nav.userAgentData?.brands?.map((b) => b.brand),
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
};

const compute = (): PwaInstallState => {
  if (typeof window === "undefined") {
    return { canInstall: false, isInstalled: false, isStandalone: false, platform: "other", isSecureContext: false };
  }
  const isStandalone = readStandalone();
  const canInstall = deferredPrompt !== null;
  return {
    canInstall,
    // The flag covers a browser tab on a device where the app was installed: the
    // browser stops offering the prompt then, and only a new offer proves the
    // app is gone (see the beforeinstallprompt handler).
    isInstalled: isStandalone || (!canInstall && safeGet(INSTALLED_FLAG_KEY) === "1"),
    isStandalone,
    platform: readPlatform(),
    isSecureContext: window.isSecureContext !== false,
  };
};

let snapshot: PwaInstallState = compute();

const emit = (): void => {
  snapshot = compute();
  listeners.forEach((l) => l());
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Hold the event back so our own UI decides when to ask.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    // The browser is offering the app again, so it is not installed any more.
    safeSet(INSTALLED_FLAG_KEY, null);
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    safeSet(INSTALLED_FLAG_KEY, "1");
    emit();
  });
  if (typeof window.matchMedia === "function") {
    const mq = window.matchMedia("(display-mode: standalone)");
    // Safari < 14 has addListener only; there is nothing to install there anyway.
    mq.addEventListener?.("change", emit);
  }
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = (): PwaInstallState => snapshot;

/**
 * Shows the browser's install dialog. Must be called from a click: the browser
 * rejects `prompt()` without a user gesture. A prompt can be used once, so the
 * button disappears afterwards (the browser re-offers it later if it wants to).
 */
export const promptInstall = async (): Promise<InstallOutcome> => {
  const event = deferredPrompt;
  if (!event) return "unavailable";
  deferredPrompt = null;
  emit();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") {
      safeSet(INSTALLED_FLAG_KEY, "1");
      emit();
    }
    return choice.outcome;
  } catch {
    return "unavailable";
  }
};

export const usePwaInstall = (): PwaInstallState & { promptInstall: typeof promptInstall } => {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...state, promptInstall };
};

// --- banner dismissal (per user, 30-day cooldown; rule in pwaInstallLogic) ---

export const readInstallDismissedAt = (userKey: string): number | null =>
  typeof window === "undefined" ? null : parseDismissedAt(safeGet(dismissalStorageKey(userKey)));

export const writeInstallDismissedAt = (userKey: string, at: number = Date.now()): void => {
  if (typeof window !== "undefined") safeSet(dismissalStorageKey(userKey), String(at));
};

/** The automatic offer is never made in QA runs (`?qa=`) or in the mini / embedded window. */
export const isQaRunHere = (): boolean => typeof window === "undefined" || isQaUrl(window.location.search);
export const isEmbeddedHere = (): boolean =>
  typeof window === "undefined" || isEmbedUrl(window.location.search, window.location.hash);
