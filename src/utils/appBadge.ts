import { useEffect } from "react";

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/** Badging API: the number on the installed app's taskbar / dock icon. */
export const isAppBadgeSupported = (): boolean =>
  typeof navigator !== "undefined" && typeof (navigator as BadgeNavigator).setAppBadge === "function";

/** Sets the badge, or clears it at 0 / `null`. Never throws: it is decoration. */
export const applyAppBadge = async (count: number | null): Promise<void> => {
  if (!isAppBadgeSupported()) return;
  const nav = navigator as BadgeNavigator;
  try {
    if (count && count > 0) await nav.setAppBadge!(count);
    else if (typeof nav.clearAppBadge === "function") await nav.clearAppBadge();
    else await nav.setAppBadge!(0); // 0 clears it, per the spec
  } catch {
    /* denied, or not an installed app */
  }
};

/**
 * Keeps the app badge equal to `count`. `null` (signed out, no task access,
 * mini window) clears it — a stale number for a signed-out user would be wrong.
 */
export const useAppBadge = (count: number | null): void => {
  useEffect(() => {
    void applyAppBadge(count);
  }, [count]);
  useEffect(() => () => void applyAppBadge(null), []);
};
