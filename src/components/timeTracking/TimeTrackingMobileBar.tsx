import type { ReactNode } from "react";
import { CalendarDays, ListTodo, Plus, Square, Timer } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { elapsedSeconds, formatDuration } from "../../utils/timeTracking.ts";

interface Props {
  onNavigate: (route: string) => void;
}

/**
 * Phone bar for the time-tracking route: Timer, Calendar, Tasks, Add.
 * Hidden from the ws-sm workspace up. The running card sits above it.
 */
export function TimeTrackingMobileBar({ onNavigate }: Props) {
  const tt = useTimeTracking();
  const { t, running, nowMs, stop } = tt;
  const elapsed = running ? formatDuration(elapsedSeconds(running.startAt, nowMs), true) : "";

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
      {running && (
        <div data-testid="mobile-running-card" className="fixed inset-x-3 bottom-20 z-40 rounded-3xl border border-rose-200 bg-white p-4 shadow-xl">
          <p className="type-overline text-rose-600">{t("Timer running", "Časovač beží", "Az időzítő fut")}</p>
          <p className="text-metric tabular-nums text-slate-900">{elapsed}</p>
          <p className="truncate text-body text-slate-700">{running.title || t("No title", "Bez názvu", "Nincs cím")}</p>
          <button
            type="button"
            onClick={() => void stop()}
            data-testid="mobile-running-stop"
            className="mt-3 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 text-ui font-semibold text-white cursor-pointer"
          >
            <Square className="size-4 fill-current" />
            {t("Stop", "Zastaviť", "Leállítás")}
          </button>
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
