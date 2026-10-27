import { Play, Square } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { IdleReminder } from "./IdleReminder";
import { elapsedSeconds, formatDuration, projectColor } from "../../utils/timeTracking.ts";

/**
 * The global timer in the header: while a timer runs it shows what, for which project, how long,
 * and a Stop button; with none running it is a "Start timer" button. Hidden for people without
 * the module.
 */
export function HeaderTimerPill() {
  const { enabled, ready, running, nowMs, t, start, stop } = useTimeTracking();
  if (!enabled || !ready) return null;

  return (
    <>
      <IdleReminder />
      {!running ? (
        <button
          type="button"
          onClick={() => void start()}
          data-testid="header-timer-start"
          title={t("Start timer", "Spustiť časovač", "Időzítő indítása")}
          className="inline-flex h-8.5 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white/80 px-2.5 text-ui font-semibold text-slate-700 shadow-sm transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 cursor-pointer xs:h-9"
        >
          <Play className="size-3.5 fill-current text-teal-600" />
          <span className="hidden md:inline">{t("Start timer", "Spustiť časovač", "Időzítő indítása")}</span>
        </button>
      ) : (
        <div data-testid="header-timer-running" className="inline-flex h-8.5 max-w-72 shrink-0 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 pl-2.5 pr-1 shadow-sm xs:h-9">
          <a href="#time-tracking" className="flex min-w-0 items-center gap-2 text-ui" title={running.title}>
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-rose-600" />
            <span className="hidden min-w-0 truncate font-semibold text-slate-800 md:inline">{running.title || t("Timer running", "Časovač beží", "Az időzítő fut")}</span>
            {running.projectId && <span className="hidden size-2.5 shrink-0 rounded-full lg:inline" style={{ backgroundColor: projectColor(running.projectId) }} />}
            <span className="shrink-0 font-bold tabular-nums text-rose-700" data-testid="header-timer-elapsed">{formatDuration(elapsedSeconds(running.startAt, nowMs), true)}</span>
          </a>
          <button
            type="button"
            onClick={() => void stop()}
            data-testid="header-timer-stop"
            aria-label={t("Stop timer", "Zastaviť časovač", "Időzítő leállítása")}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-rose-600 text-white transition-all hover:bg-rose-700 active:scale-95 cursor-pointer"
          >
            <Square className="size-3 fill-current" />
          </button>
        </div>
      )}
    </>
  );
}
