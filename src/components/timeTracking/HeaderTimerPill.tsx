import { useEffect, useRef, useState } from "react";
import { ArrowRight, Play, Square } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { useRecentProjects } from "../../hooks/useRecentProjects";
import { IdleReminder } from "./IdleReminder";
import { ClockDigits } from "./ClockDigits";
import { TimerBar } from "./TimerBar";
import type { TimeDeps } from "./shared";
import { entityAccentStyle } from "../../utils/entityAccent";
import { elapsedSeconds, formatDuration, projectColor } from "../../utils/timeTracking.ts";

/**
 * The global timer in the header: while a timer runs it shows what, how long, and a Stop button;
 * with none running it is a "Start timer" button. Hidden for people without the module.
 *
 * Clicking the running pill anywhere but Stop opens the full timer bar under it (title, project,
 * billable, description), so the running entry can be edited from any page.
 */
export function HeaderTimerPill({ deps }: { deps?: TimeDeps | null }) {
  const { enabled, ready, running, nowMs, t, start, stop } = useTimeTracking();
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
          style={entityAccentStyle("time-tracking") as React.CSSProperties}
          data-testid="header-timer-start"
          title={t("Start timer", "Spustiť časovač", "Időzítő indítása")}
          className="inline-flex h-8.5 shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-ui font-semibold text-gray-700 shadow-2xs transition-colors hover:border-entity-border hover:bg-entity-subtle hover:text-entity-text cursor-pointer xs:h-9"
        >
          <Play className="size-3.5 fill-current text-entity-text" />
          <span className="hidden md:inline">{t("Start timer", "Spustiť časovač", "Időzítő indítása")}</span>
        </button>
      ) : (
        // Not `relative`: the panel anchors to the (sticky) header, right-aligned, so it never runs under the sidebar.
        <div ref={wrap} className="shrink-0" style={entityAccentStyle("time-tracking") as React.CSSProperties}>
          <div
            data-testid="header-timer-running"
            onClick={toggle}
            className={`inline-flex h-8.5 max-w-72 cursor-pointer items-center gap-2 rounded-md border pl-2.5 pr-1 shadow-2xs transition-colors xs:h-9 ${open ? "border-rose-300 bg-rose-100" : "border-rose-200 bg-rose-50 hover:border-rose-300"}`}
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
              <span className="hidden min-w-0 truncate font-semibold text-gray-800 md:inline">{running.title || t("Timer running", "Časovač beží", "Az időzítő fut")}</span>
              <ClockDigits
                value={formatDuration(elapsedSeconds(running.startAt, nowMs), true)}
                className="shrink-0 font-bold text-rose-700"
                data-testid="header-timer-elapsed"
              />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void stop();
              }}
              data-testid="header-timer-stop"
              aria-label={t("Stop timer", "Zastaviť časovač", "Időzítő leállítása")}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-rose-600 text-white transition-all hover:bg-rose-700 active:scale-95 cursor-pointer"
            >
              <Square className="size-3 fill-current" />
            </button>
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
      style={entityAccentStyle("time-tracking") as React.CSSProperties}
      className="absolute right-2 top-full z-[950] mt-1 w-[min(46rem,calc(100%-1rem))] rounded-lg shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 sm:right-4"
    >
      <TimerBar
        deps={deps}
        recentProjectIds={recentProjectIds}
        secondsByProject={secondsByProject}
        footer={
          <a
            href="#time-tracking"
            onClick={onClose}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-ui font-semibold text-entity-text hover:bg-gray-100"
          >
            {t("Open time tracking", "Otvoriť evidenciu času", "Időkövetés megnyitása")}
            <ArrowRight className="size-3.5" />
          </a>
        }
      />
    </div>
  );
}
