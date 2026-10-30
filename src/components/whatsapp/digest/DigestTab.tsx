import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, Circle, Loader2, Pause, RefreshCw, Sparkles, Volume2 } from "lucide-react";
import type { ConversationsResponse } from "../api/contract.ts";
import type { WaaiClient } from "../api/waaiClient.ts";
import { WaaiApiError } from "../api/waaiClient.ts";
import { AiMarkdown } from "../home/AiMarkdown";
import { homeCopy } from "../home/copy";
import type { DigestResponse, DigestWindow, HomeTask } from "../home/types";
import { defaultDigestWindow, digestWindowsWithActivity, formatMeetingWhen, newestMessageAt } from "./digestWindows.ts";

/** WAAI's section heading: small, quiet capitals above a block. */
const SectionHeader = ({ title, count }: { title: string; count?: number }) => (
  <h3 className="type-overline flex items-center gap-2 pb-2 text-slate-500">
    {title}
    {count ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{count}</span> : null}
  </h3>
);

const card = "rounded-2xl border border-slate-200 bg-white p-4 shadow-xs";

/**
 * The Digest tab, laid out and driven like WAAI's own Digest page: it opens on the narrowest window that has
 * activity and, in that one request, answers with the stored digest or writes it - nobody has to press a button
 * to get a digest. The refresh button writes it again.
 */
export const DigestTab = ({ client, language }: { client: WaaiClient; language: string }) => {
  const t = homeCopy(language);
  const lang = (language === "sk" || language === "hu" ? language : "en") as "en" | "sk" | "hu";

  // `undefined` until the chat list has answered: the newest message decides the window the page opens on.
  const [lastMessageAt, setLastMessageAt] = useState<string | null | undefined>(undefined);
  const [windowKey, setWindowKey] = useState<DigestWindow | null>(null);
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .get<ConversationsResponse>("/conversations")
      .then((list) => !cancelled && setLastMessageAt(newestMessageAt(list.conversations)))
      .catch(() => !cancelled && setLastMessageAt(null));
    return () => {
      cancelled = true;
    };
  }, [client]);

  const options = useMemo(() => (lastMessageAt === undefined ? [] : digestWindowsWithActivity(lastMessageAt)), [lastMessageAt]);
  const selected: DigestWindow | null = windowKey ?? (lastMessageAt === undefined ? null : defaultDigestWindow(lastMessageAt));

  const run = useCallback(
    async (window: DigestWindow, regenerate: boolean) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setBusy(true);
      setError(null);
      try {
        // One request for both cases: the stored digest when there is one, a freshly written one when there is not.
        const next = await client.post<DigestResponse>("/digest", { window, regenerate, lang }, { signal: ctrl.signal });
        if (abortRef.current === ctrl) setDigest(next);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setError(err instanceof WaaiApiError ? err.message : t.failed);
      } finally {
        if (abortRef.current === ctrl) {
          abortRef.current = null;
          setBusy(false);
        }
      }
    },
    [client, lang, t.failed],
  );

  // Open, switch window or change language: show that window's digest, writing it first if it does not exist yet.
  useEffect(() => {
    if (!selected) return;
    setDigest(null);
    void run(selected, false);
    return () => abortRef.current?.abort();
  }, [selected, run]);

  const generating = busy && !digest?.narrative;
  const hasContent = !!digest && digest.chat_count > 0;
  const openTasks = digest ? digest.tasks.filter((x) => x.status === "open").length : 0;
  const headline = hasContent
    ? t.digest.headline(openTasks, digest!.chat_count)
    : generating
      ? t.digest.generating
      : !digest
        ? t.loading
        : t.digest.emptyHint;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-2 sm:py-4" data-testid="wa-digest">
      {/* Hero */}
      <div className="pb-1">
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-full bg-green-50 text-green-700">
            <Sparkles className="size-4" />
          </span>
          <span className="type-overline text-green-700">{t.digest.glance}</span>
          <button
            type="button"
            disabled={busy || !selected}
            onClick={() => selected && void run(selected, true)}
            title={t.digest.regenerate}
            aria-label={t.digest.regenerate}
            data-testid="wa-digest-regenerate"
            className="ml-auto flex size-8 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${busy ? "animate-spin text-green-600" : ""}`} />
          </button>
        </div>
        <h2 className="type-page-title flex items-center gap-2.5 text-balance text-slate-800">
          {!hasContent && !digest ? <Loader2 className="size-5 shrink-0 animate-spin text-slate-400" /> : null}
          {headline}
        </h2>
      </div>

      {/* Time-window selector */}
      <div className="flex flex-wrap gap-1.5">
        {options.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setWindowKey(key)}
            className={`type-meta cursor-pointer rounded-xl px-3 py-1.5 font-semibold transition-all duration-150 ${
              selected === key ? "bg-green-600 text-white shadow-xs" : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t.digest.windows[key]}
          </button>
        ))}
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p className="type-body">{error}</p>
        </div>
      ) : null}

      {/* Summary + audio */}
      <div>
        <div className="flex items-center justify-between gap-2 pb-2">
          <SectionHeader title={t.digest.summaryTitle} />
          {hasContent && digest!.narrative ? <ListenButton client={client} window={selected!} digest={digest!} t={t} /> : null}
        </div>
        <div className={card}>
          {digest?.narrative ? (
            <AiMarkdown text={digest.narrative} />
          ) : generating ? (
            <p className="type-body flex items-center gap-2 py-4 text-slate-500">
              <Loader2 className="size-4 animate-spin text-green-600" />
              {t.digest.generating}
            </p>
          ) : (
            <p className="type-body flex items-center gap-2 text-slate-500">
              {digest ? (
                t.digest.noActivity
              ) : (
                <>
                  <Loader2 className="size-4 shrink-0 animate-spin" />
                  {t.loading}
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Tasks */}
      {digest && digest.tasks.length > 0 ? (
        <DigestTasks client={client} tasks={digest.tasks} t={t} onChanged={(next) => setDigest((d) => (d ? { ...d, tasks: next } : d))} />
      ) : hasContent ? (
        <div>
          <SectionHeader title={t.digest.tasks} />
          <div className={`${card} type-body text-slate-500`}>{t.digest.tasksEmpty}</div>
        </div>
      ) : null}

      {/* Meetings */}
      {digest && (digest.meetings.length > 0 || hasContent) ? (
        <div className="flex flex-col gap-2">
          <SectionHeader title={t.digest.meetings} count={digest.meetings.length || undefined} />
          <p className="type-meta -mt-1 px-1 text-slate-500">{t.digest.meetingsHint}</p>
          {digest.meetings.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              {digest.meetings.map((m, i) => (
                <div key={`${m.title}-${i}`} className={`flex items-center gap-3 px-4 py-3.5 ${i > 0 ? "border-t border-slate-100" : ""}`}>
                  <CalendarClock className="size-4 shrink-0 text-green-700" />
                  <div className="min-w-0 flex-1">
                    <p className="type-body font-semibold text-balance text-slate-800 [overflow-wrap:anywhere]">{m.title}</p>
                    {m.when ? <p className="type-meta mt-0.5 font-semibold text-green-700">{formatMeetingWhen(m.when, lang, m.source_date)}</p> : null}
                  </div>
                  {m.chat ? (
                    m.conversation_id ? (
                      <a
                        href={`#whatsapp/c/${m.conversation_id}${m.message_id ? `?m=${m.message_id}` : ""}`}
                        title={t.digest.openChat}
                        className="type-meta max-w-[42vw] shrink-0 self-center truncate font-semibold text-green-700 transition-opacity hover:opacity-70 sm:max-w-64"
                      >
                        {m.chat}
                      </a>
                    ) : (
                      <span className="type-meta max-w-[42vw] shrink-0 self-center truncate font-semibold text-green-700 sm:max-w-64">{m.chat}</span>
                    )
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className={`${card} type-body text-slate-500`}>{t.digest.meetingsEmpty}</div>
          )}
        </div>
      ) : null}
    </div>
  );
};

const DigestTasks = ({
  client,
  tasks,
  t,
  onChanged,
}: {
  client: WaaiClient;
  tasks: HomeTask[];
  t: ReturnType<typeof homeCopy>;
  onChanged: (tasks: HomeTask[]) => void;
}) => {
  const [toggling, setToggling] = useState<string | null>(null);
  const toggle = async (task: HomeTask) => {
    setToggling(task.id);
    const status = task.status === "completed" ? "open" : "completed";
    try {
      await client.patch(`/tasks/${task.id}`, { status });
      onChanged(tasks.map((x) => (x.id === task.id ? { ...x, status } : x)));
    } finally {
      setToggling(null);
    }
  };
  return (
    <div>
      <SectionHeader title={t.digest.tasks} count={tasks.length} />
      <ul className="flex flex-col gap-2">
        {tasks.map((task) => {
          const done = task.status === "completed";
          return (
            <li key={task.id} className={`flex items-start gap-2.5 rounded-xl border p-3 transition-colors ${done ? "border-slate-100 bg-slate-50/60 opacity-70" : "border-slate-200 bg-white"}`}>
              <button
                type="button"
                disabled={toggling === task.id || (task.crm_linked && done)}
                onClick={() => void toggle(task)}
                aria-label={t.tasks.done}
                className="mt-0.5 cursor-pointer text-slate-300 hover:text-green-600 disabled:opacity-50"
              >
                {toggling === task.id ? <Loader2 className="size-4 animate-spin text-green-600" /> : done ? <CheckCircle2 className="size-4 text-green-600" /> : <Circle className="size-4" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`type-body font-medium ${done ? "text-slate-400 line-through" : "text-slate-800"}`}>{task.title}</p>
                <p className="type-meta mt-0.5 text-slate-400">{[task.assignee, task.due_at?.slice(0, 10)].filter(Boolean).join(" · ")}</p>
              </div>
              {task.conversation_id ? (
                <a href={`#whatsapp/c/${task.conversation_id}`} title={t.digest.openChat} className="type-meta max-w-40 shrink-0 truncate font-semibold text-green-700 hover:opacity-70">
                  {task.conversation_title ?? t.digest.openChat}
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** Plays the spoken digest; the audio is only made on the first press. A new digest means a new element. */
const ListenButton = ({
  client,
  window,
  digest,
  t,
}: {
  client: WaaiClient;
  window: DigestWindow;
  digest: DigestResponse;
  t: ReturnType<typeof homeCopy>;
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused" | "error">("idle");
  const version = `${window}|${digest.created_at ?? ""}`;
  const [seen, setSeen] = useState(version);
  if (seen !== version) {
    setSeen(version);
    setState("idle");
  }
  useEffect(() => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, [version]);
  useEffect(() => () => audioRef.current?.pause(), []);

  const toggle = async () => {
    if (state === "playing") {
      audioRef.current?.pause();
      return;
    }
    setState("loading");
    try {
      if (!audioRef.current) {
        const url = digest.audio_url ?? (await client.get<{ audio_url: string }>("/digest/audio", { query: { window } })).audio_url;
        const el = new Audio(client.mediaUrl(url));
        el.onplaying = () => setState("playing");
        el.onpause = () => setState((s) => (s === "playing" ? "paused" : s));
        el.onended = () => setState("paused");
        el.onerror = () => setState("error");
        audioRef.current = el;
      }
      await audioRef.current.play();
    } catch {
      setState("error");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      className={`type-meta inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold transition-colors hover:bg-slate-50 ${state === "error" ? "text-rose-600" : "text-slate-700"}`}
    >
      {state === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : state === "playing" ? <Pause className="size-3.5" /> : <Volume2 className="size-3.5" />}
      {state === "loading" ? t.digest.listening : state === "playing" ? t.digest.pause : t.digest.listen}
    </button>
  );
};
