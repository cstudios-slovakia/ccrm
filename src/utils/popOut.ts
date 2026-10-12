/**
 * The compact "My tasks" mini window — what the Chrome side panel was.
 *
 * Preferred: a Document Picture-in-Picture window (Chrome / Edge 116+ on
 * Windows, macOS, Linux and ChromeOS). It stays on top of every other window.
 * Fallback: a small popup window, which is a normal window and can be covered.
 *
 * Both host the existing `#tasks?embed=tasks` view in a same-origin frame, so
 * the mini window needs no second copy of the Tasks UI and shares the session.
 */

export type PopOutResult = "pip" | "popup" | "blocked";

const POPUP_NAME = "ccrm-my-tasks";
const WIDTH = 420;
const HEIGHT = 680;

type PipApi = {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
  window?: Window | null;
};

const pipApi = (): PipApi | null => {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture;
  return api && typeof api.requestWindow === "function" ? api : null;
};

export const isPictureInPictureWindowSupported = (): boolean => pipApi() !== null;

/** Address of the compact tasks view. Absolute: the PiP document has no useful base URL. */
export const miniTasksUrl = (origin: string = window.location.origin): string =>
  `${origin}/#tasks?embed=tasks`;

/**
 * Who is signed in is kept per window (sessionStorage), and a Picture-in-Picture
 * window is a new one, so it would open on the login screen. Hand it the opener's
 * identity before the frame loads. A `window.open` popup needs none of this: the
 * browser copies the opener's sessionStorage into it.
 */
const SESSION_KEYS = ["crm_current_user_rbac"];
const seedSession = (frame: HTMLIFrameElement): void => {
  try {
    const target = frame.contentWindow?.sessionStorage;
    if (!target) return;
    for (const key of SESSION_KEYS) {
      const value = window.sessionStorage.getItem(key);
      if (value !== null) target.setItem(key, value);
    }
  } catch {
    /* the frame then shows the login screen, which is still usable */
  }
};

const openFramedPip = async (api: PipApi, url: string): Promise<boolean> => {
  // One mini window at a time: a second click brings the first one forward.
  if (api.window && !api.window.closed) {
    api.window.focus?.();
    return true;
  }
  const pip = await api.requestWindow({ width: WIDTH, height: HEIGHT });
  const doc = pip.document;
  doc.title = "CCRM — My tasks";

  const style = doc.createElement("style");
  style.textContent =
    "html,body{margin:0;height:100%;overflow:hidden;background:#f8fafc}" +
    "iframe{display:block;border:0;width:100%;height:100%}";
  doc.head.appendChild(style);

  const frame = doc.createElement("iframe");
  frame.title = "CCRM — My tasks";
  // Same origin already inherits these; stating them keeps voice tasks working.
  frame.allow = "microphone; clipboard-write";
  doc.body.appendChild(frame);
  seedSession(frame);
  frame.src = url;
  return true;
};

const openPopup = (url: string): boolean => {
  const left = Math.max(0, (window.screenX || 0) + (window.outerWidth || 0) - WIDTH - 24);
  const top = Math.max(0, (window.screenY || 0) + 80);
  const features = `popup=yes,width=${WIDTH},height=${HEIGHT},left=${left},top=${top}`;
  const win = window.open(url, POPUP_NAME, features);
  if (!win) return false;
  win.focus?.();
  return true;
};

/** Must run from a click: both APIs require a user gesture. */
export const openTasksMiniWindow = async (): Promise<PopOutResult> => {
  const url = miniTasksUrl();
  const api = pipApi();
  if (api) {
    try {
      if (await openFramedPip(api, url)) return "pip";
    } catch {
      /* the user closed it at once, or the browser refused: use the popup */
    }
  }
  return openPopup(url) ? "popup" : "blocked";
};
