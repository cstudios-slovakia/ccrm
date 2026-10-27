import { useEffect, useMemo, useRef, useState } from "react";
import { Euro, Play, Plus, Square, X } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { matchOpenTasks, matchOpenTickets } from "../../utils/timeLinks.ts";
import {
  elapsedSeconds,
  formatDuration,
  isoFromLocal,
  parseDurationInput,
  todayIso,
  type TimeEntry,
} from "../../utils/timeTracking.ts";
import { TimeApiError, createEntry, timeErrorMessage, updateEntry } from "../../utils/timeTrackingApi.ts";
import type { Task, Ticket } from "../../types";
import { isClosedTicketStatus } from "../../utils/tickets";
import { ProjectPicker } from "./ProjectPicker";
import { canRenameTitle, renameHint, useTimeLookups, type TimeDeps } from "./shared";

interface Props {
  deps: TimeDeps;
  recentProjectIds: string[];
  secondsByProject?: Record<string, number>;
}

/**
 * The timer bar: title · project · task · billable · elapsed · Start/Stop · Timer/Manual.
 *
 * Typing matches open tasks by title; picking one LINKS it (the task, and its project) and
 * copies no text. While a timer runs, the title field edits the running entry — and when the
 * entry is linked, that title is the task's, so editing it renames the task.
 */
export function TimerBar({ deps, recentProjectIds, secondsByProject }: Props) {
  const tt = useTimeTracking();
  const { t, running, nowMs, settings } = tt;
  const lookups = useTimeLookups(deps);
  const [mode, setMode] = useState<"timer" | "manual">("timer");
  const [text, setText] = useState("");
  const [task, setTask] = useState<Task | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [billable, setBillable] = useState(settings.billableByDefault);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Manual mode
  const [date, setDate] = useState(todayIso());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dur, setDur] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setBillable(settings.billableByDefault), [settings.billableByDefault]);

  // A running timer's title field mirrors the entry; editing it saves on blur / Enter.
  const [runningTitle, setRunningTitle] = useState("");
  useEffect(() => setRunningTitle(running?.title ?? ""), [running?.id, running?.title]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setSuggestOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const suggestions = useMemo(
    () => (running || task || ticket ? [] : matchOpenTasks(deps.tasks, text, deps.isTaskDone)),
    [deps.tasks, deps.isTaskDone, text, running, task, ticket],
  );
  const ticketSuggestions = useMemo(
    () => (running || task || ticket || !deps.canLinkTicket ? [] : matchOpenTickets(deps.tickets, text, (row) => isClosedTicketStatus(row.status))),
    [deps.canLinkTicket, deps.tickets, text, running, task, ticket],
  );

  const fail = (e: unknown) => tt.notify(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");

  const pickTask = (picked: Task) => {
    setTask(picked);
    setTicket(null);
    setText("");
    setSuggestOpen(false);
    const resolved = lookups.resolveTaskProject(picked);
    setProjectId(resolved.projectId);
  };

  const pickTicket = (picked: Ticket) => {
    setTicket(picked);
    setTask(null);
    setText("");
    setSuggestOpen(false);
    setProjectId(picked.projectId || null);
  };

  const onStart = async () => {
    if (busy) return;
    setBusy(true);
    const started = await tt.start({
      description: task || ticket ? null : text.trim() || null,
      taskId: task?.id ?? null,
      ticketId: task ? null : ticket?.id ?? null,
      projectId: projectId ?? undefined,
      billable,
      originType: task ? "task" : ticket ? "ticket" : undefined,
      originId: task?.id ?? ticket?.id,
    });
    setBusy(false);
    if (started) {
      setText("");
      setTask(null);
      setTicket(null);
      setProjectId(null);
    }
  };

  const onStop = async () => {
    if (busy) return;
    setBusy(true);
    await tt.stop();
    setBusy(false);
  };

  const saveRunning = async (patch: Parameters<typeof updateEntry>[1]) => {
    if (!running) return;
    try {
      await updateEntry(running.id, patch);
      // The provider refetches the running entry whenever the version changes.
      tt.bump();
    } catch (e) {
      fail(e);
    }
  };

  const commitRunningTitle = () => {
    if (!running) return;
    const next = runningTitle.trim();
    if (next === running.title.trim()) return;
    const rename = canRenameTitle(running, deps);
    if (!rename.can) {
      setRunningTitle(running.title);
      return;
    }
    if (running.titleSource === "task" && running.taskId) {
      if (next) deps.onRenameTask(running.taskId, next);
      else setRunningTitle(running.title);
      window.setTimeout(() => tt.bump(), 600);
      return;
    }
    if (running.titleSource === "ticket" && running.ticketId) {
      if (next) deps.onRenameTicket(running.ticketId, next);
      else setRunningTitle(running.title);
      window.setTimeout(() => tt.bump(), 600);
      return;
    }
    void saveRunning({ description: next || null });
  };

  const addManual = async () => {
    if (busy) return;
    const seconds = parseDurationInput(dur);
    const startIso = from ? isoFromLocal(date, from) : null;
    const endIso = to && from ? isoFromLocal(date, to) : null;
    if (!endIso && !seconds) {
      tt.notify(timeErrorMessage("duration_required", t), "warning");
      return;
    }
    setBusy(true);
    try {
      await createEntry({
        description: task || ticket ? null : text.trim() || null,
        taskId: task?.id ?? null,
        ticketId: task ? null : ticket?.id ?? null,
        projectId: projectId ?? undefined,
        entryDate: date,
        startAt: startIso,
        endAt: endIso,
        durationSec: endIso ? undefined : seconds,
        billable,
        source: "manual",
        originType: task ? "task" : undefined,
        originId: task?.id,
      });
      setText("");
      setTask(null);
      setTicket(null);
      setProjectId(null);
      setFrom("");
      setTo("");
      setDur("");
      tt.bump();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const elapsed = running ? elapsedSeconds(running.startAt, nowMs) : 0;
  const rename = running ? canRenameTitle(running, deps) : { can: true };
  const hint = running ? renameHint(running, t) : null;
  const effectiveProject = running ? running.projectId : projectId;
  const effectiveBillable = running ? running.billable : billable;
  const canPick = deps.canPickProject && !(running && running.taskId && running.projectId && !deps.canPickProject);

  const titleField = running ? (
    <div className="min-w-0 flex-1">
      <input
        value={runningTitle}
        onChange={(e) => setRunningTitle(e.target.value)}
        onBlur={commitRunningTitle}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        readOnly={!rename.can}
        title={!rename.can ? t("You cannot edit this task, so you cannot rename it.", "Túto úlohu nemôžete upravovať, preto ju nemôžete premenovať.", "Ezt a feladatot nem szerkesztheti, ezért nem nevezheti át.") : undefined}
        placeholder={t("What are you working on?", "Na čom pracujete?", "min dolgozik?")}
        data-testid="timer-title"
        className="h-10 w-full min-w-40 rounded-xl border border-transparent bg-transparent px-3 text-body font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 hover:border-slate-200 focus:border-primary focus:bg-white read-only:cursor-default"
      />
      {hint && rename.can && <div className="px-3 type-meta text-slate-400">{hint}</div>}
    </div>
  ) : (
    <div ref={box} className="relative min-w-0 flex-1">
      {task || ticket ? (
        <div className="flex h-10 items-center gap-2 rounded-xl bg-teal-50 px-3 text-ui font-semibold text-teal-800" data-testid="timer-linked-task">
          <span className="truncate">{task?.title || ticket?.title || ticket?.subject}</span>
          <button type="button" onClick={() => { setTask(null); setTicket(null); setProjectId(null); }} aria-label={t("Unlink", "Odpojiť", "Leválasztás")} className="text-teal-600 hover:text-teal-900 cursor-pointer">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); setSuggestOpen(true); }}
          onFocus={() => setSuggestOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" && mode === "timer") void onStart(); }}
          placeholder={t("What are you working on?", "Na čom pracujete?", "min dolgozik?")}
          data-testid="timer-title"
          className="h-10 w-full min-w-40 rounded-xl border border-transparent bg-transparent px-3 text-body outline-none placeholder:text-slate-400 hover:border-slate-200 focus:border-primary focus:bg-white"
        />
      )}
      {suggestOpen && (suggestions.length > 0 || ticketSuggestions.length > 0) && (
        <div className="absolute left-0 right-0 z-[960] mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl" data-testid="timer-suggestions">
          {suggestions.length > 0 && <div className="type-overline px-3 pt-2 text-slate-400">{t("Open tasks", "Otvorené úlohy", "Nyitott feladatok")}</div>}
          {suggestions.map((s) => (
            <button key={s.id} type="button" onClick={() => pickTask(s)} data-testid="timer-suggestion" className="flex w-full items-center gap-2 px-3 py-2 text-left text-ui hover:bg-slate-50 cursor-pointer">
              <span className="truncate font-semibold text-slate-800">{s.title}</span>
              {s.relatedProjectId && <span className="shrink-0 type-meta text-slate-400">{lookups.projectName(s.relatedProjectId)}</span>}
            </button>
          ))}
          {ticketSuggestions.length > 0 && <div className="type-overline px-3 pt-2 text-slate-400">{t("Open tickets", "Otvorené tikety", "Nyitott jegyek")}</div>}
          {ticketSuggestions.map((s) => (
            <button key={s.id} type="button" onClick={() => pickTicket(s)} data-testid="timer-ticket-suggestion" className="flex w-full items-center gap-2 px-3 py-2 text-left text-ui hover:bg-slate-50 cursor-pointer">
              <span className="truncate font-semibold text-slate-800">{s.title || s.subject}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-slate-200/80 bg-white p-3 shadow-sm ws-sm:p-4" data-testid="timer-bar">
      {titleField}

      <ProjectPicker
        projects={deps.projects}
        leads={deps.leads}
        projectTypes={deps.projectTypes}
        value={effectiveProject}
        onChange={(id) => {
          if (running) void saveRunning({ projectId: id });
          else setProjectId(id);
        }}
        t={t}
        recentIds={recentProjectIds}
        secondsByProject={secondsByProject}
        onCreateProject={deps.onCreateProject}
        disabled={!canPick}
        align="right"
      />

      <button
        type="button"
        onClick={() => (running ? void saveRunning({ billable: !running.billable }) : setBillable((b) => !b))}
        aria-pressed={effectiveBillable}
        title={effectiveBillable ? t("Billable", "Fakturovateľné", "Számlázható") : t("Not billable", "Nefakturovateľné", "Nem számlázható")}
        data-testid="timer-billable"
        className={`inline-flex size-9 items-center justify-center rounded-xl border transition-all cursor-pointer ${effectiveBillable ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-400 hover:text-slate-600"}`}
      >
        <Euro className="size-4" />
      </button>

      {mode === "manual" && !running ? (
        <>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-ui" aria-label={t("Date", "Dátum", "Dátum")} />
          <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-28 rounded-xl border border-slate-200 bg-white px-2 text-ui tabular-nums" aria-label={t("Start", "Začiatok", "Kezdet")} />
          <span className="text-slate-400">–</span>
          <input type="time" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-28 rounded-xl border border-slate-200 bg-white px-2 text-ui tabular-nums" aria-label={t("End", "Koniec", "Vég")} />
          <input value={dur} onChange={(e) => setDur(e.target.value)} placeholder="1:30" className="h-9 w-20 rounded-xl border border-slate-200 bg-white px-2 text-center text-ui tabular-nums" aria-label={t("Duration", "Trvanie", "Időtartam")} data-testid="manual-duration" />
          <button type="button" onClick={addManual} disabled={busy} data-testid="manual-add" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-ui font-semibold text-primary-foreground transition-all active:scale-95 disabled:opacity-60 cursor-pointer">
            <Plus className="size-4" />
            {t("Add", "Pridať", "Hozzáad")}
          </button>
        </>
      ) : (
        <>
          <span className="min-w-20 text-center text-title font-bold tabular-nums text-slate-900" data-testid="timer-elapsed">
            {formatDuration(elapsed, true)}
          </span>
          {running ? (
            <button type="button" onClick={onStop} disabled={busy} data-testid="timer-stop" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-ui font-semibold text-white transition-all hover:bg-rose-700 active:scale-95 disabled:opacity-60 cursor-pointer">
              <Square className="size-4 fill-current" />
              {t("Stop", "Zastaviť", "Leállítás")}
            </button>
          ) : (
            <button type="button" onClick={onStart} disabled={busy} data-testid="timer-start" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-ui font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-95 disabled:opacity-60 cursor-pointer">
              <Play className="size-4 fill-current" />
              {t("Start", "Spustiť", "Indítás")}
            </button>
          )}
        </>
      )}

      {!running && (
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5" role="group">
          {(["timer", "manual"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} data-testid={`timer-mode-${m}`} className={`h-8 rounded-lg px-2.5 text-ui font-semibold cursor-pointer ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
              {m === "timer" ? t("Timer", "Časovač", "Időzítő") : t("Manual", "Ručne", "Kézi")}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Used by lists to ▶ Continue an entry: same title / links / project, a fresh timer. */
export const continueInput = (e: TimeEntry) => ({
  description: e.titleSource === "entry" ? e.title : null,
  taskId: e.taskId,
  ticketId: e.taskId ? null : e.ticketId,
  projectId: e.projectId,
  billable: e.billable,
  tags: e.tags,
  originType: e.taskId ? "task" : undefined,
  originId: e.taskId ?? undefined,
});

