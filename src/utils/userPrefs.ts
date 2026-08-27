import { createContext, useContext } from "react";

/**
 * Per-user interface preferences.
 *
 * These used to live in `localStorage` / `sessionStorage`, which had three
 * problems: they did not follow the user to a second device or browser, they
 * were silently lost whenever the browser cleared site data, and — on iOS Safari
 * with "Block All Cookies" — merely *reading* them threw a SecurityError that
 * crashed the whole app on boot.
 *
 * They now live in the user's row, inside `users.metadata_json.preferences`, and
 * travel over the existing users entity in sync.php. No backend change is needed:
 * metadata_json is an opaque JSON blob and both ccrm_mask_user_metadata() and
 * ccrm_merge_user_metadata() pass unknown keys through untouched.
 *
 * The one preference deliberately NOT here is the interface language: it already
 * had its own DB-backed home at `metadata_json.language` before this, and the
 * ErrorBoundary — which renders outside the React tree and outside auth — needs
 * to read it without a user object (see getStoredLanguage in translations.ts).
 */
export interface UserPrefs {
  /** Theme id. Reserved: main has no theme picker yet. */
  theme: string;
  /** Debug affordance: show the error-log quick access in the main sidebar. */
  errorSidebarEnabled: boolean;
  /** Leads screen: table or kanban board. */
  leadsViewMode: "list" | "kanban";
  /** Leads screen: dense rows. */
  leadsCompactMode: boolean;
  /** Leads screen: grouping / sorting. */
  leadsOrderingMode: "state" | "pm" | "created_newest" | "created_oldest" | "size" | "rating";
  /**
   * Leads screen: which pipeline states are shown. `null` means "never chosen",
   * which is not the same as "none selected" — it falls back to every open state.
   */
  leadsVisibleStates: string[] | null;
  /** Id of the newest release note the user has already opened. */
  seenUpdateId: string | null;
  /**
   * "Don't show again" on the banner that warns an AI section is unusable
   * because no OpenAI key is configured. Per user, not per browser: someone who
   * cannot administer the key should not be nagged on every device.
   */
  aiKeyBannerDismissed: boolean;
  /** Customised built-in RAG agent, or null while it is still the stock one. */
  ragDefaultAgent: any | null;
}

export const DEFAULT_USER_PREFS: UserPrefs = {
  theme: "basic",
  errorSidebarEnabled: false,
  leadsViewMode: "list",
  leadsCompactMode: false,
  leadsOrderingMode: "state",
  leadsVisibleStates: null,
  seenUpdateId: null,
  aiKeyBannerDismissed: false,
  ragDefaultAgent: null,
};

/** Anything with a metadata_json blob — UserProfile, or a raw sync.php row. */
type UserLike = { metadata_json?: unknown } | null | undefined;

/** metadata_json arrives as a JSON string from the server but as a plain object
 *  after a local edit, so every reader has to cope with both. */
export const parseUserMetadata = (user: UserLike): Record<string, any> => {
  const raw = user?.metadata_json;
  if (!raw) return {};
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : {};
  } catch (e) {
    return {};
  }
};

export const readUserPrefs = (user: UserLike): UserPrefs => {
  const stored = parseUserMetadata(user).preferences;
  if (!stored || typeof stored !== "object") return DEFAULT_USER_PREFS;
  return { ...DEFAULT_USER_PREFS, ...(stored as Partial<UserPrefs>) };
};

/** True once this user's preferences have been written at least once, which is
 *  what tells the one-shot localStorage migration it has nothing left to do. */
export const hasStoredPrefs = (user: UserLike): boolean => {
  const stored = parseUserMetadata(user).preferences;
  return !!stored && typeof stored === "object";
};

export interface UserPrefsApi {
  prefs: UserPrefs;
  setPref: <K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) => void;
}

export const UserPrefsContext = createContext<UserPrefsApi>({
  prefs: DEFAULT_USER_PREFS,
  setPref: () => {},
});

export const useUserPrefs = (): UserPrefsApi => useContext(UserPrefsContext);

/** Drop-in replacement for useState against a single DB-backed preference. */
export function useUserPref<K extends keyof UserPrefs>(
  key: K
): [UserPrefs[K], (value: UserPrefs[K]) => void] {
  const { prefs, setPref } = useUserPrefs();
  return [prefs[key], (value: UserPrefs[K]) => setPref(key, value)];
}

/**
 * Preferences that existing installs still have sitting in localStorage, so the
 * first login after this change adopts them instead of resetting everyone's
 * theme. Read once, migrated into metadata_json, then wiped — see
 * migrateLegacyPrefs usage in App.tsx.
 */
const LEGACY_PREF_KEYS = [
  "crm_user_theme",
  "ccrm_error_sidebar_enabled",
  "crm_leads_visible_states",
  "ccrm_seen_update_id",
  "ccrm_custom_default_agent",
];

export const readLegacyPrefs = (): Partial<UserPrefs> => {
  const legacy: Partial<UserPrefs> = {};
  const read = (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  };

  const theme = read("crm_user_theme");
  if (theme) legacy.theme = theme;

  const errorSidebar = read("ccrm_error_sidebar_enabled");
  if (errorSidebar !== null) legacy.errorSidebarEnabled = errorSidebar === "true";

  const visibleStates = read("crm_leads_visible_states");
  if (visibleStates) {
    try {
      const parsed = JSON.parse(visibleStates);
      if (Array.isArray(parsed)) legacy.leadsVisibleStates = parsed;
    } catch (e) {}
  }

  const seenUpdateId = read("ccrm_seen_update_id");
  if (seenUpdateId) legacy.seenUpdateId = seenUpdateId;

  const ragAgent = read("ccrm_custom_default_agent");
  if (ragAgent) {
    try {
      const parsed = JSON.parse(ragAgent);
      if (parsed && typeof parsed === "object") legacy.ragDefaultAgent = parsed;
    } catch (e) {}
  }

  return legacy;
};

export const clearLegacyPrefs = (): void => {
  LEGACY_PREF_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  });
};
