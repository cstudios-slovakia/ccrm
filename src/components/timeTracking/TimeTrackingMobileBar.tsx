import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ListTodo, Play, Plus, Timer, X } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { extraItemsLabel, workedClockSeconds } from "../../utils/timeContainer.ts";
import { elapsedSeconds, formatDuration } from "../../utils/timeTracking.ts";
import { CycleRing } from "./CycleRing";
import { ClockDigits } from "./ClockDigits";
import { TimerContainer } from "./TimerContainer";
import { TimerBar } from "./TimerBar";
import type { TimeDeps } from "./shared";

interface Props {
  onNavigate: (route: string) => void;
  /** Lets the sheet's "+ Add timer" show the start inputs inline; without it the button opens the timer route. */
  deps?: TimeDeps;
  recentProjectIds?: string[];
  secondsByProject?: Record<string, number>;
}

/**
 * Phone bar for the time-tracking route: Timer, Calendar, Tasks, Add.
 * Hidden from the ws-sm workspace up. The running card sits above it; with several items it
 * is a summary that opens the container as a bottom sheet; a single timer is the big card at the top of the page (MobileRunningCard).
 */
export function TimeTrackingMobileBar({ onNavigate, deps, recentProjectIds, secondsByProject }: Props) {
  const tt = useTimeTracking();
  const { t, primaryRunning: running, running: all, nowMs } = tt;
  const several = all.length > 1;
  const [sheet, setSheet] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const pausedOnly = !running && tt.paused.length > 0;
  const firstPaused = tt.paused[0];

  const onDragDown = (e: PointerEvent) => {
    dragStart.current = e.clientY;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onDragMove = (e: PointerEvent) => {
    if (dragStart.current !== null) setDragY(Math.max(0, e.clientY - dragStart.current));
  };
  const onDragEnd = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (dragY > 80) setSheet(false);
    setDragY(0);
  };
  const elapsed = running ? formatDuration(several ? workedClockSeconds(all, nowMs) : elapsedSeconds(running.startAt, nowMs), true) : "";

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheet(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet]);

  // The sheet is for several items; back to one (or none) closes it.
  useEffect(() => {
    if (!several && tt.paused.length === 0) setSheet(false);
  }, [several, tt.paused.length]);

  const item = (label: string, icon: ReactNode, onClick: () => void, testId: string) => (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="inline-flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 text-micro font-semibold text-slate-600 hover:text-teal-700 cursor-pointer"
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="ws-sm:hidden">
      <div className={(running && several) || pausedOnly ? "h-44" : "h-16"} aria-hidden />
      {running && several && (
        <CycleRing radius={24} className="fixed inset-x-3 bottom-20 z-40">
        <button
          type="button"
          onClick={() => setSheet(true)}
          aria-haspopup="dialog"
          data-testid="mobile-running-summary"
          className="flex w-full min-h-11 items-center gap-3 rounded-3xl border border-rose-200 bg-white p-4 text-left shadow-xl transition-colors hover:bg-rose-50 active:bg-rose-100 cursor-pointer motion-reduce:transition-none"
        >
          <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-rose-600 motion-reduce:animate-none" />
          <span className="min-w-0 flex-1">
            <span className="block type-overline text-rose-600">{t(`${all.length} running`, `beží ${all.length}`, `${all.length} fut`)}</span>
            <span className="block truncate text-body text-slate-700">
              {running.title || t("No title", "Bez názvu", "Nincs cím")} <span className="font-bold text-rose-700">{extraItemsLabel(all.length)}</span>
            </span>
          </span>
          <ClockDigits value={elapsed} className="text-title font-bold text-slate-900" data-testid="mobile-running-worked" />
        </button>
        </CycleRing>
      )}
      {pausedOnly && (
        <div data-testid="mobile-paused-card" className="fixed inset-x-3 bottom-20 z-40 rounded-3xl border border-amber-200 bg-white p-4 shadow-xl">
          {/* Stacked like the running card: the button sits left, clear of the floating copilot at the right edge. */}
          <span className="block min-w-0">
            <span className="block type-overline text-amber-600">{t("Paused", "Pozastavené", "Szüneteltetve")}</span>
            <span className="block truncate text-body text-slate-700">
              {firstPaused?.title || t("No title", "Bez názvu", "Nincs cím")}
              {tt.paused.length > 1 && <span className="font-bold text-amber-700"> {extraItemsLabel(tt.paused.length)}</span>}
            </span>
          </span>
          <CycleRing radius={16} className="mt-3">
            <button
              type="button"
              onClick={() => void (tt.paused.length > 1 ? tt.resumeAll() : tt.resume(firstPaused.id))}
              data-testid="mobile-paused-resume"
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 text-ui font-semibold text-white transition-all hover:bg-amber-600 active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <Play className="size-4 fill-current" />
              {t("Resume", "Pokračovať", "Folytatás")}
            </button>
          </CycleRing>
        </div>
      )}
      {sheet && typeof document !== "undefined" && createPortal(
        // Portalled to <body> in the modal layer: inside the bar's own stacking context the app's bottom
        // nav (z-[20000]) covered the last row (Pause all / Stop all). The Switch / Parallel popover (z-[100001]) stays above.
        <div className="fixed inset-0 z-[100000]" data-testid="mobile-timer-sheet-root">
          <div className="absolute inset-0 bg-slate-900/40 animate-in fade-in duration-200 motion-reduce:animate-none" onClick={() => setSheet(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("Running timer", "Bežiaci časovač", "Futó időzítő")}
            data-testid="mobile-timer-sheet"
            style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl animate-in slide-in-from-bottom duration-200 motion-reduce:animate-none"
          >
            <div className="relative mb-1 flex min-h-11 items-center justify-center">
              <div
                data-testid="mobile-timer-sheet-handle"
                onPointerDown={onDragDown}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
                className="flex h-11 flex-1 cursor-grab touch-none items-center justify-center"
              >
                <span className="h-1.5 w-10 rounded-full bg-slate-300" aria-hidden />
              </div>
              <button
                type="button"
                onClick={() => setSheet(false)}
                aria-label={t("Close", "Zavrieť", "Bezárás")}
                data-testid="mobile-timer-sheet-close"
                className="absolute right-0 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 active:bg-slate-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
              >
                <X className="size-5" />
              </button>
            </div>
            <TimerContainer
              touch
              {...(deps
                ? { renderAdd: (done: () => void) => <TimerBar deps={deps} recentProjectIds={recentProjectIds ?? []} secondsByProject={secondsByProject} adding onStarted={done} /> }
                : {
                    onAdd: () => {
                      setSheet(false);
                      onNavigate("time-tracking");
                    },
                  })}
            />
          </div>
        </div>
        , document.body)}
      <nav
        aria-label={t("Time tracking", "Evidencia času", "Időkövetés")}
        data-testid="time-mobile-bar"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
      >
        {item(t("Timer", "Časovač", "Időzítő"), <Timer className="size-4" />, () => {
          onNavigate("time-tracking");
          window.setTimeout(() => document.querySelector('[data-testid="mobile-running-card"], [data-testid="timer-title"]')?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
        }, "mobile-tab-timer")}
        {item(t("Calendar", "Kalendár", "Naptár"), <CalendarDays className="size-4" />, () => onNavigate("time-tracking/calendar"), "mobile-tab-calendar")}
        {item(t("Tasks", "Úlohy", "Feladatok"), <ListTodo className="size-4" />, () => onNavigate("tasks"), "mobile-tab-tasks")}
        {item(
          t("Add", "Pridať", "Hozzáadás"),
          <Plus className="size-4" />,
          () => {
            onNavigate("time-tracking/day");
            window.dispatchEvent(new CustomEvent("ccrm-time-add-row"));
          },
          "mobile-tab-add",
        )}
      </nav>
    </div>
  );
}
