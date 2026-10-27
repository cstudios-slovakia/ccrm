import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Surface } from "../layout";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { useTimeEntries } from "../../hooks/useTimeEntries";
import { addDays, holidayName } from "../../utils/holidays.ts";
import { matchOpenTasks } from "../../utils/timeLinks.ts";
import {
  dayDot,
  formatDuration,
  groupByDay,
  parseDurationInput,
  todayIso,
  totalSeconds,
  type TimeEntry,
} from "../../utils/timeTracking.ts";
import { TimeApiError, createEntry, timeErrorMessage } from "../../utils/timeTrackingApi.ts";
import { teamRoleBadge, visibleEntryCost, withoutHiddenCost } from "../../utils/timeTeam.ts";
import type { Task } from "../../types";
import { EntryRow } from "./EntryRow";
import { ProjectPicker } from "./ProjectPicker";
import { RoleBadge } from "./RoleBadge";
import { UnsortedInbox } from "./UnsortedInbox";
import { scopeParam } from "./TimeListView";
import { useEntriesFocus, useViewingAsOptional, viewingFromScope } from "./ViewingAsContext";
import { initials, useMoney, useTimeLookups, type TimeDeps } from "./shared";

interface Props {
  deps: TimeDeps;
  scope: string;
  recentProjectIds: string[];
  secondsByProject?: Record<string, number>;
  onOpen: (entry: TimeEntry) => void;
}

const STRIP_DAYS = 14;

/** The Day tab: a 14-day strip, the day's header, an inline "Add row" for hours-only time, and the saved logs. */
export function TimeDayView({ deps, scope, recentProjectIds, secondsByProject, onOpen }: Props) {
  const tt = useTimeTracking();
  const { t, nowMs, settings } = tt;
  const money = useMoney(deps);
  const lookups = useTimeLookups(deps);
  const today = todayIso();
  const [selected, setSelected] = useState(today);
  const [stripEnd, setStripEnd] = useState(today);
  const stripStart = addDays(stripEnd, -(STRIP_DAYS - 1));
  const strip = useMemo(() => Array.from({ length: STRIP_DAYS }, (_, i) => addDays(stripStart, i)), [stripStart]);
  /* PHASE4-VIEWING-AS */
  const providedView = useViewingAsOptional();
  const entriesFocus = useEntriesFocus();
  const viewing = providedView ?? viewingFromScope(scope);
  const viewScope = entriesFocus
    ? entriesFocus.userId
    : viewing.mode === "team"
      ? "all"
      : viewing.mode === "user" && viewing.userId
        ? viewing.userId
        : "me";
  const wholeTeam = viewScope === "all";
  /* END-PHASE4-VIEWING-AS */
  const { entries } = useTimeEntries({ from: stripStart, to: stripEnd, userId: scopeParam(viewScope) });
  const byDay = useMemo(() => groupByDay(entries), [entries]);
  const calendar = tt.calendarFor(tt.workCountry);
  useEffect(() => {
    tt.ensureHolidayYears(tt.workCountry, [...new Set(strip.map((d) => Number(d.slice(0, 4))))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripStart, tt.workCountry, tt.enabled]);

  const locale = deps.language === "sk" ? "sk-SK" : deps.language === "hu" ? "hu-HU" : "en-US";
  const people = new Set(entries.map((e) => e.userId)).size || 1;
  const perDayTarget = (iso: string) => (calendar.isWorkingDay(iso) ? settings.hoursPerDay * 3600 * (wholeTeam ? people : 1) : 0);

  const dayEntries = byDay.get(selected) ?? [];
  const holiday = calendar.holiday(selected);
  const myTotal = totalSeconds(dayEntries.filter((e) => e.userId === tt.userId), nowMs);
  const teamTotal = totalSeconds(dayEntries, nowMs);

  const groups = useMemo(() => {
    const m = new Map<string, TimeEntry[]>();
    for (const e of dayEntries) m.set(e.userId, [...(m.get(e.userId) ?? []), e]);
    return [...m.entries()];
  }, [dayEntries]);

  // ----- Add row -----
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const openAdd = () => setAdding(true);
    window.addEventListener("ccrm-time-add-row", openAdd);
    return () => window.removeEventListener("ccrm-time-add-row", openAdd);
  }, []);
  const [rowProject, setRowProject] = useState<string | null>(null);
  const [rowTask, setRowTask] = useState<Task | null>(null);
  const [rowTaskQuery, setRowTaskQuery] = useState("");
  const [rowNotes, setRowNotes] = useState("");
  const [rowHours, setRowHours] = useState("");
  const [rowBillable, setRowBillable] = useState(settings.billableByDefault);
  const [busy, setBusy] = useState(false);
  const suggestions = useMemo(() => (rowTask ? [] : matchOpenTasks(deps.tasks, rowTaskQuery, deps.isTaskDone)), [deps.tasks, deps.isTaskDone, rowTaskQuery, rowTask]);

  const saveRow = async (): Promise<boolean> => {
    const sec = parseDurationInput(rowHours);
    if (!rowProject && !rowTask && deps.canPickProject) {
      tt.notify(t("Pick a project for this row.", "Vyberte projekt pre tento riadok.", "Válasszon projektet ehhez a sorhoz."), "warning");
      return false;
    }
    if (!sec) {
      tt.notify(t("Enter the hours, for example 1.5, 1:30 or 90m.", "Zadajte hodiny, napríklad 1.5, 1:30 alebo 90m.", "Adja meg az órákat, például 1.5, 1:30 vagy 90m."), "warning");
      return false;
    }
    setBusy(true);
    try {
      await createEntry({
        projectId: rowProject ?? undefined,
        taskId: rowTask?.id ?? null,
        description: rowTask ? null : rowNotes.trim() || null,
        entryDate: selected,
        durationSec: sec,
        billable: rowBillable,
        source: "day",
        originType: rowTask ? "task" : undefined,
        originId: rowTask?.id,
      });
      tt.bump();
      // Enter saves and opens the next empty row, keeping the project.
      setRowTask(null);
      setRowTaskQuery("");
      setRowNotes("");
      setRowHours("");
      return true;
    } catch (e) {
      tt.notify(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const chooseTask = (task: Task) => {
    setRowTask(task);
    setRowTaskQuery("");
    const resolved = lookups.resolveTaskProject(task);
    if (resolved.projectId) setRowProject(resolved.projectId);
  };

  return (
    <div className="grid gap-4" data-testid="time-day">
      {/* Day strip */}
      <Surface padding="none" className="flex w-full min-w-0 items-stretch gap-1 overflow-x-auto p-2" >
        <button type="button" onClick={() => setStripEnd(addDays(stripEnd, -STRIP_DAYS))} aria-label={t("Earlier", "Skôr", "Korábbi")} className="inline-flex w-8 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer">
          <ChevronLeft className="size-4" />
        </button>
        {strip.map((d) => {
          const list = byDay.get(d) ?? [];
          const sec = totalSeconds(list, nowMs);
          const off = calendar.isOffDay(d);
          const dot = dayDot(sec, perDayTarget(d));
          const h = calendar.holiday(d);
          const dt = new Date(`${d}T12:00:00`);
          return (
            <button
              key={d}
              type="button"
              onClick={() => setSelected(d)}
              data-testid="day-chip"
              data-date={d}
              data-off={off ? "1" : "0"}
              data-holiday={h ? "1" : "0"}
              title={h ? holidayName(h, tt.workCountry, deps.language) : undefined}
              className={`flex w-16 shrink-0 flex-col items-center gap-0.5 rounded-xl px-1 py-2 transition-all cursor-pointer ${
                d === selected ? "bg-teal-600 text-white shadow" : off ? "text-slate-400 hover:bg-slate-100" : "text-slate-700 hover:bg-slate-100"
              } ${d === today && d !== selected ? "ring-2 ring-teal-500/50" : ""}`}
            >
              <span className="text-micro font-semibold uppercase">{dt.toLocaleDateString(locale, { weekday: "short" })}</span>
              <span className="text-ui font-bold tabular-nums">{dt.getDate()}</span>
              <span className={`size-2 rounded-full ${d === selected ? "bg-white" : dot === "met" ? "bg-emerald-500" : dot === "short" ? "bg-amber-500" : "bg-slate-300"}`} data-dot={dot} />
              <span className="type-meta tabular-nums">{sec > 0 ? formatDuration(sec) : "–"}</span>
            </button>
          );
        })}
        <button type="button" onClick={() => setStripEnd(addDays(stripEnd, STRIP_DAYS))} aria-label={t("Later", "Neskôr", "Későbbi")} className="inline-flex w-8 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer">
          <ChevronRight className="size-4" />
        </button>
      </Surface>

      {/* Day header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="type-panel-title capitalize text-slate-900" data-testid="day-heading">
            {new Date(`${selected}T12:00:00`).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </h3>
          <p className="type-meta text-slate-500">
            {wholeTeam && <>{t("Team logged", "Tím zaznamenal", "A csapat rögzített")} <b className="tabular-nums">{formatDuration(teamTotal)}</b> · </>}
            {t("you", "vy", "Ön")} <b className="tabular-nums" data-testid="day-mine">{formatDuration(myTotal)}</b> {t("of", "z", "ennyiből:")} {formatDuration(perDayTarget(selected) / (wholeTeam ? people : 1))}
            {holiday && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-micro font-semibold text-slate-600" data-testid="holiday-chip">{t("State holiday", "Štátny sviatok", "Állami ünnep")} · {holidayName(holiday, tt.workCountry, deps.language)}</span>}
          </p>
        </div>
        <button type="button" onClick={() => setAdding(true)} data-testid="day-add-row" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-ui font-semibold text-primary-foreground transition-all active:scale-95 cursor-pointer">
          <Plus className="size-4" />
          {t("Add row", "Pridať riadok", "Sor hozzáadása")}
        </button>
      </div>

      {adding && (
        <Surface tone="inset" className="grid gap-2" >
          <div className="flex flex-col items-stretch gap-2 ws-sm:flex-row ws-sm:flex-wrap ws-sm:items-start" data-testid="day-add-form">
            <ProjectPicker
              projects={deps.projects}
              leads={deps.leads}
              projectTypes={deps.projectTypes}
              value={rowProject}
              onChange={setRowProject}
              t={t}
              recentIds={recentProjectIds}
              secondsByProject={secondsByProject}
              onCreateProject={deps.onCreateProject}
              disabled={!deps.canPickProject}
            />
            <div className="relative min-w-40 flex-1">
              {rowTask ? (
                <div className="flex h-9 items-center justify-between gap-2 rounded-xl bg-teal-50 px-3 text-ui font-semibold text-teal-800">
                  <span className="truncate">{rowTask.title}</span>
                  <button type="button" onClick={() => setRowTask(null)} className="text-teal-600 cursor-pointer" aria-label={t("Unlink task", "Odpojiť úlohu", "Feladat leválasztása")}>×</button>
                </div>
              ) : (
                <>
                  <input
                    value={rowNotes}
                    onChange={(e) => { setRowNotes(e.target.value); setRowTaskQuery(e.target.value); }}
                    onKeyDown={(e) => { if (e.key === "Enter") void saveRow(); }}
                    placeholder={t("Notes, or type to find a task", "Poznámky alebo hľadajte úlohu", "Jegyzet, vagy írjon a feladat kereséséhez")}
                    data-testid="day-row-notes"
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-ui outline-none focus:border-primary"
                  />
                  {suggestions.length > 0 && (
                    <div className="absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                      {suggestions.map((s) => (
                        <button key={s.id} type="button" onClick={() => chooseTask(s)} data-testid="day-row-task-option" className="block w-full truncate px-3 py-2 text-left text-ui font-semibold hover:bg-slate-50 cursor-pointer">{s.title}</button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <input
              value={rowHours}
              onChange={(e) => setRowHours(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void saveRow(); }}
              placeholder="1:30"
              data-testid="day-row-hours"
              className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-center text-ui tabular-nums outline-none focus:border-primary ws-sm:w-24"
            />
            <label className="flex h-9 cursor-pointer items-center gap-1.5 text-ui text-slate-600">
              <input type="checkbox" checked={rowBillable} onChange={(e) => setRowBillable(e.target.checked)} className="size-4 accent-emerald-600" />
              {t("Billable", "Fakturovateľné", "Számlázható")}
            </label>
            <button type="button" onClick={() => void saveRow()} disabled={busy} data-testid="day-row-save" className="h-9 rounded-xl bg-primary px-4 text-ui font-semibold text-primary-foreground disabled:opacity-60 cursor-pointer">{t("Save", "Uložiť", "Mentés")}</button>
            <button type="button" onClick={() => setAdding(false)} className="h-9 rounded-xl px-3 text-ui font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer">{t("Close", "Zavrieť", "Bezárás")}</button>
          </div>
        </Surface>
      )}

      {/* Saved logs, grouped by person */}
      {groups.length === 0 ? (
        <Surface><p className="text-body text-slate-500" data-testid="day-empty">{t("Nothing logged on this day yet.", "V tento deň zatiaľ nič nie je zaznamenané.", "Ezen a napon még nincs rögzített idő.")}</p></Surface>
      ) : (
        groups.map(([userId, list]) => {
          const u = lookups.userById.get(userId);
          const seeCost = userId === (tt.userId || "") || tt.viewer.canCosts;
          const rateEntry = seeCost ? list.find((e) => "costRate" in e) : undefined;
          const costNumbers = list.map((e) => visibleEntryCost(e, tt.userId || "", tt.viewer.canCosts));
          const cost = costNumbers.some((n) => n != null) ? costNumbers.reduce((sum: number, n) => sum + (n ?? 0), 0) : null;
          const employee = deps.employees.find((e) => e.userId === userId);
          return (
            <Surface key={userId} padding="none" className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3" data-testid="day-user-header">
                <span className="inline-flex size-8 items-center justify-center rounded-full text-micro font-bold text-white" style={{ backgroundColor: u?.color || "#64748b" }}>{initials(u?.name || "?")}</span>
                <span className="type-card-title text-slate-900">{u?.name ?? t("Unknown user", "Neznámy používateľ", "Ismeretlen felhasználó")}</span>
                {/* PHASE4-VIEWING-AS */}
                {wholeTeam && <RoleBadge badge={teamRoleBadge(u?.role, employee?.kind)} t={t} />}
                {/* END-PHASE4-VIEWING-AS */}
                {seeCost && rateEntry && (
                  rateEntry.costRate ? (
                    <span className="type-meta tabular-nums text-violet-700">{money(rateEntry.costRate)}/h</span>
                  ) : (
                    <span className="type-meta text-amber-700" data-testid="no-rate">{t("no rate — no employee linked", "bez sadzby — nie je pripojený zamestnanec", "nincs díj — nincs munkatárs hozzárendelve")}</span>
                  )
                )}
                <span className="ml-auto flex items-center gap-4">
                  {cost !== null && <span className="tabular-nums text-violet-700">{money(cost)}</span>}
                  <span className="font-semibold tabular-nums text-slate-900">{formatDuration(totalSeconds(list, nowMs))}</span>
                </span>
              </div>
              <div role="table" className="divide-y divide-slate-100">
                {list.map((e) => (
                  <EntryRow key={e.id} entry={withoutHiddenCost(e, tt.userId || "", tt.viewer.canCosts)} deps={deps} onOpen={onOpen} />
                ))}
              </div>
            </Surface>
          );
        })
      )}
      {/* PHASE5-UNSORTED */}
      {viewScope === "me" && <UnsortedInbox deps={deps} />}
      {/* END-PHASE5-UNSORTED */}
    </div>
  );
}
