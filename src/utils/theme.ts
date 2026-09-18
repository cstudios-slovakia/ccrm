import { useEffect, useState } from "react";
import {
  approximateCoordinatesFromTimeZone,
  isDaylight,
  nextSolarTransition,
  solarTimes,
  type Coordinates,
} from "./solar";

/**
 * Appearance and palette.
 *
 * Two independent choices live here and they are deliberately not merged:
 *
 *   - the *appearance* — light or dark — chosen through a ThemeMode, which can
 *     also defer the decision to the OS or to the actual sun;
 *   - the *palette* used while the appearance is light (the herb collection).
 *
 * Keeping them apart means switching to dark and back never loses the light
 * palette the user picked, and adding another light palette costs nothing.
 *
 * The applied value is a single `data-theme` attribute on <html>: "dark", or
 * the palette id. `src/index.css` styles both cases off that one attribute.
 */

export interface ThemeOption {
  id: string;
  name: { en: string; sk: string; hu: string };
  description: { en: string; sk: string; hu: string };
  icon: string;
  category: "herb" | "classic" | "dark";
  preview: {
    bg: string;
    card: string;
    primary: string;
    secondary: string;
    text: string;
    border: string;
  };
}

export const HERB_THEMES: ThemeOption[] = [
  {
    id: "basic",
    name: {
      en: "Basic (Classic Soft)",
      sk: "Základná (Klasická Jemná)",
      hu: "Alapértelmezett (Klasszikus Lágy)"
    },
    description: {
      en: "Softer glassmorphism light theme with desaturated slate-indigo and muted terracotta accents.",
      sk: "Jemnejšia sklenená svetlá téma s tlmenými akcentmi bridlicovo-modrej a terakoty.",
      hu: "Lágyabb üveghatású világos téma visszafogott kék és terrakotta kiemelésekkel."
    },
    icon: "🌿",
    category: "classic",
    preview: {
      bg: "#f2f6fc",
      card: "#ffffff",
      primary: "#4f6edb",
      secondary: "#ea8a4c",
      text: "#1e293b",
      border: "#e2e8f0"
    }
  },
  {
    id: "sezame",
    name: {
      en: "Sezame (Warm Light)",
      sk: "Sezam (Teplá Svetlá)",
      hu: "Szezámmag (Meleg Világos)"
    },
    description: {
      en: "Feather-soft parchment cream background, gentle warm charcoal type, and muted toasted amber accents.",
      sk: "Aksamitne jemné pergamenové pozadie, príjemný teplý antracitový text a jemné akcenty praženého sézamu.",
      hu: "Bársonyosan lágy pergamen háttér, kellemes meleg faszén szöveg és finom pirított szezám akcentusok."
    },
    icon: "🌾",
    category: "herb",
    preview: {
      bg: "#faf7f2",
      card: "#fdfaf4",
      primary: "#c27803",
      secondary: "#5b930b",
      text: "#332f2b",
      border: "#ece4d5"
    }
  }
];

/**
 * The dark appearance, described for the settings preview. It is not selectable
 * as a palette — it is reached through the mode switch below.
 */
export const DARK_THEME: ThemeOption = {
  id: "dark",
  name: { en: "Midnight (Dark)", sk: "Polnočná (Tmavá)", hu: "Éjféli (Sötét)" },
  description: {
    en: "Deep blue-slate surfaces with lifted accents, tuned so long evenings stay comfortable.",
    sk: "Hlboké modro-bridlicové plochy so zosvetlenými akcentmi, ladené na pohodlné večerné používanie.",
    hu: "Mély kékes-pala felületek világosabb kiemelésekkel, hosszú esti munkához hangolva."
  },
  icon: "🌙",
  category: "dark",
  preview: {
    bg: "#0d1117",
    card: "#161b24",
    primary: "#7d97ff",
    secondary: "#f0a468",
    text: "#e6ebf3",
    border: "#2a3242"
  }
};

// -----------------------------------------------------------------------------
// Theme mode
// -----------------------------------------------------------------------------

export type ThemeMode = "system" | "light" | "dark" | "auto";

export type Appearance = "light" | "dark";

export interface ThemeModeOption {
  id: ThemeMode;
  name: { en: string; sk: string; hu: string };
  description: { en: string; sk: string; hu: string };
  icon: string;
}

export const THEME_MODES: ThemeModeOption[] = [
  {
    id: "system",
    icon: "🖥",
    name: { en: "System", sk: "Systémová", hu: "Rendszer" },
    description: {
      en: "Follow the light or dark setting of your operating system and browser.",
      sk: "Riadi sa svetlým alebo tmavým nastavením operačného systému a prehliadača.",
      hu: "A böngésző és az operációs rendszer világos/sötét beállítását követi."
    }
  },
  {
    id: "light",
    icon: "☀️",
    name: { en: "Light", sk: "Svetlá", hu: "Világos" },
    description: {
      en: "Always light, whatever the system or the time of day says.",
      sk: "Vždy svetlá, bez ohľadu na systém alebo dennú dobu.",
      hu: "Mindig világos, függetlenül a rendszertől és a napszaktól."
    }
  },
  {
    id: "dark",
    icon: "🌙",
    name: { en: "Dark", sk: "Tmavá", hu: "Sötét" },
    description: {
      en: "Always dark, whatever the system or the time of day says.",
      sk: "Vždy tmavá, bez ohľadu na systém alebo dennú dobu.",
      hu: "Mindig sötét, függetlenül a rendszertől és a napszaktól."
    }
  },
  {
    id: "auto",
    icon: "🌅",
    name: {
      en: "Auto (sunrise / sunset)",
      sk: "Automatická (východ / západ slnka)",
      hu: "Automatikus (napkelte / napnyugta)"
    },
    description: {
      en: "Light between sunrise and sunset, dark through the night — from the real solar times for your location.",
      sk: "Svetlá medzi východom a západom slnka, cez noc tmavá — podľa skutočných časov pre vašu polohu.",
      hu: "Napkeltétől napnyugtáig világos, éjszaka sötét — a helyszínre számított valós napidőkből."
    }
  }
];

// -----------------------------------------------------------------------------
// Storage
//
// The mode, the palette and the last known position are kept in localStorage
// rather than only in the user's DB row, because the pre-paint script in
// index.html has to answer "light or dark?" before React — or the session — has
// loaded. App.tsx mirrors them into metadata_json.preferences so the choice
// still follows the account to another device.
// -----------------------------------------------------------------------------

const MODE_KEY = "ccrm_theme_mode";
const PALETTE_KEY = "crm_user_theme";
const COORDS_KEY = "ccrm_theme_coords";
/**
 * Cached answer for `auto`, so the pre-paint script in index.html does not have
 * to do astronomy before the first frame. Refreshed on every apply.
 */
const AUTO_DARK_KEY = "ccrm_theme_auto_dark";

const readStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
};

const writeStorage = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    // Storage can be blocked outright (see utils/safeStorage.ts). The theme
    // still applies for this session; it just will not survive a reload.
  }
};

export const isThemeMode = (value: unknown): value is ThemeMode =>
  THEME_MODES.some((m) => m.id === value);

export const getStoredThemeMode = (): ThemeMode => {
  if (typeof window === "undefined") return "system";
  const stored = readStorage(MODE_KEY);
  return isThemeMode(stored) ? stored : "system";
};

export const setStoredThemeMode = (mode: ThemeMode): void => {
  writeStorage(MODE_KEY, isThemeMode(mode) ? mode : "system");
};

/** The light palette id — "basic" unless the user picked another herb theme. */
export const getStoredTheme = (): string => {
  if (typeof window === "undefined") return "basic";
  const stored = readStorage(PALETTE_KEY);
  return HERB_THEMES.some((t) => t.id === stored) ? (stored as string) : "basic";
};

export const getStoredCoordinates = (): Coordinates | null => {
  const raw = readStorage(COORDS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const latitude = Number(parsed?.latitude);
    const longitude = Number(parsed?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return { latitude, longitude };
  } catch (e) {
    return null;
  }
};

export const setStoredCoordinates = (coords: Coordinates): void => {
  writeStorage(COORDS_KEY, JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude }));
};

/**
 * Where "auto" thinks you are: the position the browser gave us, or a decent
 * guess from the timezone until it does. `precise` is what the settings screen
 * uses to explain which of the two is in play.
 */
export const getAutoLocation = (): { coords: Coordinates; precise: boolean } => {
  const stored = getStoredCoordinates();
  if (stored) return { coords: stored, precise: true };
  return { coords: approximateCoordinatesFromTimeZone(), precise: false };
};

/**
 * Ask the browser for a real position. Resolves to null when permission is
 * denied or geolocation is unavailable — "auto" keeps working off the timezone
 * estimate, so nothing here is allowed to reject.
 */
export const requestPreciseLocation = (): Promise<Coordinates | null> =>
  new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setStoredCoordinates(coords);
        resolve(coords);
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 24 * 60 * 60 * 1000 }
    );
  });

// -----------------------------------------------------------------------------
// Resolution
// -----------------------------------------------------------------------------

export const prefersDarkScheme = (): boolean => {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch (e) {
    return false;
  }
};

/**
 * Light or dark, for a given mode. Everything from the environment it depends
 * on is passed in, so the decision is testable on its own.
 */
export const resolveAppearance = (
  mode: ThemeMode,
  now: Date = new Date(),
  coords: Coordinates = getAutoLocation().coords
): Appearance => {
  switch (mode) {
    case "light":
      return "light";
    case "dark":
      return "dark";
    case "auto":
      return isDaylight(now, coords) ? "light" : "dark";
    case "system":
    default:
      return prefersDarkScheme() ? "dark" : "light";
  }
};

// -----------------------------------------------------------------------------
// Application
// -----------------------------------------------------------------------------

/** Address-bar / task-switcher colour, kept in step with the surface behind it. */
const THEME_COLOR: Record<Appearance, string> = { light: "#f2f6fc", dark: "#0d1117" };

const paint = (appearance: Appearance, palette: string): void => {
  const root = document.documentElement;
  root.setAttribute("data-theme", appearance === "dark" ? "dark" : palette);
  // Read by CSS that needs the appearance without caring which light palette is
  // active, and by the QA suite to assert what is on screen.
  root.setAttribute("data-appearance", appearance);
  // Tells the browser to render native widgets — scrollbars, date pickers,
  // <select> popups, autofill — in the matching scheme. Without it they stay
  // light and punch white holes into a dark screen.
  root.style.colorScheme = appearance;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[appearance]);
};

/**
 * Apply a light palette, preserving whatever appearance is in force. Kept as
 * the palette picker's entry point and for callers that predate the mode switch.
 */
export const applyTheme = (themeId: string): void => {
  if (typeof document === "undefined") return;
  const palette = HERB_THEMES.some((t) => t.id === themeId) ? themeId : "basic";
  writeStorage(PALETTE_KEY, palette);
  paint(resolveAppearance(getStoredThemeMode()), palette);
};

/** Apply mode and palette together. Returns the appearance that reached the screen. */
export const applyThemeMode = (mode: ThemeMode, palette: string = getStoredTheme()): Appearance => {
  const appearance = resolveAppearance(mode);
  if (typeof document === "undefined") return appearance;
  setStoredThemeMode(mode);
  // The palette is mirrored on every apply, not only when the picker is used:
  // it may have arrived from the user's DB row, and index.html has to find it
  // in localStorage to paint the right light theme before the bundle loads.
  writeStorage(PALETTE_KEY, HERB_THEMES.some((t) => t.id === palette) ? palette : "basic");
  writeStorage(AUTO_DARK_KEY, mode === "auto" && appearance === "dark" ? "1" : "0");
  paint(appearance, palette);
  return appearance;
};

/**
 * Keep the applied appearance true over time.
 *
 * Two things change it without the user touching anything: the OS flipping its
 * own light/dark setting (`system`), and the sun rising or setting (`auto`).
 * Both are watched here; the returned function detaches everything.
 *
 * `auto` sleeps until the next solar transition rather than polling, with a
 * ceiling of an hour per timer — a laptop resuming from suspend has an
 * effectively frozen timeout, and an hourly floor makes it correct itself
 * promptly instead of holding a stale theme until the next day.
 */
export const startThemeWatcher = (
  getState: () => { mode: ThemeMode; palette: string },
  onChange?: (appearance: Appearance) => void
): (() => void) => {
  if (typeof window === "undefined") return () => {};

  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const schedule = (mode: ThemeMode) => {
    if (timer) clearTimeout(timer);
    if (stopped || mode !== "auto") return;
    const { coords } = getAutoLocation();
    const next = nextSolarTransition(new Date(), coords);
    // A second past the transition, so rounding never lands us just before it.
    const untilTransition = next ? next.getTime() - Date.now() + 1000 : Number.POSITIVE_INFINITY;
    const delay = Math.max(1000, Math.min(untilTransition, 60 * 60 * 1000));
    timer = setTimeout(apply, delay);
  };

  function apply() {
    if (stopped) return;
    const { mode, palette } = getState();
    const appearance = applyThemeMode(mode, palette);
    onChange?.(appearance);
    schedule(mode);
  }

  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const onMediaChange = () => {
    if (getState().mode === "system") apply();
  };
  // Safari below 14 only has the deprecated addListener.
  if (media?.addEventListener) media.addEventListener("change", onMediaChange);
  else media?.addListener?.(onMediaChange);

  // A tab hidden across a sunset gets its timers coalesced by the browser, so
  // re-check the moment it is looked at again.
  const onVisible = () => {
    if (document.visibilityState === "visible") apply();
  };
  document.addEventListener("visibilitychange", onVisible);

  apply();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (media?.removeEventListener) media.removeEventListener("change", onMediaChange);
    else media?.removeListener?.(onMediaChange);
    document.removeEventListener("visibilitychange", onVisible);
  };
};

/** Today's solar schedule, for the explanation shown under the "auto" option. */
export const describeAutoSchedule = (now: Date = new Date()) => {
  const { coords, precise } = getAutoLocation();
  const { sunrise, sunset, polarDay, polarNight } = solarTimes(now, coords);
  return { coords, precise, sunrise, sunset, polarDay, polarNight, daylight: isDaylight(now, coords) };
};

export type { Coordinates };

// -----------------------------------------------------------------------------
// Reading the appearance from anywhere
// -----------------------------------------------------------------------------

/** The appearance currently painted, straight from the attribute on <html>. */
export const currentAppearance = (): Appearance => {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-appearance") === "dark" ? "dark" : "light";
};

/**
 * Subscribe to the appearance.
 *
 * Almost everything re-themes through CSS and never needs this. Canvas charts
 * do: chart.js is handed literal colours for its axes, grid and legend, and it
 * only picks up new ones when the component that built those options renders
 * again. Watching the attribute keeps them in step without threading the
 * appearance through half a dozen view props.
 */
export const useAppearance = (): Appearance => {
  const [appearance, setAppearance] = useState<Appearance>(currentAppearance);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setAppearance(currentAppearance());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-appearance"] });
    return () => observer.disconnect();
  }, []);

  return appearance;
};

/**
 * Colours for canvas charts, which cannot read a CSS variable.
 * Kept next to the palette so the two never drift apart.
 */
export const chartTheme = (appearance: Appearance = currentAppearance()) =>
  appearance === "dark"
    ? { label: "#cbd5e1", tick: "#94a3b8", grid: "#252d3b", tooltipBg: "#1b212c", tooltipText: "#e2e8f0" }
    : { label: "#334155", tick: "#64748b", grid: "#f1f5f9", tooltipBg: "#ffffff", tooltipText: "#0f172a" };
