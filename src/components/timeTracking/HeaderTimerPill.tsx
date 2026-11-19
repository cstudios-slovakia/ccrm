import { useEffect, useRef, useState } from "react";
import { ArrowRight, Play, Square } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { useRecentProjects } from "../../hooks/useRecentProjects";
import { IdleReminder } from "./IdleReminder";
import { ClockDigits } from "./ClockDigits";
import { TimerBar } from "./TimerBar";
import type { TimeDeps } from "./shared";
import { elapsedSeconds, formatDuration, projectColor } from "../../utils/timeTracking.ts";
import { extraItemsLabel, workedClockSeconds } from "../../utils/timeContainer.ts";

/**
 * The global timer in the header: while a timer runs it shows what, how long, and a Stop button;
 * with none running it is a "Start timer" button. Hidden for people without the module.
 *
 * Clicking the running pill anywhere but Stop opens the full timer bar under it (title, project,
 * billable, description), so the running entry can be edited from any page.
 */
export function HeaderTimerPill({ deps }: { deps?: TimeDeps | null }) {
  const { enabled, ready, primaryRunning: running, running: runningAll, nowMs, t, start, stop } = useTimeTracking();
  const several = runningAll.length > 1;
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!running) setOpen(false);
  }, [running]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!enabled || !ready) return null;

  const toggle = () => {
    if (deps) setOpen((v) => !v);
    else window.location.hash = "time-tracking";
  };

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
        // Not `relative`: the panel anchors to the (sticky) header, right-aligned, so it never runs under the sidebar.
        <div ref={wrap} className="shrink-0">
          <div
            data-testid="header-timer-running"
            onClick={toggle}
            className={`inline-flex h-8.5 max-w-72 cursor-pointer items-center gap-2 rounded-xl border pl-2.5 pr-1 shadow-sm transition-colors xs:h-9 ${open ? "border-rose-300 bg-rose-100" : "border-rose-200 bg-rose-50 hover:border-rose-300"}`}
          >
            <button
              type="button"
              aria-expanded={open}
              aria-haspopup="dialog"
              data-testid="header-timer-toggle"
              title={running.title || undefined}
              className="flex min-w-0 items-center gap-2 text-ui cursor-pointer"
            >
              {/* One dot: it pulses to say "recording" and takes the project's colour when there is one. */}
              <span
                className="size-2.5 shrink-0 animate-pulse rounded-full"
                style={{ backgroundColor: running.projectId ? projectColor(running.projectId) : "#e11d48" }}
                data-testid="header-timer-dot"
              />
              <span className="hidden min-w-0 truncate font-semibold text-slate-800 md:inline">{running.title || t("Timer running", "Časovač beží", "Az időzítő fut")}</span>
              {several && (
                <span className="shrink-0 rounded-md bg-rose-100 px-1.5 type-meta font-bold text-rose-700" data-testid="header-timer-extra" title={t(`${runningAll.length} running`, `beží ${runningAll.length}`, `${runningAll.length} fut`)}>
                  {extraItemsLabel(runningAll.length)}
                </span>
              )}
              <ClockDigits
                value={formatDuration(several ? workedClockSeconds(runningAll, nowMs) : elapsedSeconds(running.startAt, nowMs), true)}
                className="shrink-0 font-bold text-rose-700"
                data-testid="header-timer-elapsed"
              />
              {/* Phase 7: the cycle ring goes here. */}
              <span data-slot="cycle-ring" className="empty:hidden" />
            </button>
            {!several && <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void stop(running.id);
              }}
              data-testid="header-timer-stop"
              aria-label={t("Stop timer", "Zastaviť časovač", "Időzítő leállítása")}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-rose-600 text-white transition-all hover:bg-rose-700 active:scale-95 cursor-pointer"
            >
              <Square className="size-3 fill-current" />
            </button>}
            {several && <span className="w-1" aria-hidden />}
          </div>
          {open && deps && <HeaderTimerPanel deps={deps} onClose={() => setOpen(false)} />}
        </div>
      )}
    </>
  );
}

/** The timer bar under the pill. Its own component so the recent-projects fetch runs only while open. */
function HeaderTimerPanel({ deps, onClose }: { deps: TimeDeps; onClose: () => void }) {
  const { t } = useTimeTracking();
  const { recentProjectIds, secondsByProject } = useRecentProjects();
  return (
    <div
      role="dialog"
      aria-label={t("Running timer", "Bežiaci časovač", "Futó időzítő")}
      data-testid="header-timer-panel"
      className="absolute right-2 top-full z-[950] mt-1 w-[min(46rem,calc(100%-1rem))] rounded-3xl shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200 sm:right-4"
    >
      <TimerBar
        deps={deps}
        recentProjectIds={recentProjectIds}
        secondsByProject={secondsByProject}
        footer={
          <a
            href="#time-tracking"
            onClick={onClose}
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-ui font-semibold text-primary hover:bg-slate-100"
          >
            {t("Open time tracking", "Otvoriť evidenciu času", "Időkövetés megnyitása")}
            <ArrowRight className="size-3.5" />
          </a>
        }
      />
    </div>
  );
}
