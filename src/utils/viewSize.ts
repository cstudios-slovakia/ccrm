import { useEffect, useState } from "react";
import { VIEW_SIZE_ENABLED } from "./featureFlags.ts";

/**
 * View size — Auto · Compact · Normal · Big. See docs/VIEW-SIZE.md.
 *
 * The resolved size is a single `data-view-size` attribute on <html>;
 * `src/index.css` redefines the type, spacing and container variables off it,
 * the same way dark mode works off `data-theme`. The chosen *mode* (which may
 * be "auto") is mirrored in `data-view-size-mode`.
 */

export type ViewSize = "compact" | "normal" | "big";
export type ViewSizeMode = "auto" | ViewSize;

export type TypeRole =
  | "micro"
  | "caption"
  | "ui"
  | "body"
  | "title-sm"
  | "title"
  | "heading"
  | "display"
  | "metric";

export const VIEW_SIZE_KEY = "ccrm_view_size";
export const AUTO_NORMAL_MIN = 1800; // px, window width
export const AUTO_BIG_MIN = 2200;

/** Must equal VS_DEFAULT in index.html (unit-tested). */
export const DEFAULT_VIEW_SIZE_MODE: ViewSizeMode = VIEW_SIZE_ENABLED ? "auto" : "compact";

const SCALES: Record<ViewSize, number> = { compact: 1, normal: 1.125, big: 1.25 };

export const isViewSizeMode = (v: unknown): v is ViewSizeMode =>
  v === "auto" || v === "compact" || v === "normal" || v === "big";

export const getStoredViewSizeMode = (): ViewSizeMode => {
  try {
    const raw = localStorage.getItem(VIEW_SIZE_KEY);
    return isViewSizeMode(raw) ? raw : DEFAULT_VIEW_SIZE_MODE;
  } catch {
    return DEFAULT_VIEW_SIZE_MODE;
  }
};

export const setStoredViewSizeMode = (mode: ViewSizeMode): void => {
  try {
    localStorage.setItem(VIEW_SIZE_KEY, mode);
  } catch {
    /* private mode / blocked storage: the setting just won't persist */
  }
};

/** Pure; unit-tested. */
export const resolveViewSize = (mode: ViewSizeMode, windowWidth: number): ViewSize =>
  mode !== "auto"
    ? mode
    : windowWidth >= AUTO_BIG_MIN
      ? "big"
      : windowWidth >= AUTO_NORMAL_MIN
        ? "normal"
        : "compact";

// matchMedia rather than innerWidth, so JS and CSS agree about the same pixel.
const matches = (query: string): boolean =>
  typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(query).matches;

const widthNow = (): number =>
  matches(`(min-width: ${AUTO_BIG_MIN}px)`)
    ? AUTO_BIG_MIN
    : matches(`(min-width: ${AUTO_NORMAL_MIN}px)`)
      ? AUTO_NORMAL_MIN
      : 0;

/** Writes data-view-size (resolved) and data-view-size-mode on <html>. */
export const applyViewSize = (mode: ViewSizeMode): ViewSize => {
  const size = resolveViewSize(mode, widthNow());
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    if (root.getAttribute("data-view-size") !== size) root.setAttribute("data-view-size", size);
    if (root.getAttribute("data-view-size-mode") !== mode) root.setAttribute("data-view-size-mode", mode);
  }
  return size;
};

/** Re-applies on window-width and cross-tab changes. Returns the detach function. */
export const startViewSizeWatcher = (): (() => void) => {
  if (typeof window === "undefined") return () => {};

  const apply = () => {
    applyViewSize(getStoredViewSizeMode());
  };
  apply();

  const queries = [AUTO_NORMAL_MIN, AUTO_BIG_MIN].map((px) =>
    window.matchMedia ? window.matchMedia(`(min-width: ${px}px)`) : null
  );
  // Safari below 14 only has the deprecated addListener.
  for (const q of queries) {
    if (q?.addEventListener) q.addEventListener("change", apply);
    else q?.addListener?.(apply);
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === VIEW_SIZE_KEY || e.key === null) apply();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    for (const q of queries) {
      if (q?.removeEventListener) q.removeEventListener("change", apply);
      else q?.removeListener?.(apply);
    }
    window.removeEventListener("storage", onStorage);
  };
};

/** The resolved size currently painted, straight from <html>. */
export const currentViewSize = (): ViewSize => {
  if (typeof document === "undefined") return "compact";
  const v = document.documentElement.getAttribute("data-view-size");
  return v === "normal" || v === "big" ? v : "compact";
};

const currentMode = (): ViewSizeMode => {
  if (typeof document === "undefined") return DEFAULT_VIEW_SIZE_MODE;
  const v = document.documentElement.getAttribute("data-view-size-mode");
  return isViewSizeMode(v) ? v : DEFAULT_VIEW_SIZE_MODE;
};

/** 1 · 1.125 · 1.25 — the --vs-scale of the resolved size. */
export const viewSizeScale = (size: ViewSize = currentViewSize()): number => SCALES[size];

/** Re-renders on change. MutationObserver on <html>, exactly like useAppearance(). */
export const useViewSize = (): { mode: ViewSizeMode; size: ViewSize; scale: number } => {
  const [state, setState] = useState(() => ({ mode: currentMode(), size: currentViewSize() }));

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      const next = { mode: currentMode(), size: currentViewSize() };
      setState((prev) => (prev.mode === next.mode && prev.size === next.size ? prev : next));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-view-size", "data-view-size-mode"] });
    return () => observer.disconnect();
  }, []);

  return { ...state, scale: SCALES[state.size] };
};

/** Pixel size of a type role, read from the CSS token so CSS stays the single source. */
export const typePx = (role: TypeRole): number => {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const raw = style.getPropertyValue(`--text-${role}`).trim(); // e.g. "0.75rem"
  const rootPx = parseFloat(style.fontSize) || 16;
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return 12;
  return raw.endsWith("rem") ? n * rootPx : n;
};

/** Chart.js / SVG text sizes in px for the current view size. */
export const chartFonts = () => ({
  tick: typePx("micro"),
  label: typePx("caption"),
  legend: typePx("caption"),
});
