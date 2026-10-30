import { useMemo, type ReactNode } from "react";
import { AlertCircle, Calendar, Globe, Loader2, Pause, Play, RefreshCw, Volume2 } from "lucide-react";
import type { SummaryLanguage } from "../../api/contract.ts";
import type { WaaiClient } from "../../api/waaiClient.ts";
import { chatSummaryWindows, defaultChatSummaryWindow } from "../../digest/digestWindows.ts";
import { AiMarkdown } from "../../home/AiMarkdown.tsx";
import { useChatSummary } from "../../hooks/useChatSummary.ts";
import { getPanelI18n } from "./panelI18n.ts";

interface Props {
  client: WaaiClient;
  conversationId: string;
  language?: string;
  active?: boolean;
  /** ISO time of the chat's latest message: decides which windows are offered and which one opens. */
  lastMessageAt?: string | null;
  /** The chat's tasks, shown under the recap where WAAI shows its tasks section. */
  tasks?: ReactNode;
  className?: string;
}

const SPEEDS = [1, 1.25, 1.5, 2];

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function minutesAgo(createdAt: string): number {
  return Math.max(1, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
}

const pill = "type-meta inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 transition-colors hover:bg-slate-50";

/**
 * A chat's AI view, arranged as WAAI arranges it (components/summary-panel.tsx): time-window pills, the
 * summary with a Listen control, the tasks, then Regenerate and when the recap was written. It opens by itself
 * and writes the recap when none is stored.
 */
export const SummaryPanel = ({ client, conversationId, language = "en", active = true, lastMessageAt, tasks, className = "" }: Props) => {
  const t = getPanelI18n(language).summary;

  const initialLang: SummaryLanguage = language.slice(0, 2) === "sk" ? "sk" : language.slice(0, 2) === "hu" ? "hu" : "en";
  const windows = useMemo(() => chatSummaryWindows(lastMessageAt), [lastMessageAt]);

  const {
    windowKey,
    setWindowKey,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    customValid,
    language: summaryLang,
    setLanguage: setSummaryLang,
    summary,
    partialNarrative,
    messageCount,
    loading,
    streaming,
    error,
    generateSummary,
    audioUrl,
    audioPlaying,
    audioLoading,
    audioCurrentTime,
    audioDuration,
    audioSpeed,
    toggleAudio,
    setAudioSpeed,
    seekAudio,
  } = useChatSummary({
    client,
    conversationId,
    active,
    initialLanguage: initialLang,
    initialWindow: defaultChatSummaryWindow(lastMessageAt),
  });

  const narrativeText = summary?.narrative || partialNarrative;
  const started = audioPlaying || audioCurrentTime > 0;

  return (
    <div role="region" aria-label={t.title} data-testid="wa-ai-view" className={`h-full w-full overflow-y-auto px-4 py-4 md:px-6 ${className}`}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {/* Time-window pills */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {windows.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setWindowKey(key)}
                className={`type-meta cursor-pointer rounded-xl px-3 py-1.5 font-semibold transition-all duration-150 ${
                  windowKey === key ? "bg-green-600 text-white shadow-xs" : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {t.windows[key]}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1" title={t.language}>
            <Globe className="size-3.5 text-slate-400" aria-hidden />
            {(["en", "sk", "hu"] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setSummaryLang(code)}
                className={`type-meta cursor-pointer rounded-lg px-2 py-0.5 font-medium transition-all ${
                  summaryLang === code ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {windowKey === "custom" && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <Calendar className="size-4 text-slate-400" />
            <label className="type-meta inline-flex items-center gap-1.5 text-slate-600">
              <span>{t.from}</span>
              <input
                type="datetime-local"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="type-meta rounded-xl border border-slate-200 bg-white px-2 py-1 text-slate-800 focus:border-green-600 focus:outline-none"
              />
            </label>
            <span className="text-slate-400">→</span>
            <label className="type-meta inline-flex items-center gap-1.5 text-slate-600">
              <span>{t.to}</span>
              <input
                type="datetime-local"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="type-meta rounded-xl border border-slate-200 bg-white px-2 py-1 text-slate-800 focus:border-green-600 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void generateSummary(false)}
              disabled={!customValid || streaming}
              className="type-meta ml-auto cursor-pointer rounded-full bg-green-600 px-3 py-1 font-bold text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {streaming ? t.generating : t.generate}
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="type-body">{error}</p>
          </div>
        )}

        {/* Summary on top */}
        <div>
          <div className="flex items-center justify-between gap-2 pb-2">
            <h3 className="type-overline text-slate-500">{t.title}</h3>
            {audioUrl && summary?.narrative ? (
              <button type="button" onClick={toggleAudio} disabled={audioLoading} className={pill}>
                {audioLoading ? <Loader2 className="size-3.5 animate-spin" /> : audioPlaying ? <Pause className="size-3.5" /> : <Volume2 className="size-3.5" />}
                {audioLoading ? t.loadingAudio : audioPlaying ? t.pause : t.listen}
              </button>
            ) : null}
          </div>

          {audioUrl && started && (
            <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-green-200 bg-green-50/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleAudio}
                    aria-label={audioPlaying ? t.pause : t.listen}
                    className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-green-600 text-white shadow-xs transition-transform hover:bg-green-500 active:scale-95"
                  >
                    {audioPlaying ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
                  </button>
                  <p className="type-meta text-slate-500">
                    {formatTime(audioCurrentTime)} / {formatTime(audioDuration)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {SPEEDS.map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => setAudioSpeed(sp)}
                      className={`type-meta cursor-pointer rounded-md px-1.5 py-0.5 font-semibold ${audioSpeed === sp ? "bg-green-700 text-white" : "text-green-800 hover:bg-green-100"}`}
                    >
                      {sp}x
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={audioDuration || 1}
                step={0.1}
                value={audioCurrentTime}
                onChange={(e) => seekAudio(Number(e.target.value))}
                aria-label="Audio progress"
                className="h-1.5 w-full cursor-pointer rounded-lg bg-green-200 accent-green-600"
              />
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            {narrativeText ? (
              <div>
                <AiMarkdown text={narrativeText} />
                {/* Caret while the recap is still being written. */}
                {streaming && !summary && <span aria-hidden className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-green-600 align-middle" />}
              </div>
            ) : streaming ? (
              <p className="type-body flex items-center gap-2 py-4 text-slate-500">
                <Loader2 className="size-4 animate-spin text-green-600" />
                {t.generating}
              </p>
            ) : loading ? (
              <p className="type-body flex items-center gap-2 py-4 text-slate-500">
                <Loader2 className="size-4 animate-spin text-green-600" />
                {t.loading}
              </p>
            ) : windowKey === "custom" && !customValid ? (
              <p className="type-body text-slate-500">{t.customHint}</p>
            ) : (
              <p className="type-body py-2 text-slate-400">{t.noMessages}</p>
            )}
          </div>
        </div>

        {tasks}

        {/* Regenerate + when it was written */}
        <div className="flex flex-col items-center gap-2 pb-2 pt-1">
          <button
            type="button"
            onClick={() => void generateSummary(true)}
            disabled={streaming || loading || (windowKey === "custom" && !customValid)}
            className={`${pill} disabled:pointer-events-none disabled:opacity-50`}
          >
            <RefreshCw className={`size-3.5 ${streaming ? "animate-spin text-green-600" : ""}`} />
            {t.regenerate}
          </button>
          {summary?.created_at ? <p className="type-meta text-slate-400">{t.cachedAgo(minutesAgo(summary.created_at), messageCount || summary.message_count || 0)}</p> : null}
        </div>
      </div>
    </div>
  );
};
