// Which UI language is shown, and where each answer comes from.
//
//   logged in : the user's personal language  ->  the company (system) language
//   logged out: the language the last user of THIS browser chose personally
//               ->  the company (system) language
//
// "Remembered" is per browser on purpose: before anyone has logged in the app
// cannot know who is about to, so the best guess is whoever used it last. It only
// ever holds a *personal* choice; a user without one clears it, so the login
// screen of a browser nobody customised follows the company language.
//
// `crm_language` (the language currently on screen, mirrored by App for the
// ErrorBoundary and other components outside its tree) is deliberately NOT an
// input here: it is an output, and feeding it back made the company language
// unreachable once any value had been written.

export type Lang = "en" | "sk" | "hu";

export const REMEMBERED_LANGUAGE_KEY = "crm_login_language";
export const SYSTEM_LANGUAGE_CACHE_KEY = "crm_system_language";
export const DEFAULT_LANGUAGE: Lang = "sk";

export const isLang = (v: unknown): v is Lang => v === "en" || v === "sk" || v === "hu";

/** The language a user picked for themselves (metadata_json.language), or null. */
export const personalLanguage = (user: { metadata_json?: unknown } | null | undefined): Lang | null => {
  const raw = user?.metadata_json;
  if (!raw) return null;
  try {
    const meta = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
    const lang = (meta as { language?: unknown } | null)?.language;
    return isLang(lang) ? lang : null;
  } catch {
    return null;
  }
};

export const resolveLanguage = (o: {
  loggedIn: boolean;
  personal: Lang | null;
  remembered: Lang | null;
  system: Lang;
}): Lang => (o.loggedIn ? o.personal : o.remembered) ?? o.system;

const read = (key: string): Lang | null => {
  try {
    const v = localStorage.getItem(key);
    return isLang(v) ? v : null;
  } catch {
    return null; // private mode / storage blocked
  }
};

const write = (key: string, value: Lang | null): void => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // never let storage break rendering
  }
};

export const readRememberedLanguage = (): Lang | null => read(REMEMBERED_LANGUAGE_KEY);
export const writeRememberedLanguage = (lang: Lang | null): void => write(REMEMBERED_LANGUAGE_KEY, lang);

/** Last company language the server told us, so a reload does not flash the default first. */
export const readCachedSystemLanguage = (): Lang | null => read(SYSTEM_LANGUAGE_CACHE_KEY);
export const writeCachedSystemLanguage = (lang: Lang): void => write(SYSTEM_LANGUAGE_CACHE_KEY, lang);
