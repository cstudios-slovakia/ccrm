import { useState, type ReactNode } from "react";
import { Pause, Play, Plus, Square } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { deliveredSeconds, workedClockSeconds } from "../../utils/timeContainer.ts";
import { elapsedSeconds, formatDuration, projectColor, type TimeEntry } from "../../utils/timeTracking.ts";
import { ClockDigits } from "./ClockDigits";
import { CycleRing } from "./CycleRing";

interface Props {
  /** Name of a project by id (entries carry their own `projectName`, which wins). */
  projectName?: (id: string | null) => string;
  /** The normal bar inputs, shown under the rows after "+ Add timer"; `done` closes them. */
  renderAdd?: (done: () => void) => ReactNode;
  /** Instead of `renderAdd`: "+ Add timer" just calls this (the phone sheet sends the person to the timer bar). */
  onAdd?: () => void;
  /** A last item at the end of the footer (the header panel's "Open time tracking" link). */
  footer?: ReactNode;
  /** Bigger touch targets (the phone sheet). */
  touch?: boolean;
}

const BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-60 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none motion-reduce:active:scale-100";

/**
 * The timer bar with two or more items (D5.4): one row per running or paused item, and a footer
 * with "+ Add timer", the worked and delivered clocks, Pause all and Stop all.
 */
export function TimerContainer({ projectName, renderAdd, onAdd, footer, touch = false }: Props) {
  const { t, running, paused, nowMs, pause, pauseAll, resume, stop, stopAll } = useTimeTracking();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const size = touch ? "min-h-11 min-w-11 px-3" : "h-9 px-3";

  const act = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const row = (e: TimeEntry, isPaused: boolean) => {
    const project = e.projectName || (projectName && e.projectId ? projectName(e.projectId) : "");
    const seconds = isPaused ? e.durationSec ?? 0 : elapsedSeconds(e.startAt, nowMs);
    return (
      <li
        key={e.id}
        data-testid="timer-container-row"
        data-state={isPaused ? "paused" : "ongoing"}
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-3 py-2 transition-colors hover:bg-slate-50 ${isPaused ? "opacity-70" : ""}`}
      >
        <span
          className={`size-2.5 shrink-0 rounded-full ${isPaused ? "" : "animate-pulse motion-reduce:animate-none"}`}
          style={{ backgroundColor: e.projectId ? projectColor(e.projectId) : "#e11d48" }}
        />
        <div className="min-w-0 flex-1 basis-40">
          <div className="truncate text-body font-semibold text-slate-900" data-testid="timer-container-title">
            {e.title || t("No title", "Bez názvu", "Nincs cím")}
          </div>
          {project && <div className="truncate type-meta text-slate-500">{project}</div>}
        </div>
        <ClockDigits value={formatDuration(seconds, true)} className="font-bold text-slate-900" data-testid="timer-container-elapsed" />
        {isPaused ? (
          <>
            <button type="button" disabled={busy} onClick={() => void act(() => resume(e.id))} data-testid="timer-container-resume" className={`${BTN} ${size} bg-teal-50 text-ui text-teal-800 hover:bg-teal-100`}>
              <Play className="size-4 fill-current" />
              {t("Resume", "Pokračovať", "Folytatás")}
            </button>
            <button type="button" disabled={busy} onClick={() => void act(() => stop(e.id))} data-testid="timer-container-stop-paused" aria-label={t("Stop", "Zastaviť", "Leállítás")} className={`${BTN} ${size} bg-rose-600 text-ui text-white hover:bg-rose-700`}>
              <Square className="size-4 fill-current" />
              {touch && t("Stop", "Zastaviť", "Leállítás")}
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => void act(() => pause(e.id))} data-testid="timer-container-pause" className={`${BTN} ${size} border border-slate-200 bg-white text-ui text-slate-700 hover:bg-slate-100`}>
              <Pause className="size-4 fill-current" />
              {t("Pause", "Pozastaviť", "Szünet")}
            </button>
            <button type="button" disabled={busy} onClick={() => void act(() => stop(e.id))} data-testid="timer-container-stop" aria-label={t("Stop", "Zastaviť", "Leállítás")} className={`${BTN} ${size} bg-rose-600 text-ui text-white hover:bg-rose-700`}>
              <Square className="size-4 fill-current" />
              {touch && t("Stop", "Zastaviť", "Leállítás")}
            </button>
          </>
        )}
      </li>
    );
  };

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-2 shadow-sm ws-sm:p-3" data-testid="timer-container">
      <ul className="flex flex-col gap-0.5">
        {running.map((e) => row(e, false))}
        {paused.map((e) => row(e, true))}
      </ul>
      {adding && renderAdd && <div className="mt-2 border-t border-slate-100 pt-2">{renderAdd(() => setAdding(false))}</div>}
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 px-1 pt-2" data-testid="timer-container-footer">
        {(renderAdd || onAdd) && (
          <button type="button" onClick={() => (renderAdd ? setAdding((v) => !v) : onAdd?.())} aria-expanded={renderAdd ? adding : undefined} data-testid="timer-container-add" className={`${BTN} ${size} text-ui text-primary hover:bg-slate-100`}>
            <Plus className="size-4" />
            {t("Add timer", "Pridať časovač", "Időzítő hozzáadása")}
          </button>
        )}
        {running.length > 0 && (
          <span className="type-meta text-slate-600" data-testid="timer-container-summary">
            {t("Worked", "Odpracované", "Dolgozott")}{" "}
            <ClockDigits value={formatDuration(workedClockSeconds(running, nowMs), true)} className="font-semibold text-slate-900" data-testid="timer-container-worked" />
            {" · "}
            {t("Delivered", "Dodané", "Teljesített")}{" "}
            <ClockDigits value={formatDuration(deliveredSeconds(running, nowMs), true)} className="font-semibold text-slate-900" data-testid="timer-container-delivered" />
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {running.length > 0 && (
            <button type="button" disabled={busy} onClick={() => void act(pauseAll)} data-testid="timer-container-pause-all" className={`${BTN} ${size} border border-slate-200 bg-white text-ui text-slate-700 hover:bg-slate-100`}>
              <Pause className="size-4 fill-current" />
              {t("Pause all", "Pozastaviť všetko", "Mind szüneteltetése")}
            </button>
          )}
          {running.length > 0 && (
            <CycleRing radius={12}>
              <button type="button" disabled={busy} onClick={() => void act(stopAll)} data-testid="timer-container-stop-all" className={`${BTN} ${size} bg-rose-600 text-ui text-white hover:bg-rose-700`}>
                <Square className="size-4 fill-current" />
                {t("Stop all", "Zastaviť všetko", "Mind leállítása")}
              </button>
            </CycleRing>
          )}
          {footer}
        </div>
      </div>
    </div>
  );
}
