import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlignLeft, ArrowRight, CalendarDays, CheckSquare, Clock, Euro, ListPlus, Plus, X } from "lucide-react";
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
import { recoverTaskRequired } from "./timeCreateBridge";
import { ClockDigits } from "./ClockDigits";
import { CycleRing } from "./CycleRing";
import { ProjectPicker } from "./ProjectPicker";
import { RoundTimerButton, roundButtonClass, roundButtonRadius } from "./RoundTimerButton";
import { TimerContainer } from "./TimerContainer";
import { canRenameTitle, renameHint, useTimeLookups, type TimeDeps } from "./shared";

interface Props {
  deps: TimeDeps;
  recentProjectIds: string[];
  secondsByProject?: Record<string, number>;
  /** A full-width last row (the header panel puts its "Open time tracking" link here). */
  footer?: ReactNode;
  /** The container's "+ Add timer": the bar starts a NEW timer instead of editing the running one. */
  adding?: boolean;
  /** Called after a start from this bar succeeded. */
  onStarted?: () => void;
  /** One timer runs and parallel timers are allowed: show "+ Add timer" (toggles a fresh bar below). */
  onAddTimer?: () => void;
  /** Whether that fresh bar is open (for aria-expanded). */
  addOpen?: boolean;
}

/**
 * The timer bar, one slim row: title · project chip · task chip · Description · billable · clock · round Start/Stop · Timer/Manual.
 *
 * Typing matches open tasks by title; picking one LINKS it (the task, and its project) and
 * copies no text. While a timer runs, the title field edits the running entry — and when the
 * entry is linked, that title is the task's, so editing it renames the task.
 *
 * A small Description button opens an optional note row under the bar (it stays open while it has text). It is typed before Start (or in manual
 * mode) and travels with the new entry; while a timer runs the same field edits the running entry.
 */
export function TimerBar(props: Props) {
  const tt = useTimeTracking();
  const lookups = useTimeLookups(props.deps);
  const [addOpen, setAddOpen] = useState(false);
  const canAdd = !props.adding && !!tt.primaryRunning && !!tt.settings.parallel?.enabled;
  useEffect(() => {
    if (!canAdd) setAddOpen(false);
  }, [canAdd]);
  // Two or more items (running or paused): the bar becomes a container (D5.4).
  if (!props.adding && tt.running.length + tt.paused.length >= 2) {
    return (
      <TimerContainer
        projectName={lookups.projectName}
        footer={props.footer}
        renderAdd={(done) => <SingleTimerBar {...props} adding onStarted={done} footer={undefined} />}
      />
    );
  }
  if (!canAdd) return <SingleTimerBar {...props} />;
  // One timer runs: "+ Add timer" opens a fresh bar under it, so a second timer can start from scratch.
  return (
    <div className="flex flex-col gap-2">
      <SingleTimerBar {...props} onAddTimer={() => setAddOpen((v) => !v)} addOpen={addOpen} />
      {addOpen && (
        <div data-testid="timer-add-panel">
          <SingleTimerBar {...props} adding footer={undefined} onStarted={() => setAddOpen(false)} />
        </div>
      )}
    </div>
  );
}

function SingleTimerBar({ deps, recentProjectIds, secondsByProject, footer, adding, onStarted, onAddTimer, addOpen }: Props) {
  const tt = useTimeTracking();
  const { t, nowMs, settings } = tt;
  const [mode, setMode] = useState<"timer" | "manual">("timer");
  // In Manual mode the bar's fields belong to the NEW entry, also while a timer runs.
  const live = adding ? null : tt.primaryRunning;
  const running = mode === "manual" ? null : live;
  const lookups = useTimeLookups(deps);
  const [noteOpen, setNoteOpen] = useState(false);
  const noteField = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [task, setTask] = useState<Task | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [billable, setBillable] = useState(settings.billableByDefault);
  const [note, setNote] = useState("");
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
  const [runningNote, setRunningNote] = useState("");
  useEffect(() => setRunningNote(running?.note ?? ""), [running?.id, running?.note]);

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
    const started = await tt.start(
      {
        description: task || ticket ? null : text.trim() || null,
        taskId: task?.id ?? null,
        ticketId: task ? null : ticket?.id ?? null,
        note: note.trim() || null,
        projectId: projectId ?? undefined,
        billable,
        originType: task ? "task" : ticket ? "ticket" : undefined,
        originId: task?.id ?? ticket?.id,
      },
      // "+ Add timer" already said "alongside": no Switch / Parallel question.
      adding && tt.running.length > 0 && tt.settings.parallel?.enabled ? { mode: "parallel" } : {},
    );
    setBusy(false);
    if (started) {
      onStarted?.();
      setText("");
      setNote("");
      setTask(null);
      setTicket(null);
      setProjectId(null);
    }
  };

  const onStop = async () => {
    if (busy) return;
    setBusy(true);
    await tt.stop(running?.id);
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

  const commitRunningNote = () => {
    if (!running || runningNote.trim() === (running.note ?? "").trim()) return;
    void saveRunning({ note: runningNote.trim() || null });
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
        note: note.trim() || null,
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
      setNote("");
      setTask(null);
      setTicket(null);
      setProjectId(null);
      setFrom("");
      setTo("");
      setDur("");
      tt.bump();
    } catch (e) {
      // "Require a task": the bar has no way to link one for a manual entry, so the drawer opens with what was typed.
      const handled = recoverTaskRequired(e, {
        projectId, description: text.trim() || null, note: note.trim() || null, entryDate: date,
        startAt: startIso, endAt: endIso, durationSec: endIso ? null : seconds, billable,
      }, tt.notify, t);
      if (!handled) fail(e);
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
  const noteValue = running ? runningNote : note;
  const showNote = noteOpen || noteValue.length > 0;
  useEffect(() => {
    if (noteOpen) noteField.current?.focus();
  }, [noteOpen]);

  // The title a linked item gives the entry is the task's (C5); it is edited on the task itself.
  const linked = running ? (running.taskId ? "task" : running.ticketId ? "ticket" : null) : task ? "task" : ticket ? "ticket" : null;
  const linkedKind = linked === "ticket" ? t("Ticket", "Tiket", "Jegy") : t("Task", "Úloha", "Feladat");
  const linkedName = running ? running.title : task?.title || ticket?.title || ticket?.subject || "";

  const titleClass = "h-10 w-full min-w-40 rounded-md border border-transparent bg-transparent px-3 text-body outline-none placeholder:text-gray-400 hover:border-gray-200 focus:border-entity focus:bg-white";
  const titleField = running ? (
    <div className="min-w-0 flex-1 basis-60">
      <input
        value={runningTitle}
        onChange={(e) => setRunningTitle(e.target.value)}
        onBlur={commitRunningTitle}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        readOnly={!rename.can}
        title={!rename.can ? t("You cannot edit this task, so you cannot rename it.", "Túto úlohu nemôžete upravovať, preto ju nemôžete premenovať.", "Ezt a feladatot nem szerkesztheti, ezért nem nevezheti át.") : undefined}
        placeholder={t("What are you working on?", "Na čom pracujete?", "min dolgozik?")}
        data-testid="timer-title"
        className={`${titleClass} font-semibold text-gray-900 read-only:cursor-default`}
      />
      {hint && rename.can && <div className="px-3 type-meta text-gray-400">{hint}</div>}
    </div>
  ) : (
    <div ref={box} className="relative min-w-0 flex-1 basis-60">
      {task || ticket ? (
        <div className="flex h-10 items-center px-3 text-body font-semibold text-gray-900" data-testid="timer-linked-title">
          <span className="truncate">{linkedName}</span>
        </div>
      ) : (
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); setSuggestOpen(true); }}
          onFocus={() => setSuggestOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" && mode === "timer") void onStart(); }}
          placeholder={t("What are you working on?", "Na čom pracujete?", "min dolgozik?")}
          data-testid="timer-title"
          className={titleClass}
        />
      )}
      {suggestOpen && (suggestions.length > 0 || ticketSuggestions.length > 0) && (
        <div className="absolute left-0 right-0 z-[960] mt-1 overflow-hidden rounded-md border border-gray-200 bg-white shadow-xl" data-testid="timer-suggestions">
          {suggestions.length > 0 && <div className="type-overline px-3 pt-2 text-gray-400">{t("Open tasks", "Otvorené úlohy", "Nyitott feladatok")}</div>}
          {suggestions.map((s) => (
            <button key={s.id} type="button" onClick={() => pickTask(s)} data-testid="timer-suggestion" className="flex w-full items-center gap-2 px-3 py-2 text-left text-ui hover:bg-gray-50 cursor-pointer">
              <span className="truncate font-semibold text-gray-800">{s.title}</span>
              {s.relatedProjectId && <span className="shrink-0 type-meta text-gray-400">{lookups.projectName(s.relatedProjectId)}</span>}
            </button>
          ))}
          {ticketSuggestions.length > 0 && <div className="type-overline px-3 pt-2 text-gray-400">{t("Open tickets", "Otvorené tikety", "Nyitott jegyek")}</div>}
          {ticketSuggestions.map((s) => (
            <button key={s.id} type="button" onClick={() => pickTicket(s)} data-testid="timer-ticket-suggestion" className="flex w-full items-center gap-2 px-3 py-2 text-left text-ui hover:bg-gray-50 cursor-pointer">
              <span className="truncate font-semibold text-gray-800">{s.title || s.subject}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const iconButton = "inline-flex size-10 shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-entity";
  const manual = mode === "manual";
  // Start → End gives the duration; a typed duration shows instead until those times are filled in.
  const spanSeconds = from && to ? Math.round((new Date(isoFromLocal(date, to)).getTime() - new Date(isoFromLocal(date, from)).getTime()) / 1000) : 0;
  const durShown = dur !== "" ? dur : spanSeconds > 0 ? formatDuration(spanSeconds, true) : "";
  const locale = deps.language === "sk" ? "sk-SK" : deps.language === "hu" ? "hu-HU" : "en-US";
  const dateLabel = date === todayIso() ? t("Today", "Dnes", "Ma") : new Date(`${date}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const timeInput = "h-9 w-24 rounded-md border border-gray-200 bg-white px-2 text-center text-ui tabular-nums";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200/80 bg-white p-2 pl-3 shadow-sm ws-sm:pl-5" data-testid="timer-bar">
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
        chip
      />

      {linked && (
        <span className="inline-flex h-9 max-w-48 items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 pl-3 pr-2 text-ui font-medium text-gray-600" data-testid="timer-linked-task" title={linkedName}>
          <CheckSquare className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{linkedKind}</span>
          {running ? (
            <span className="w-1" aria-hidden />
          ) : (
            <button type="button" onClick={() => { setTask(null); setTicket(null); setProjectId(null); }} aria-label={t("Unlink", "Odpojiť", "Leválasztás")} className="rounded-full p-0.5 text-gray-400 hover:text-gray-800 cursor-pointer">
              <X className="size-3.5" />
            </button>
          )}
        </span>
      )}

      <button
        type="button"
        onClick={() => setNoteOpen((v) => !v)}
        aria-expanded={showNote}
        aria-label={t("Description", "Popis", "Leírás")}
        title={t("Description", "Popis", "Leírás")}
        data-testid="timer-note-toggle"
        className={`${iconButton} ${noteValue ? "bg-entity-subtle text-entity-text" : "text-gray-500 hover:bg-gray-100"}`}
      >
        <AlignLeft className="size-4" />
      </button>

      <button
        type="button"
        onClick={() => (running ? void saveRunning({ billable: !running.billable }) : setBillable((b) => !b))}
        aria-pressed={effectiveBillable}
        aria-label={t("Billable", "Fakturovateľné", "Számlázható")}
        title={effectiveBillable ? t("Billable", "Fakturovateľné", "Számlázható") : t("Not billable", "Nefakturovateľné", "Nem számlázható")}
        data-testid="timer-billable"
        className={`${iconButton} ${effectiveBillable ? "bg-emerald-50 text-emerald-700" : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"}`}
      >
        <Euro className="size-4" />
      </button>

      <span className="mx-1 hidden h-7 w-px bg-gray-200 ws-sm:block" aria-hidden />

      {manual ? (
        <>
          {live && (
            <>
              <ClockDigits value={formatDuration(elapsedSeconds(live.startAt, nowMs), true)} className="justify-end text-title font-bold text-rose-600" data-testid="timer-elapsed" />
              <CycleRing swap radius={roundButtonRadius("lg")} buttonClass={roundButtonClass("lg")}>
                <RoundTimerButton kind="stop" label={t("Stop timer", "Zastaviť časovač", "Időzítő leállítása")} onClick={() => { if (!busy) { setBusy(true); void tt.stop(live.id).finally(() => setBusy(false)); } }} disabled={busy} data-testid="timer-stop" />
              </CycleRing>
              <span className="mx-1 hidden h-7 w-px bg-gray-200 ws-sm:block" aria-hidden />
            </>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <input type="time" value={from} onChange={(e) => { setFrom(e.target.value); setDur(""); }} className={timeInput} aria-label={t("Start", "Začiatok", "Kezdet")} />
            <ArrowRight className="size-3.5 text-gray-400" aria-hidden />
            <input type="time" value={to} onChange={(e) => { setTo(e.target.value); setDur(""); }} className={timeInput} aria-label={t("End", "Koniec", "Vég")} />
            <label className="relative inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-ui font-semibold text-gray-700 hover:bg-gray-50 focus-within:outline-2 focus-within:outline-entity">
              <CalendarDays className="size-3.5" aria-hidden />
              {dateLabel}
              <input
                type="date"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                aria-label={t("Date", "Dátum", "Dátum")}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            </label>
          </div>
          <input
            value={durShown}
            onChange={(e) => setDur(e.target.value)}
            placeholder="0:00:00"
            className="h-10 w-28 rounded-md border border-transparent bg-transparent px-2 text-right text-title font-bold tabular-nums text-gray-900 outline-none placeholder:text-gray-300 hover:border-gray-200 focus:border-entity focus:bg-white"
            aria-label={t("Duration", "Trvanie", "Időtartam")}
            data-testid="manual-duration"
          />
          <button type="button" onClick={addManual} disabled={busy} data-testid="manual-add" className="inline-flex h-12 items-center gap-1.5 rounded-full bg-entity-solid px-5 text-ui font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-60 cursor-pointer">
            <Plus className="size-4" />
            {t("Add", "Pridať", "Hozzáad")}
          </button>
        </>
      ) : (
        <>
          <ClockDigits value={formatDuration(elapsed, true)} className={`min-w-24 justify-end text-title font-bold ${running ? "text-rose-600" : "text-gray-500"}`} data-testid="timer-elapsed" />
          {running && onAddTimer && (
            <button
              type="button"
              onClick={onAddTimer}
              aria-expanded={!!addOpen}
              title={t("Start another timer alongside this one", "Spustiť ďalší časovač popri tomto", "Újabb időzítő indítása emellett")}
              data-testid="timer-add"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-ui font-semibold text-entity-text transition-all hover:bg-gray-100 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-entity"
            >
              <Plus className="size-4" />
              {t("Add timer", "Pridať časovač", "Időzítő hozzáadása")}
            </button>
          )}
          {running ? (
            <CycleRing swap radius={roundButtonRadius("lg")} buttonClass={roundButtonClass("lg")}>
              <RoundTimerButton kind="stop" label={t("Stop timer", "Zastaviť časovač", "Időzítő leállítása")} onClick={onStop} disabled={busy} data-testid="timer-stop" />
            </CycleRing>
          ) : (
            <RoundTimerButton kind="start" label={t("Start timer", "Spustiť časovač", "Időzítő indítása")} onClick={onStart} disabled={busy} data-testid="timer-start" />
          )}
        </>
      )}

      <div className="flex gap-0.5 ws-sm:flex-col" role="group" aria-label={t("Entry mode", "Spôsob zápisu", "Rögzítés módja")}>
        {(["timer", "manual"] as const).map((m) => {
          const label = m === "timer" ? t("Timer", "Časovač", "Időzítő") : t("Manual", "Ručne", "Kézi");
          const Icon = m === "timer" ? Clock : ListPlus;
          return (
            <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} aria-label={label} title={label} data-testid={`timer-mode-${m}`} className={`inline-flex size-10 ws-sm:h-5.5 ws-sm:w-6.5 items-center justify-center rounded-md transition-colors cursor-pointer ${mode === m ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-700"}`}>
              <Icon className="size-3.5" />
            </button>
          );
        })}
      </div>

      {showNote && (
        <input
          ref={noteField}
          value={noteValue}
          onChange={(e) => (running ? setRunningNote(e.target.value) : setNote(e.target.value))}
          onBlur={commitRunningNote}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            if (running) (e.currentTarget as HTMLInputElement).blur();
            else if (mode === "timer") void onStart();
          }}
          maxLength={1000}
          placeholder={t("Description (optional)", "Popis (voliteľné)", "Leírás (nem kötelező)")}
          aria-label={t("Description", "Popis", "Leírás")}
          data-testid="timer-note"
          className="h-9 w-full basis-full rounded-md border border-gray-200 bg-gray-50 px-3 text-ui text-gray-700 outline-none placeholder:text-gray-400 focus:border-entity focus:bg-white"
        />
      )}
      {footer}
    </div>
  );
}

/** Used by lists to ▶ Continue an entry: same title / links / project, a fresh timer. */
export const continueInput = (e: TimeEntry) => ({
  description: e.titleSource === "entry" ? e.title : null,
  note: e.note,
  taskId: e.taskId,
  ticketId: e.taskId ? null : e.ticketId,
  projectId: e.projectId,
  billable: e.billable,
  tags: e.tags,
  originType: e.taskId ? "task" : undefined,
  originId: e.taskId ?? undefined,
});

