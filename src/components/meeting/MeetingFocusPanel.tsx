import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowDown, Captions, ChevronDown, Loader2, RotateCw, Sparkles, X } from "lucide-react";
import { cn } from "../../utils/cn";
import type { LiveError, LiveStatus } from "../../hooks/useLiveTranscription";
import type { LiveDocument } from "../../hooks/useLiveDocument";
import {
  catchUpText,
  formatClock,
  recentSegmentIds,
  speakerDisplayName,
  visibleSegments,
  type LiveSegment,
} from "../../utils/liveTranscript";
import { liveTailGroups } from "../../utils/focusPanel";
import { Markdown } from "../../utils/markdown";
import { SpeakerChip } from "./SpeakerChip";

type Lang = "en" | "sk" | "hu";
type RecState = "idle" | "recording" | "paused" | "stopped" | "none";

interface Props {
  lang: Lang;
  status: LiveStatus;
  error: LiveError | null;
  segments: LiveSegment[];
  recordingState: RecState;
  /** Elapsed recording seconds (pause-aware). */
  elapsedSec: number;
  onRetry: () => void;
  /** The official transcription of the saved file failed: offer the live text instead. */
  officialFailed: boolean;
  onUseLive: () => void;
  /** "openai" has no speaker recognition; null until the server answered (and again after Stop). */
  provider: "openai" | "soniox" | null;
  liveDocument: LiveDocument;
  speakerNames: Record<string, string>;
  /** An empty name resets the speaker to the default. */
  onRenameSpeaker: (speakerId: string, name: string) => void;
  /** Per-user suffix for the remembered Document | Transcript choice. */
  userKey: string;
}

type View = "document" | "transcript";

const RECENT_SEC = 30;
const CATCH_UP_SEC = 120;
const NEAR_BOTTOM_PX = 56;

/**
 * Glanceable live transcript for someone who lost the thread. Large text, newest at the bottom,
 * the last 30 seconds set apart, and a "Catch me up" recap. It sits in the page flow, sticky,
 * and folds down to a single line of the latest words (phones, or when it is in the way).
 */
export const MeetingFocusPanel: React.FC<Props> = ({
  lang,
  status,
  error,
  segments,
  recordingState,
  elapsedSec,
  onRetry,
  officialFailed,
  onUseLive,
  provider,
  liveDocument,
  speakerNames,
  onRenameSpeaker,
  userKey,
}) => {
  const t = (en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);

  const viewKey = `ccrm_focus_view:${userKey}`;
  const [view, setViewState] = useState<View>(() => {
    try { return localStorage.getItem(viewKey) === "transcript" ? "transcript" : "document"; } catch { return "document"; }
  });
  const setView = (v: View) => {
    setViewState(v);
    try { localStorage.setItem(viewKey, v); } catch { /* private mode */ }
  };

  // The provider goes back to null after Stop; remember the last answer so the hint does not flicker.
  const lastProvider = useRef<"openai" | "soniox" | null>(null);
  if (provider) lastProvider.current = provider;
  const noSpeakers = (provider ?? lastProvider.current) === "openai";

  const nameOf = useCallback((id: string) => speakerDisplayName(id, speakerNames, lang), [speakerNames, lang]);
  const chip = (id: string) => (
    <SpeakerChip speakerId={id} name={nameOf(id)} onRename={onRenameSpeaker} lang={lang} />
  );

  const { sections, pendingIds } = liveDocument;
  const tail = useMemo(() => liveTailGroups(segments, pendingIds), [segments, pendingIds]);
  const docEmpty = sections.length === 0 && tail.length === 0;
  const docSignature = `${sections.length}:${sections.reduce((n, x) => n + x.markdown.length, 0)}:${tail.length}:${tail[tail.length - 1]?.text.length ?? 0}`;

  const [collapsed, setCollapsed] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo(() => visibleSegments(segments), [segments]);
  const recentIds = recentSegmentIds(segments, elapsedSec, RECENT_SEC);
  const firstRecentAt = rows.findIndex((s) => recentIds.has(s.id));
  const latest = rows.length ? rows[rows.length - 1] : null;
  const tailSignature = `${view}:${latest ? `${rows.length}:${latest.text.length}` : "0"}:${docSignature}`;

  const reducedMotion = () =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Follow the newest words, unless the reader scrolled up to re-read something.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [tailSignature, collapsed]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (near !== atBottomRef.current) {
      atBottomRef.current = near;
      setAtBottom(near);
    }
  };

  const jumpToLive = () => {
    const el = scrollerRef.current;
    if (!el) return;
    atBottomRef.current = true;
    setAtBottom(true);
    el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" });
  };

  // "Catch me up": a 2-3 bullet recap of roughly the last two minutes.
  const [recap, setRecap] = useState<{ loading: boolean; bullets: string[]; failed: boolean; detail?: string } | null>(null);
  const catchMeUp = async () => {
    const text = catchUpText(segments, elapsedSec, CATCH_UP_SEC, nameOf);
    if (!text.trim()) return;
    setRecap({ loading: true, bullets: [], failed: false });
    try {
      const res = await fetch("/api/live_transcription_session.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "catch_up", text, language: lang }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success || !Array.isArray(data.bullets)) {
        throw new Error(data?.message || `HTTP ${res.status}`);
      }
      setRecap({ loading: false, bullets: data.bullets.map(String), failed: false });
    } catch (e: any) {
      // The sentence shown is translated here; the server's own text stays in the tooltip.
      setRecap({ loading: false, bullets: [], failed: true, detail: e?.message || String(e) });
    }
  };

  const running = recordingState === "recording";
  const statusLabel =
    status === "error"
      ? t("Interrupted", "Prerušené", "Megszakadt")
      : status === "connecting"
        ? t("Connecting", "Pripája sa", "Csatlakozás")
        : status === "reconnecting"
          ? t("Reconnecting…", "Znovu sa pripája…", "Újracsatlakozás…")
          : status === "live" && running
            ? t("Live", "Naživo", "Élő")
            : recordingState === "paused"
              ? t("Paused", "Pozastavené", "Szünetel")
              : recordingState === "stopped"
                ? t("Draft", "Koncept", "Piszkozat")
                : t("Waiting", "Čaká", "Várakozik");

  const errorText = (code: LiveError["code"]): string => {
    switch (code) {
      case "unsupported":
        return t("This browser cannot open a live transcript.", "Tento prehliadač nevie otvoriť živý prepis.", "Ez a böngésző nem tudja megnyitni az élő átiratot.");
      case "mic_analyser":
        return t("The microphone could not be analysed.", "Mikrofón sa nepodarilo analyzovať.", "A mikrofont nem sikerült elemezni.");
      case "connect":
        return t("Could not connect.", "Nepodarilo sa pripojiť.", "Nem sikerült csatlakozni.");
      case "dropped":
        return t("The connection kept dropping.", "Spojenie sa opakovane prerušilo.", "A kapcsolat többször megszakadt.");
      default:
        return t("The service reported an error.", "Služba nahlásila chybu.", "A szolgáltatás hibát jelzett.");
    }
  };

  const dot =
    status === "live" && running
      ? "bg-rose-500 animate-pulse"
      : status === "error"
        ? "bg-amber-500"
        : status === "reconnecting"
          ? "bg-slate-400 animate-pulse"
          : "bg-slate-300";

  return (
    <section
      aria-label={t("Focus helper", "Pomocník sústredenia", "Fókuszsegéd")}
      className="sticky top-2 z-20 w-full max-w-212.5 mb-6 rounded-2xl border border-slate-200 bg-white shadow-md animate-fade-in motion-reduce:animate-none"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 ws-sm:px-4">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer rounded-lg"
          title={collapsed ? t("Show", "Zobraziť", "Megjelenítés") : t("Fold away", "Zbaliť", "Összecsukás")}
        >
          <Captions className="size-4 text-indigo-600 shrink-0" />
          <span className="type-card-title text-slate-800 truncate">
            {t("Focus helper", "Pomocník sústredenia", "Fókuszsegéd")}
          </span>
          <span className="flex items-center gap-1.5 text-micro font-semibold uppercase text-slate-500 shrink-0">
            <span className={cn("size-2 rounded-full", dot)} />
            {statusLabel}
          </span>
          <ChevronDown
            className={cn("size-4 text-slate-400 shrink-0 ml-auto transition-transform duration-200", collapsed && "-rotate-90")}
          />
        </button>
        <div
          role="group"
          aria-label={t("View", "Zobrazenie", "Nézet")}
          className="flex shrink-0 rounded-xl bg-slate-100 p-0.5"
        >
          {(["document", "transcript"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                "px-2.5 h-7 rounded-[10px] text-caption font-semibold cursor-pointer transition-all duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 motion-reduce:transition-none motion-reduce:active:scale-100",
                view === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/60",
              )}
            >
              {v === "document" ? t("Document", "Dokument", "Dokumentum") : t("Transcript", "Prepis", "Átirat")}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={catchMeUp}
          disabled={!rows.length || recap?.loading}
          className="px-3 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 disabled:text-slate-400 text-white text-caption font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer transition-all active:scale-95 disabled:cursor-default"
        >
          {recap?.loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {t("Catch me up", "Zhrň mi to", "Foglald össze")}
        </button>
      </div>

      {/* Collapsed: just the newest line, so a glance still works */}
      {collapsed && (
        <p className="px-4 pb-3 text-body text-slate-600 line-clamp-2">
          {latest?.speaker && chip(latest.speaker)}
          {latest ? latest.text : t("Waiting for speech…", "Čaká sa na reč…", "Beszédre várakozás…")}
        </p>
      )}

      {!collapsed && (
        <>
          {recap && (
            <div className="mx-3 ws-sm:mx-4 mb-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 animate-fade-in motion-reduce:animate-none">
              <div className="flex items-center justify-between gap-2">
                <span className="type-overline text-indigo-700">
                  {t("Last 2 minutes", "Posledné 2 minúty", "Az utolsó 2 perc")}
                </span>
                <button
                  type="button"
                  onClick={() => setRecap(null)}
                  className="p-1 -m-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  title={t("Dismiss", "Zavrieť", "Bezárás")}
                >
                  <X className="size-3.5" />
                </button>
              </div>
              {recap.loading && (
                <p className="text-body text-slate-500 mt-1">{t("Summarising…", "Zhrňujem…", "Összefoglalás…")}</p>
              )}
              {recap.failed && (
                <p className="text-ui text-rose-600 mt-1" title={recap.detail}>
                  {t("The recap failed. Try again.", "Zhrnutie zlyhalo. Skúste znova.", "Az összefoglaló sikertelen. Próbálja újra.")}
                </p>
              )}
              {recap.bullets.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {recap.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-body text-slate-800">
                      <span className="mt-2 size-1.5 rounded-full bg-indigo-400 shrink-0" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Feed. Fixed height so new words never push the notes below around. */}
          <div className="relative">
            <div
              ref={scrollerRef}
              onScroll={onScroll}
              className="h-56 ws-md:h-72 overflow-y-auto overscroll-contain px-3 ws-sm:px-4 pb-3 space-y-2"
              aria-live="off"
            >
              {(view === "transcript" ? rows.length === 0 : docEmpty) && status !== "error" && (
                <p className="text-body text-slate-400 pt-2">
                  {status === "connecting" || status === "reconnecting"
                    ? t("Connecting to the live transcript…", "Pripájam živý prepis…", "Élő átirat csatlakoztatása…")
                    : recordingState === "paused"
                      ? t(
                          "Recording is paused, so the live transcript is too.",
                          "Nahrávanie je pozastavené, preto aj živý prepis.",
                          "A felvétel szünetel, ezért az élő átirat is.",
                        )
                      : t(
                          "Words appear here as people speak.",
                          "Slová sa tu zobrazia, ako ľudia hovoria.",
                          "A szavak itt jelennek meg, ahogy a résztvevők beszélnek.",
                        )}
                </p>
              )}

              {view === "document" && (
                <>
                  {sections.map((sec, i) => {
                    const open = !sec.closed && i === sections.length - 1;
                    return (
                      <div
                        key={sec.id}
                        className={cn(
                          "relative text-slate-700 [&_h2]:text-title-sm [&_h2]:font-bold [&_h2]:mt-0 [&_h3]:normal-case [&_h3]:tracking-normal [&_h3]:text-ui [&_h3]:font-semibold [&_p]:text-body [&_li]:text-body [&_li]:font-normal [&_blockquote]:text-body",
                          open && "border-l-2 border-indigo-400 pl-3",
                        )}
                      >
                        <Markdown content={sec.markdown} className="space-y-1" renderSpeaker={chip} />
                        {/* Under the section, with its line always reserved: it never covers a long
                            heading and never moves the text when it comes and goes. */}
                        {open && (
                          <span
                            className={cn(
                              "block mt-1 type-overline text-indigo-500",
                              liveDocument.status === "updating" ? "motion-safe:animate-pulse" : "invisible",
                            )}
                            aria-hidden
                          >
                            {t("Updating…", "Aktualizujem…", "Frissítés…")}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {tail.length > 0 && (
                    <div className="pt-1 space-y-1.5">
                      <div className="flex items-center gap-2" aria-hidden>
                        <span className="h-px flex-1 bg-slate-200" />
                        <span className="type-overline text-slate-400">{t("Now speaking", "Práve sa hovorí", "Most beszél")}</span>
                        <span className="h-px flex-1 bg-slate-200" />
                      </div>
                      {tail.map((g) => (
                        <p
                          key={g.ids[0]}
                          className={cn("text-body leading-snug break-words", g.inProgress ? "text-slate-400" : "text-slate-500")}
                        >
                          {g.speaker && chip(g.speaker)}
                          {g.text}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}

              {view === "transcript" && rows.map((s, i) => {
                const recent = recentIds.has(s.id);
                return (
                  <React.Fragment key={s.id}>
                    {i === firstRecentAt && i > 0 && (
                      <div className="flex items-center gap-2 pt-1" aria-hidden>
                        <span className="h-px flex-1 bg-indigo-200" />
                        <span className="type-overline text-indigo-500">{t("Last 30 s", "Posledných 30 s", "Utolsó 30 mp")}</span>
                        <span className="h-px flex-1 bg-indigo-200" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "flex gap-3 rounded-xl px-2.5 py-1.5 animate-fade-in motion-reduce:animate-none",
                        recent ? "bg-indigo-50/70 border-l-2 border-indigo-400" : "border-l-2 border-transparent",
                      )}
                    >
                      <span className="type-meta text-slate-400 tabular-nums pt-1 shrink-0 w-11">{formatClock(s.startSec)}</span>
                      <p
                        className={cn(
                          "text-title-sm leading-snug min-w-0 break-words",
                          !s.final ? "text-slate-400" : recent ? "text-slate-900 font-medium" : "text-slate-500",
                        )}
                      >
                        {s.speaker && s.speaker !== rows[i - 1]?.speaker && chip(s.speaker)}
                        {s.text.trim()}
                      </p>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            {!atBottom && (view === "transcript" ? rows.length > 0 : !docEmpty) && (
              <button
                type="button"
                onClick={jumpToLive}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 h-8 rounded-full bg-slate-800 hover:bg-slate-900 text-white text-caption font-semibold flex items-center gap-1.5 shadow-lg cursor-pointer animate-fade-in motion-reduce:animate-none"
              >
                <ArrowDown className="size-3.5" />
                {t("Jump to live", "Na aktuálne", "Ugrás az élőhöz")}
              </button>
            )}
          </div>

          {/* Quiet inline error: the recording itself is unaffected. */}
          {status === "error" && (
            <div className="mx-3 ws-sm:mx-4 mb-2 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
              <AlertCircle className="size-4 text-amber-600 shrink-0" />
              <p className="text-ui text-amber-800 min-w-0 flex-1" title={error?.detail}>
                {t("Live transcript paused", "Živý prepis je prerušený", "Az élő átirat megszakadt")}
                {error ? ` – ${errorText(error.code)}` : "."}{" "}
                {recordingState === "recording" || recordingState === "paused"
                  ? t("The recording continues.", "Nahrávanie pokračuje.", "A felvétel folytatódik.")
                  : ""}
              </p>
              {(recordingState === "recording" || recordingState === "paused") && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="px-2.5 h-8 rounded-lg bg-white border border-amber-300 text-amber-800 text-caption font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer hover:bg-amber-100"
                >
                  <RotateCw className="size-3.5" />
                  {t("Retry", "Skúsiť znova", "Újra")}
                </button>
              )}
            </div>
          )}

          {/* The document is a nicety: say so quietly, the transcript carries on. */}
          {liveDocument.status === "error" && (
            <p className="mx-3 ws-sm:mx-4 mb-2 type-meta text-slate-500" title={liveDocument.errorDetail}>
              {t(
                "The document is not updating; the transcript continues.",
                "Dokument sa neaktualizuje, prepis pokračuje.",
                "A dokumentum nem frissül, az átirat folytatódik.",
              )}
            </p>
          )}

          {/* After Stop: the official pass failed, the live text is all there is. */}
          {officialFailed && rows.length > 0 && (
            <div className="mx-3 ws-sm:mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
              <p className="text-ui text-slate-600 min-w-0 flex-1">
                {t(
                  "The official transcription failed. You can keep the live text as a draft.",
                  "Oficiálny prepis zlyhal. Živý text si môžete ponechať ako koncept.",
                  "A hivatalos átírás sikertelen volt. Az élő szöveget piszkozatként megtarthatja.",
                )}
              </p>
              <button
                type="button"
                onClick={onUseLive}
                className="px-3 h-8 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-caption font-semibold shrink-0 cursor-pointer"
              >
                {t("Use live transcript", "Použiť živý prepis", "Élő átirat használata")}
              </button>
            </div>
          )}

          <p className="px-4 pb-3 type-meta text-slate-400">
            {t(
              "Live draft for orientation. The official transcript is created after you stop.",
              "Živý koncept na orientáciu. Oficiálny prepis vznikne po zastavení.",
              "Élő piszkozat tájékozódáshoz. A hivatalos átirat a leállítás után készül.",
            )}
            {noSpeakers && (
              <>
                {" "}
                {t(
                  "Speakers are not told apart without a Soniox key (Settings → AI).",
                  "Bez kľúča Soniox sa hovoriaci nerozlišujú (Nastavenia → AI).",
                  "Soniox kulcs nélkül a beszélők nem különülnek el (Beállítások → AI).",
                )}
              </>
            )}
          </p>
        </>
      )}
    </section>
  );
};
