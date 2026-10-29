import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, MessageCircle, RotateCw, Settings as SettingsIcon, UserX } from "lucide-react";
import {
  embedFrameUrl,
  embedOrigin,
  parseWaaiMessage,
  routeFromWaaiPath,
  waaiPathFromRoute,
  type EmbedState,
} from "../utils/waaiEmbed";

/**
 * The WhatsApp module: the full WAAI app in a frame, signed in as the matching WAAI user
 * (docs/WAAI-INTEGRATION.md §4.7). The page that loads in the frame says `waai:ready`; this view answers with a
 * one-time sign-in token from `api/waai_sso.php` (or, when WAAI already knows the user, just the path to open),
 * then keeps the two in step: the address bar follows the chat, the sidebar badge follows the unread count, and
 * the frame follows the CRM's theme and language.
 *
 * The frame stays mounted, hidden, once the module has been opened, so coming back is instant and the badge
 * stays live. Every message is checked against the frame's origin and window before it is believed.
 */

interface Props {
  /** The route is `whatsapp…`; false while another module is showing (the frame stays alive, hidden). */
  active: boolean;
  route: string;
  params: URLSearchParams;
  language: "en" | "sk" | "hu";
  currentUserId: string;
  onUnread: (chats: number) => void;
  /** WAAI asked for a CRM record (`waai:open-crm`). */
  onOpenRecord: (kind: "lead" | "project" | "task", id: string) => void;
}

interface Config {
  embedUrl: string;
  canManage: boolean;
}

const READY_TIMEOUT_MS = 25_000;

const card = "glass-panel w-full max-w-lg rounded-3xl border border-white/60 bg-white/95 shadow-glass p-10 flex flex-col items-center text-center select-none";

export const WhatsAppView: React.FC<Props> = ({ active, route, params, language, currentUserId, onUnread, onOpenRecord }) => {
  const t = useCallback(
    (en: string, sk: string, hu: string) => (language === "sk" ? sk : language === "hu" ? hu : en),
    [language],
  );

  const [state, setState] = useState<EmbedState>("loading");
  const [config, setConfig] = useState<Config | null>(null);
  const [attempt, setAttempt] = useState(0);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const readySeen = useRef(false);
  const lastPath = useRef<string | null>(null);
  const activeRef = useRef(active);
  const callbacks = useRef({ onUnread, onOpenRecord });

  useEffect(() => {
    activeRef.current = active;
    callbacks.current = { onUnread, onOpenRecord };
  });

  // Where the module is configured, once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/waai_sso.php", { credentials: "same-origin", cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && body?.success && body.configured && typeof body.embed_url === "string" && embedOrigin(body.embed_url)) {
          setConfig({ embedUrl: body.embed_url, canManage: Boolean(body.can_manage) });
          setState("loading");
        } else if (res.ok && body?.success) {
          setConfig({ embedUrl: "", canManage: Boolean(body.can_manage) });
          setState("not_configured");
        } else {
          setState("error");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const origin = config?.embedUrl ? embedOrigin(config.embedUrl) : null;

  // The page the frame is first loaded at. Fixed for the life of the frame: later moves are messages, because a
  // changed `src` would reload WAAI.
  const [firstPath] = useState(() => waaiPathFromRoute(route, params));
  const frameSrc = useMemo(
    () => (origin && config ? embedFrameUrl(config.embedUrl, firstPath) : null),
    [origin, config, firstPath],
  );

  const post = useCallback(
    (message: Record<string, unknown>) => {
      const target = frameRef.current?.contentWindow;
      if (target && origin) target.postMessage(message, origin);
    },
    [origin],
  );

  const sendAppearance = useCallback(() => {
    const root = document.documentElement;
    post({ type: "ccrm:appearance", theme: root.classList.contains("dark") ? "dark" : "light", locale: language });
  }, [post, language]);

  // Theme and language follow the CRM, live.
  useEffect(() => {
    if (!readySeen.current) return;
    sendAppearance();
  }, [sendAppearance]);
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (readySeen.current) sendAppearance();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => observer.disconnect();
  }, [sendAppearance]);

  // Messages from the frame.
  useEffect(() => {
    if (!origin || !frameSrc) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    readySeen.current = false;
    timer = setTimeout(() => {
      if (!readySeen.current) setState("error");
    }, READY_TIMEOUT_MS);

    async function signIn() {
      try {
        const res = await fetch("/api/waai_sso.php", { method: "POST", credentials: "same-origin", cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (res.ok && body?.success && typeof body.token === "string") {
          post({ type: "ccrm:sso", token: body.token });
          // The page that comes up after the sign-in reports its route; if it never does, say so.
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => setState((s) => (s === "ready" ? s : "error")), READY_TIMEOUT_MS);
        } else {
          setState(res.status === 409 ? "not_configured" : "error");
        }
      } catch {
        setState("error");
      }
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== origin || event.source !== frameRef.current?.contentWindow) return;
      const msg = parseWaaiMessage(event.data);
      if (!msg) return;

      if (msg.type === "waai:ready") {
        readySeen.current = true;
        if (timer) clearTimeout(timer);
        sendAppearance();
        if (msg.authed && msg.userCrmId === currentUserId) {
          // Already signed in as this person: nothing to trade, just open the page asked for.
          post({ type: "ccrm:navigate", path: lastPath.current ?? firstPath });
          setState("ready");
        } else {
          void signIn();
        }
        return;
      }
      if (msg.type === "waai:route") {
        lastPath.current = msg.path;
        setState((s) => (s === "loading" ? "ready" : s));
        // Only the visible module owns the address bar.
        const next = routeFromWaaiPath(msg.path);
        if (activeRef.current && next !== null && window.location.hash !== `#${next}`) {
          window.history.replaceState(null, "", `#${next}`);
        }
        return;
      }
      if (msg.type === "waai:unread") {
        callbacks.current.onUnread(msg.chats);
        return;
      }
      if (msg.type === "waai:open-crm") {
        callbacks.current.onOpenRecord(msg.kind, msg.id);
        return;
      }
      if (msg.type === "waai:error") {
        setState(msg.code === "not_linked" ? "not_linked" : "error");
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (timer) clearTimeout(timer);
    };
  }, [origin, frameSrc, attempt, currentUserId, firstPath, post, sendAppearance]);

  // A link into the module (a chat from a client, a task's "Open chat") or the back button: move the frame.
  const wanted = waaiPathFromRoute(route, params);
  const bare = route.toLowerCase() === "whatsapp" && params.toString() === "";
  useEffect(() => {
    if (!active || !readySeen.current) return;
    if (bare) {
      // The sidebar item: come back to where the frame was, not to the chat list.
      const here = lastPath.current ? routeFromWaaiPath(lastPath.current) : null;
      if (here && here !== "whatsapp" && window.location.hash !== `#${here}`) {
        window.history.replaceState(null, "", `#${here}`);
      }
      return;
    }
    if (wanted !== lastPath.current) {
      lastPath.current = wanted;
      post({ type: "ccrm:navigate", path: wanted });
    }
  }, [active, bare, wanted, post]);

  const retry = () => {
    setState("loading");
    setAttempt((n) => n + 1);
  };

  const showFrame = frameSrc !== null && (state === "loading" || state === "ready");

  return (
    <div className={active ? "flex-1 min-h-[28rem] flex flex-col" : "hidden"}>
      {showFrame && (
        <div className="relative flex-1 min-h-[28rem]">
          <iframe
            key={attempt}
            ref={frameRef}
            src={frameSrc ?? undefined}
            title={t("WhatsApp", "WhatsApp", "WhatsApp")}
            allow="microphone; camera; clipboard-read; clipboard-write; autoplay; fullscreen"
            referrerPolicy="strict-origin"
            className="absolute inset-0 h-full w-full rounded-2xl border border-slate-200 bg-white"
          />
          {state === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80" role="status">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-400" aria-hidden />
              <span className="sr-only">{t("Opening WhatsApp…", "Otváram WhatsApp…", "WhatsApp megnyitása…")}</span>
            </div>
          )}
        </div>
      )}

      {!showFrame && (
        <div className="flex-1 min-h-[60vh] flex items-center justify-center animate-in fade-in duration-300">
          <div className={card}>
            {state === "loading" && <Loader2 className="h-8 w-8 animate-spin text-indigo-400" aria-hidden />}

            {state === "not_configured" && (
              <>
                <div className="h-16 w-16 rounded-2xl bg-slate-50 border border-slate-100 text-slate-500 flex items-center justify-center mb-6 shadow-sm">
                  <MessageCircle className="h-8 w-8" />
                </div>
                <h2 className="text-title font-heading font-bold text-slate-800">
                  {t("WhatsApp is not connected yet", "WhatsApp ešte nie je pripojený", "A WhatsApp még nincs csatlakoztatva")}
                </h2>
                <p className="mt-3 text-body text-slate-500 font-medium leading-relaxed max-w-sm">
                  {config?.canManage
                    ? t(
                        "Enter the WAAI address and create the sign-in secret in Settings → Integrations → WhatsApp (WAAI).",
                        "Zadajte adresu WAAI a vytvorte prihlasovací kľúč v Nastavenia → Integrácie → WhatsApp (WAAI).",
                        "Adja meg a WAAI címét, és hozza létre a belépési kulcsot a Beállítások → Integrációk → WhatsApp (WAAI) részben.",
                      )
                    : t(
                        "Ask an administrator to connect it.",
                        "Požiadajte administrátora, aby ho pripojil.",
                        "Kérjen meg egy adminisztrátort a csatlakoztatására.",
                      )}
                </p>
                {config?.canManage && (
                  <a
                    href="#settings/integrations/waai"
                    className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-ui font-bold shadow-sm hover:bg-indigo-700 transition active:scale-95"
                  >
                    <SettingsIcon className="h-4 w-4" />
                    {t("Open the settings", "Otvoriť nastavenia", "Beállítások megnyitása")}
                  </a>
                )}
              </>
            )}

            {state === "not_linked" && (
              <>
                <div className="h-16 w-16 rounded-2xl bg-amber-50 border border-amber-100 text-amber-500 flex items-center justify-center mb-6 shadow-sm">
                  <UserX className="h-8 w-8" />
                </div>
                <h2 className="text-title font-heading font-bold text-slate-800">
                  {t("Your account is not linked to WAAI", "Váš účet nie je prepojený s WAAI", "A fiókja nincs összekapcsolva a WAAI-val")}
                </h2>
                <p className="mt-3 text-body text-slate-500 font-medium leading-relaxed max-w-sm">
                  {t(
                    "Ask the WAAI administrator to link your CRM user in WAAI → Settings → CRM.",
                    "Požiadajte správcu WAAI, aby prepojil vášho používateľa CRM v WAAI → Nastavenia → CRM.",
                    "Kérje meg a WAAI adminisztrátorát, hogy kösse össze a CRM-felhasználóját a WAAI → Beállítások → CRM részben.",
                  )}
                </p>
              </>
            )}

            {state === "error" && (
              <>
                <div className="h-16 w-16 rounded-2xl bg-rose-50 border border-rose-100 text-rose-500 flex items-center justify-center mb-6 shadow-sm">
                  <AlertTriangle className="h-8 w-8" />
                </div>
                <h2 className="text-title font-heading font-bold text-slate-800">
                  {t("WhatsApp did not open", "WhatsApp sa neotvoril", "A WhatsApp nem nyílt meg")}
                </h2>
                <p className="mt-3 text-body text-slate-500 font-medium leading-relaxed max-w-sm">
                  {t(
                    "WAAI did not answer, or it is not reachable from this address. Try again, or open it in its own tab.",
                    "WAAI neodpovedá alebo nie je dostupná z tejto adresy. Skúste znova alebo ju otvorte vo vlastnej karte.",
                    "A WAAI nem válaszol, vagy erről a címről nem érhető el. Próbálja újra, vagy nyissa meg külön lapon.",
                  )}
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={retry}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-ui font-bold shadow-sm hover:bg-indigo-700 transition active:scale-95"
                  >
                    <RotateCw className="h-4 w-4" />
                    {t("Try again", "Skúsiť znova", "Újra")}
                  </button>
                  {config?.embedUrl && (
                    <a
                      href={config.embedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-ui font-bold hover:bg-slate-50 transition active:scale-95"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {t("Open WhatsApp in a new tab", "Otvoriť WhatsApp v novej karte", "WhatsApp megnyitása új lapon")}
                    </a>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppView;
