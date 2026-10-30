import { useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Circle,
  Globe,
  ListTodo,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import type { SummaryLanguage, SummaryWindowKey, TaskDto } from "../../api/contract.ts";
import type { WaaiClient } from "../../api/waaiClient.ts";
import { AiMarkdown } from "../../home/AiMarkdown.tsx";
import { useChatSummary } from "../../hooks/useChatSummary.ts";
import { useChatTasks } from "../../hooks/useChatTasks.ts";
import { getPanelI18n } from "./panelI18n.ts";

interface Props {
  client: WaaiClient;
  conversationId: string;
  language?: string;
  active?: boolean;
  onClose?: () => void;
  onOpenTasks?: () => void;
  senderName?: string;
  className?: string;
}

const WINDOWS: { key: SummaryWindowKey }[] = [
  { key: "today" },
  { key: "d3" },
  { key: "d7" },
  { key: "d30" },
  { key: "recent" },
  { key: "custom" },
];

const SPEEDS = [1, 1.25, 1.5, 2];

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export const SummaryPanel = ({
  client,
  conversationId,
  language = "en",
  active = true,
  onClose,
  onOpenTasks,
  className = "",
}: Props) => {
  const t = getPanelI18n(language).summary;

  const initialLang: SummaryLanguage =
    language.slice(0, 2) === "sk" ? "sk" : language.slice(0, 2) === "hu" ? "hu" : "en";

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
  });

  const { toggleStatus } = useChatTasks({
    client,
    conversationId,
    active: false,
  });

  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);

  const narrativeText = summary?.narrative || partialNarrative;

  const handleTaskToggle = async (task: TaskDto) => {
    setTogglingTaskId(task.id);
    const next = task.status === "completed" ? "open" : "completed";
    try {
      await toggleStatus(task.id, next);
      if (summary) {
        task.status = next;
      }
    } finally {
      setTogglingTaskId(null);
    }
  };

  return (
    <div
      role="region"
      aria-label={t.title}
      className={`flex h-full min-h-0 flex-col overflow-hidden border-l border-slate-200 bg-white ${className}`}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-xl bg-green-50 text-green-700">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h3 className="type-card-title text-slate-800">{t.title}</h3>
            {messageCount > 0 && (
              <p className="type-meta text-slate-500">
                {messageCount} {messageCount === 1 ? "message" : "messages"}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Refresh / Regenerate */}
          <button
            type="button"
            onClick={() => void generateSummary(true)}
            disabled={streaming || loading || (windowKey === "custom" && !customValid)}
            title={t.regenerate}
            aria-label={t.regenerate}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${streaming ? "animate-spin text-green-600" : ""}`} />
          </button>

          {/* Close button */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="cursor-pointer rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Panel Body */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        {/* Controls Bar: Window Selector and Language */}
        <div className="flex flex-col gap-2.5">
          {/* Window Selection Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {WINDOWS.map(({ key }) => (
              <button
                key={key}
                type="button"
                onClick={() => setWindowKey(key)}
                className={`type-meta cursor-pointer rounded-xl px-2.5 py-1 font-semibold transition-all duration-150 ${
                  windowKey === key
                    ? "bg-green-600 text-white shadow-xs"
                    : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {t.windows[key]}
              </button>
            ))}
          </div>

          {/* Custom Date Range Pickers */}
          {windowKey === "custom" && (
            <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-slate-400" />
                <span className="type-meta font-medium text-slate-700">{t.customHint}</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="type-meta flex flex-col gap-1 text-slate-600">
                  <span>{t.from}</span>
                  <input
                    type="datetime-local"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="type-meta rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-slate-800 focus:border-green-600 focus:outline-none"
                  />
                </label>
                <label className="type-meta flex flex-col gap-1 text-slate-600">
                  <span>{t.to}</span>
                  <input
                    type="datetime-local"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="type-meta rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-slate-800 focus:border-green-600 focus:outline-none"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => void generateSummary(false)}
                disabled={!customValid || streaming}
                className="type-meta mt-1 inline-flex cursor-pointer items-center justify-center rounded-xl bg-green-600 px-3 py-1.5 font-bold text-white transition-colors hover:bg-green-500 disabled:opacity-50"
              >
                {streaming ? t.generating : t.generate}
              </button>
            </div>
          )}

          {/* Language Selector */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-2">
            <span className="type-meta inline-flex items-center gap-1 text-slate-500">
              <Globe className="size-3.5 text-slate-400" />
              {t.language}
            </span>
            <div className="flex gap-1">
              {(["en", "sk", "hu"] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setSummaryLang(code)}
                  className={`type-meta cursor-pointer rounded-lg px-2 py-0.5 font-medium transition-all ${
                    summaryLang === code
                      ? "bg-slate-800 text-white"
                      : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Audio Player Bar (if summary has audio_url) */}
        {audioUrl && (
          <div className="flex flex-col gap-2 rounded-2xl border border-green-200 bg-green-50/50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleAudio}
                  disabled={audioLoading}
                  aria-label={audioPlaying ? t.pause : t.listen}
                  className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-green-600 text-white shadow-xs transition-transform hover:bg-green-500 active:scale-95 disabled:opacity-60"
                >
                  {audioLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : audioPlaying ? (
                    <Pause className="size-4" />
                  ) : (
                    <Play className="size-4 ml-0.5" />
                  )}
                </button>
                <div className="min-w-0">
                  <p className="type-meta font-bold text-slate-800">{t.listen}</p>
                  <p className="type-meta text-slate-500">
                    {formatTime(audioCurrentTime)} / {formatTime(audioDuration)}
                  </p>
                </div>
              </div>

              {/* Speed Switcher */}
              <div className="flex items-center gap-1">
                {SPEEDS.map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => setAudioSpeed(sp)}
                    className={`type-meta cursor-pointer rounded-md px-1.5 py-0.5 font-semibold ${
                      audioSpeed === sp
                        ? "bg-green-700 text-white"
                        : "text-green-800 hover:bg-green-100"
                    }`}
                  >
                    {sp}x
                  </button>
                ))}
              </div>
            </div>

            {/* Audio Progress Scrubber */}
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

        {/* Error notification */}
        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="type-body">{error}</p>
          </div>
        )}

        {/* Narrative Card */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 shadow-xs">
          {narrativeText ? (
            <div>
              <AiMarkdown text={narrativeText} />
              {/* Blinking cursor while delta is streaming */}
              {streaming && !summary && (
                <span
                  aria-hidden
                  className="ml-1 inline-block h-4 w-1 animate-pulse bg-green-600 align-middle"
                />
              )}
            </div>
          ) : streaming ? (
            <div className="flex items-center gap-2 py-6 text-slate-500">
              <Loader2 className="size-4 animate-spin text-green-600" />
              <span className="type-body">{t.generating}</span>
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 py-6 text-slate-500">
              <Loader2 className="size-4 animate-spin text-green-600" />
              <span className="type-body">{t.loading}</span>
            </div>
          ) : (
            <p className="type-body py-4 text-center text-slate-400">{t.noMessages}</p>
          )}
        </div>

        {/* Extracted Tasks / Action Items */}
        {summary?.tasks && summary.tasks.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="type-meta font-bold uppercase tracking-wider text-slate-400">
                {t.actionItems} ({summary.tasks.length})
              </h4>
              {onOpenTasks && (
                <button
                  type="button"
                  onClick={onOpenTasks}
                  className="type-meta inline-flex cursor-pointer items-center gap-1 font-semibold text-green-700 hover:underline"
                >
                  <ListTodo className="size-3.5" />
                  {t.viewTasks}
                </button>
              )}
            </div>

            <ul className="flex flex-col gap-2">
              {summary.tasks.map((task) => {
                const isCompleted = task.status === "completed";
                const isToggling = togglingTaskId === task.id;

                return (
                  <li
                    key={task.id}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 transition-colors ${
                      isCompleted
                        ? "border-slate-100 bg-slate-50/60 opacity-70"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      disabled={isToggling}
                      onClick={() => void handleTaskToggle(task)}
                      aria-label="Toggle task status"
                      className="mt-0.5 cursor-pointer text-slate-300 hover:text-green-600 disabled:opacity-50"
                    >
                      {isToggling ? (
                        <Loader2 className="size-4 animate-spin text-green-600" />
                      ) : isCompleted ? (
                        <CheckCircle2 className="size-4 text-green-600" />
                      ) : (
                        <Circle className="size-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`type-body font-medium ${
                          isCompleted ? "text-slate-400 line-through" : "text-slate-800"
                        }`}
                      >
                        {task.title}
                      </p>
                      {(task.assignee || task.due_at) && (
                        <p className="type-meta mt-0.5 text-slate-400">
                          {[task.assignee, task.due_at?.slice(0, 10)].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Footer link to ChatTasks */}
      {onOpenTasks && (
        <div className="border-t border-slate-100 p-3 text-center">
          <button
            type="button"
            onClick={onOpenTasks}
            className="type-meta inline-flex cursor-pointer items-center gap-1.5 font-bold text-slate-600 hover:text-green-700"
          >
            <ListTodo className="size-4 text-green-600" />
            {t.viewTasks}
          </button>
        </div>
      )}
    </div>
  );
};
