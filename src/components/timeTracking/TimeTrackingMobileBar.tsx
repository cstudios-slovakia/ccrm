import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, ListTodo, Plus, Square, Timer } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { extraItemsLabel, workedClockSeconds } from "../../utils/timeContainer.ts";
import { elapsedSeconds, formatDuration } from "../../utils/timeTracking.ts";
import { ClockDigits } from "./ClockDigits";
import { TimerContainer } from "./TimerContainer";

interface Props {
  onNavigate: (route: string) => void;
}

/**
 * Phone bar for the time-tracking route: Timer, Calendar, Tasks, Add.
 * Hidden from the ws-sm workspace up. The running card sits above it; with several items it
 * is a summary that opens the container as a bottom sheet.
 */
export function TimeTrackingMobileBar({ onNavigate }: Props) {
  const tt = useTimeTracking();
  const { t, primaryRunning: running, running: all, nowMs, stop } = tt;
  const several = all.length > 1;
  const [sheet, setSheet] = useState(false);
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
      <div className="h-16" aria-hidden />
      {running && several && (
        <button
          type="button"
          onClick={() => setSheet(true)}
          aria-haspopup="dialog"
          data-testid="mobile-running-summary"
          className="fixed inset-x-3 bottom-20 z-40 flex min-h-11 items-center gap-3 rounded-3xl border border-rose-200 bg-white p-4 text-left shadow-xl transition-colors hover:bg-rose-50 active:bg-rose-100 cursor-pointer motion-reduce:transition-none"
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
      )}
      {running && !several && (
        <div data-testid="mobile-running-card" className="fixed inset-x-3 bottom-20 z-40 rounded-3xl border border-rose-200 bg-white p-4 shadow-xl">
          <p className="type-overline text-rose-600">{t("Timer running", "Časovač beží", "Az időzítő fut")}</p>
          <ClockDigits value={elapsed} className="text-metric text-slate-900" />
          <p className="truncate text-body text-slate-700">{running.title || t("No title", "Bez názvu", "Nincs cím")}</p>
          <button
            type="button"
            onClick={() => void stop(running.id)}
            data-testid="mobile-running-stop"
            className="mt-3 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 text-ui font-semibold text-white transition-all hover:bg-rose-700 active:scale-95 cursor-pointer motion-reduce:transition-none"
          >
            <Square className="size-4 fill-current" />
            {t("Stop", "Zastaviť", "Leállítás")}
          </button>
        </div>
      )}
      {sheet && (
        <div className="fixed inset-0 z-[960]" data-testid="mobile-timer-sheet-root">
          <div className="absolute inset-0 bg-slate-900/40 animate-in fade-in duration-200 motion-reduce:animate-none" onClick={() => setSheet(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("Running timer", "Bežiaci časovač", "Futó időzítő")}
            data-testid="mobile-timer-sheet"
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl animate-in slide-in-from-bottom duration-200 motion-reduce:animate-none"
          >
            <TimerContainer
              touch
              onAdd={() => {
                setSheet(false);
                onNavigate("time-tracking");
              }}
            />
          </div>
        </div>
      )}
      <nav
        aria-label={t("Time tracking", "Evidencia času", "Időkövetés")}
        data-testid="time-mobile-bar"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
      >
        {item(t("Timer", "Časovač", "Időzítő"), <Timer className="size-4" />, () => onNavigate("time-tracking"), "mobile-tab-timer")}
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
