import { useEffect, useRef, useState } from "react";
import { ArrowRight, Play } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { useRecentProjects } from "../../hooks/useRecentProjects";
import { CycleRing } from "./CycleRing";
import { ClockDigits } from "./ClockDigits";
import { RoundTimerButton, roundButtonClass } from "./RoundTimerButton";
import { TimerBar } from "./TimerBar";
import type { TimeDeps } from "./shared";
import { entityAccentStyle } from "../../utils/entityAccent";
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
  const { enabled, ready, primaryRunning: running, running: runningAll, paused, nowMs, t, start, stop, resume, resumeAll } = useTimeTracking();
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

  const projectLine = running?.projectName || "";
  const pill = running ? (
    <div
      data-testid="header-timer-running"
      onClick={toggle}
      className={`inline-flex h-10 max-w-72 cursor-pointer items-center gap-2 rounded-full border pl-3 pr-1 shadow-2xs transition-colors xs:h-11 ${open ? "border-rose-300 bg-rose-100" : "border-rose-200 bg-rose-50 hover:border-rose-300"}`}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="header-timer-toggle"
        title={running.title || undefined}
        className="flex min-w-0 items-center gap-2 text-left text-ui cursor-pointer"
      >
        {/* One dot: it pulses to say "recording" and takes the project's colour when there is one. */}
        <span
          className="size-2.5 shrink-0 animate-pulse rounded-full motion-reduce:animate-none"
          style={{ backgroundColor: running.projectId ? projectColor(running.projectId) : "#e11d48" }}
          data-testid="header-timer-dot"
        />
        <span className="hidden min-w-0 flex-col leading-tight md:flex">
          <span className="truncate font-semibold text-gray-900">{running.title || t("Timer running", "Časovač beží", "Az időzítő fut")}</span>
          {projectLine && (
            <span className="flex items-center gap-1.5 type-meta text-gray-500" data-testid="header-timer-project">
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: running.projectId ? projectColor(running.projectId) : "#94a3b8" }} />
              <span className="truncate">{projectLine}</span>
            </span>
          )}
        </span>
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
      </button>
      {!several && (
        <CycleRing swap radius={20} buttonClass={roundButtonClass("pill")} className="shrink-0">
          <RoundTimerButton size="pill"
            kind="stop"
            label={t("Stop timer", "Zastaviť časovač", "Időzítő leállítása")}
            onClick={(e) => {
              e.stopPropagation();
              void stop(running.id);
            }}
            data-testid="header-timer-stop"
          />
        </CycleRing>
      )}
      {several && <span className="w-1" aria-hidden />}
    </div>
  ) : null;

  return (
    <>
      {!running && paused.length > 0 ? (
        <CycleRing radius={12}>
          <button
            type="button"
            onClick={() => void (paused.length > 1 ? resumeAll() : resume(paused[0].id))}
            data-testid="header-timer-resume"
            title={t("Resume", "Pokračovať", "Folytatás")}
            className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 text-ui font-semibold text-amber-800 shadow-2xs transition-colors hover:border-amber-300 hover:bg-amber-100 cursor-pointer md:h-9"
          >
            <Play className="size-3.5 fill-current text-amber-600" />
            <span className="hidden md:inline">{t("Paused", "Pozastavené", "Szüneteltetve")} · {t("Resume", "Pokračovať", "Folytatás")}</span>
          </button>
        </CycleRing>
      ) : !running ? (
        <button
          type="button"
          onClick={() => void start()}
          style={entityAccentStyle("time-tracking") as React.CSSProperties}
          data-testid="header-timer-start"
          title={t("Start timer", "Spustiť časovač", "Időzítő indítása")}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-1 pr-3 text-ui font-semibold text-gray-700 shadow-2xs transition-colors hover:border-entity-border hover:bg-entity-subtle hover:text-entity-text cursor-pointer xs:h-11"
        >
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-entity-solid text-white">
            <Play className="ml-0.5 size-3 fill-current" />
          </span>
          <span className="hidden md:inline">{t("Start timer", "Spustiť časovač", "Időzítő indítása")}</span>
        </button>
      ) : (
        // Not `relative`: the panel anchors to the (sticky) header, right-aligned, so it never runs under the sidebar.
        <div ref={wrap} className="shrink-0" style={entityAccentStyle("time-tracking") as React.CSSProperties}>
          {several ? <CycleRing radius={22} className="max-w-72">{pill}</CycleRing> : pill}
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
