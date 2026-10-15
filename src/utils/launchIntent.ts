/**
 * Deep links into the Tasks view, used by the installed app's shortcuts, by the
 * Web Share Target and by the "Send to CCRM" bookmarklet:
 *
 *   #tasks?newTask=<text>   open the create-task flow, prefilled (empty = blank)
 *   #tasks?voice=1          open the voice recorder, ready to record
 *
 * Pure string handling; the window-facing wrappers are at the bottom.
 */

/** Query names the manifest's share_target maps title / text / url onto. */
export const SHARE_PARAM_TITLE = "ccrm_share_title";
export const SHARE_PARAM_TEXT = "ccrm_share_text";
export const SHARE_PARAM_URL = "ccrm_share_url";
const SHARE_PARAMS = [SHARE_PARAM_TITLE, SHARE_PARAM_TEXT, SHARE_PARAM_URL];

/** One task title, not a page of prose: a shared article must not become a 5 KB title. */
export const MAX_SHARED_TASK_LENGTH = 500;

export interface LaunchIntent {
  /** `null` = not requested; `""` = open a blank create form. */
  newTask: string | null;
  voice: boolean;
}

const hashQuery = (hash: string): URLSearchParams => {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const q = raw.indexOf("?");
  return new URLSearchParams(q === -1 ? "" : raw.slice(q + 1));
};

const hashRoute = (hash: string): string => {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const q = raw.indexOf("?");
  return q === -1 ? raw : raw.slice(0, q);
};

/** Reads `newTask` and `voice` from a location hash. */
export const parseLaunchIntent = (hash: string): LaunchIntent => {
  const params = hashQuery(hash || "");
  const voiceRaw = params.get("voice");
  return {
    newTask: params.has("newTask") ? (params.get("newTask") ?? "").trim() : null,
    voice: voiceRaw !== null && voiceRaw !== "0" && voiceRaw.toLowerCase() !== "false",
  };
};

export const hasLaunchIntent = (hash: string): boolean => {
  const intent = parseLaunchIntent(hash);
  return intent.newTask !== null || intent.voice;
};

/** The hash with the launch params removed; every other param (embed, …) stays. */
export const stripLaunchIntent = (hash: string): string => {
  const route = hashRoute(hash || "");
  const params = hashQuery(hash || "");
  params.delete("newTask");
  params.delete("voice");
  const rest = params.toString();
  return `#${route}${rest ? `?${rest}` : ""}`;
};

/**
 * Folds the three fields of a share into the single line a task title is.
 * Android and some desktop shares put the link in `text`, so a URL already
 * present in the text (or the title) is not added twice.
 */
export const composeSharedText = (parts: { title?: string | null; text?: string | null; url?: string | null }): string => {
  const clean = (v?: string | null) => (v || "").replace(/\s+/g, " ").trim();
  const title = clean(parts.title);
  const text = clean(parts.text);
  const url = clean(parts.url);

  const pieces: string[] = [];
  if (title) pieces.push(title);
  if (text && text !== title) pieces.push(text);
  const joined = pieces.join(" — ");
  const withUrl = url && !joined.includes(url) ? (joined ? `${joined} ${url}` : url) : joined;

  if (withUrl.length <= MAX_SHARED_TASK_LENGTH) return withUrl;
  // Cut the prose, never the link: a truncated URL is a broken URL.
  if (url && withUrl.endsWith(url) && url.length < MAX_SHARED_TASK_LENGTH - 2) {
    const room = MAX_SHARED_TASK_LENGTH - url.length - 2;
    return `${withUrl.slice(0, withUrl.length - url.length).trimEnd().slice(0, room).trimEnd()}… ${url}`;
  }
  return `${withUrl.slice(0, MAX_SHARED_TASK_LENGTH - 1).trimEnd()}…`;
};

/**
 * A page opened by the share target arrives as `/?ccrm_share_text=…` — the
 * browser can only put share data in the query string, never in the hash.
 * Returns the location the app should rewrite itself to, or `null` when this
 * is not a share.
 */
export const shareTargetRedirect = (search: string, hash: string): { search: string; hash: string } | null => {
  const params = new URLSearchParams(search || "");
  if (!SHARE_PARAMS.some((name) => params.has(name))) return null;

  const text = composeSharedText({
    title: params.get(SHARE_PARAM_TITLE),
    text: params.get(SHARE_PARAM_TEXT),
    url: params.get(SHARE_PARAM_URL),
  });
  SHARE_PARAMS.forEach((name) => params.delete(name));
  const rest = params.toString();

  // Keep any param the hash already carries (embed=…), then add the task text.
  const route = hashRoute(hash || "") || "tasks";
  const hp = hashQuery(hash || "");
  hp.set("newTask", text);
  return { search: rest ? `?${rest}` : "", hash: `#${route}?${hp.toString()}` };
};

/**
 * The address a "Send to CCRM" bookmarklet opens. `selection` wins over the page
 * title; the page address is always appended so the task points back at its source.
 */
export const buildNewTaskHash = (text: string): string =>
  `#tasks?newTask=${encodeURIComponent(text.replace(/\s+/g, " ").trim().slice(0, MAX_SHARED_TASK_LENGTH))}`;

/**
 * The "Send to CCRM" bookmarklet: on any page it opens CCRM's create-task form
 * with the selected text (or the page title) and the page address. Works in every
 * desktop browser, installed app or not — it only needs a link to CCRM.
 *
 * Kept to one line of plain ES5 so it survives being dragged to a bookmarks bar.
 */
export const buildBookmarklet = (origin: string): string => {
  const base = `${origin.replace(/\/+$/, "")}/#tasks?newTask=`;
  const code =
    "(function(){" +
    "var c=function(v){return String(v||'').replace(/\\s+/g,' ').trim()};" +
    "var u=location.href;" +
    "var t=c(window.getSelection?window.getSelection().toString():'')||c(document.title);" +
    `var room=${MAX_SHARED_TASK_LENGTH}-u.length-1;` +
    "if(t.length>room)t=room>1?t.slice(0,room-1).trim()+'…':'';" +
    `window.open(${JSON.stringify(base)}+encodeURIComponent((t+' '+u).trim()),'_blank');` +
    "})()";
  return `javascript:${code}`;
};

// ---------------------------------------------------------------------------
// Window-facing wrappers
// ---------------------------------------------------------------------------

/**
 * Call once, before React mounts: turns a share-target arrival into the
 * `#tasks?newTask=…` form the rest of the app understands and drops the
 * share params from the address bar.
 */
export const normalizeLaunchUrl = (): void => {
  if (typeof window === "undefined") return;
  try {
    const redirect = shareTargetRedirect(window.location.search, window.location.hash);
    if (!redirect) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${redirect.search}${redirect.hash}`);
  } catch {
    /* history can be locked down in sandboxed frames; the app then opens normally */
  }
};

/**
 * Removes the launch params from the address bar (no history entry) and tells
 * the router, which only listens to `hashchange`.
 */
export const consumeLaunchIntent = (): void => {
  if (typeof window === "undefined") return;
  try {
    const next = stripLaunchIntent(window.location.hash);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${next}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } catch {
    /* ignore */
  }
};
