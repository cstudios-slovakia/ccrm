/**
 * Pure decisions behind "Install CCRM as an app" — no window, no storage, so
 * every rule can be unit-tested. The browser-facing half lives in pwaInstall.ts.
 */

export type InstallPlatform = "chromium" | "ios-safari" | "other";

export interface PlatformSignals {
  userAgent: string;
  /** `navigator.userAgentData?.brands` names, when the browser exposes them. */
  brands?: string[];
  platform?: string;
  maxTouchPoints?: number;
}

/**
 * Which install story applies.
 *
 * - `chromium`: Chrome, Edge, Brave, Opera, Vivaldi on desktop and Android — the
 *   browsers that fire `beforeinstallprompt`.
 * - `ios-safari`: every iOS / iPadOS browser. They are all WebKit and all install
 *   through Share → Add to Home Screen (iOS 16.4+ for browsers other than Safari).
 * - `other`: Firefox, desktop Safari and anything unknown.
 *
 * This only picks the *wording*; whether a real Install button is shown depends on
 * the browser having actually offered the prompt (`canInstall`).
 */
export const detectInstallPlatform = (s: PlatformSignals): InstallPlatform => {
  const ua = s.userAgent || "";
  // iPadOS 13+ reports itself as a Mac with a touch screen.
  const isIpadOs = s.platform === "MacIntel" && (s.maxTouchPoints ?? 0) > 1;
  if (/iPhone|iPad|iPod/i.test(ua) || isIpadOs) return "ios-safari";

  const brands = (s.brands || []).map((b) => b.toLowerCase());
  if (brands.some((b) => b.includes("chromium") || b.includes("google chrome") || b.includes("microsoft edge"))) {
    return "chromium";
  }
  // No client hints (older builds, some Linux packages): fall back to the UA.
  // Firefox never says "Chrome/"; desktop Safari never does either.
  if (/Chrome\/|Chromium\/|Edg\//.test(ua) && !/Firefox\//.test(ua)) return "chromium";
  return "other";
};

/** `display-mode` values in which the page runs as an installed app window. */
export const INSTALLED_DISPLAY_MODES = ["standalone", "window-controls-overlay", "minimal-ui", "fullscreen"] as const;

/**
 * True when this window is an installed app. `matches` answers a media query
 * (`window.matchMedia(q).matches`); `iosStandalone` is Safari's `navigator.standalone`.
 */
export const isStandaloneDisplay = (matches: (query: string) => boolean, iosStandalone?: boolean): boolean =>
  iosStandalone === true || INSTALLED_DISPLAY_MODES.some((mode) => matches(`(display-mode: ${mode})`));

export type InstallCardState =
  | "installed"
  | "can-install"
  | "ios-instructions"
  | "chromium-manual"
  | "insecure"
  | "unsupported";

/**
 * What the Settings card shows. Never yields a state with a dead button: the
 * Install button exists only for `can-install`, which needs a live prompt.
 */
export const installCardState = (input: {
  isInstalled: boolean;
  canInstall: boolean;
  platform: InstallPlatform;
  isSecureContext: boolean;
}): InstallCardState => {
  if (input.isInstalled) return "installed";
  if (input.canInstall) return "can-install";
  if (input.platform === "ios-safari") return "ios-instructions";
  // A browser only offers installation over HTTPS (or localhost).
  if (!input.isSecureContext) return "insecure";
  // Chromium that is not offering the prompt right now (it was dismissed, the
  // browser throttles it, or it is already installed elsewhere): the menu entry
  // still works, so say where it is instead of showing a button that does nothing.
  if (input.platform === "chromium") return "chromium-manual";
  return "unsupported";
};

/** A dismissed offer comes back after this long. */
export const INSTALL_OFFER_COOLDOWN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** True while a dismissal at `dismissedAt` (epoch ms) still silences the offer. */
export const isDismissalActive = (dismissedAt: number | null | undefined, now: number): boolean => {
  if (dismissedAt == null || !Number.isFinite(dismissedAt)) return false;
  // A timestamp from the future (clock change) must not silence the offer forever.
  if (dismissedAt > now) return false;
  return now - dismissedAt < INSTALL_OFFER_COOLDOWN_DAYS * DAY_MS;
};

/** localStorage key for one user's dismissal; per user, so a shared PC asks each person. */
export const dismissalStorageKey = (userKey: string): string =>
  `ccrm_pwa_install_dismissed:${(userKey || "anon").toLowerCase()}`;

export const parseDismissedAt = (raw: string | null | undefined): number | null => {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Windows in which the automatic offer must never appear. */
export const isQaUrl = (search: string): boolean => /(?:^|[?&])qa=/.test(search || "");

export const isEmbedUrl = (search: string, hash: string): boolean => {
  const hasEmbed = (query: string) => {
    const p = new URLSearchParams(query);
    return p.get("embed") === "tasks" || p.get("embed") === "true";
  };
  const hashQuery = (hash || "").includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  return hasEmbed(search || "") || hasEmbed(hashQuery);
};

/**
 * Whether the automatic install banner may be shown right now.
 * Not a gate on the app: it only decides whether to *ask*.
 */
export const shouldOfferInstall = (input: {
  signedIn: boolean;
  canInstall: boolean;
  isInstalled: boolean;
  embedded: boolean;
  qaRun: boolean;
  dismissedAt: number | null;
  now: number;
}): boolean =>
  input.signedIn &&
  input.canInstall &&
  !input.isInstalled &&
  !input.embedded &&
  !input.qaRun &&
  !isDismissalActive(input.dismissedAt, input.now);
