import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Surface, Toolbar } from "../layout";
import { CustomSelect } from "../ui/CustomSelect";
import { useTimeEntries } from "../../hooks/useTimeEntries";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { addDays, holidayName } from "../../utils/holidays.ts";
import { isAdminRoleName } from "../../utils/permissions";
import { paidMonthsForOwner } from "../../utils/timeLock";
import {
  buildTimesheet,
  copyRowKeys,
  durationPatch,
  editCell,
  rowExists,
  timesheetCellLock,
  type TimesheetRow,
  type TimesheetRowKey,
} from "../../utils/timeTimesheet.ts";
import { countryForScope } from "../../utils/timeCalendar.ts";
import { formatDuration, parseDurationInput, projectColor, todayIso, weekDays, weekStart, type TimeEntry } from "../../utils/timeTracking.ts";
import { TimeApiError, createEntry, timeErrorMessage, updateEntry } from "../../utils/timeTrackingApi.ts";
import { ProjectPicker } from "./ProjectPicker";
import { SubmitWeekButton } from "./SubmitWeekButton";
import { scopeParam } from "./TimeListView";
import { describeTimeLock, useTimeLookups, type TimeDeps } from "./shared";

interface Props {
  deps: TimeDeps;
  scope: string;
  recentProjectIds: string[];
  secondsByProject?: Record<string, number>;
  onOpen: (entry: TimeEntry) => void;
}

/** Weekly grid: a row is a project and a task, a column is a day, and the last row totals the hours. */
export function TimeTimesheetView({ deps, scope, recentProjectIds, secondsByProject, onOpen }: Props) {
  const tt = useTimeTracking();
  const { t, settings, nowMs } = tt;
  const lookups = useTimeLookups(deps);
  const [anchor, setAnchor] = useState(() => todayIso());
  const [extra, setExtra] = useState<TimesheetRowKey[]>([]);
  const [adding, setAdding] = useState(false);
  const [draftProject, setDraftProject] = useState<string | null>(null);
  const [draftTask, setDraftTask] = useState("");

  const days = useMemo(() => weekDays(anchor), [anchor]);
  const from = days[0];
  const to = days[6];
  const byPerson = scope === "all";
  const scopeUserId = scope !== "me" && scope !== "all" ? scope : undefined;
  const { entries, loading } = useTimeEntries({ from, to, userId: scopeParam(scope) });
  const prevFrom = addDays(from, -7);
  const prevTo = addDays(from, -1);
  const { entries: previous } = useTimeEntries({ from: prevFrom, to: prevTo, userId: scopeParam(scope) });

  useEffect(() => {
    setExtra([]);
    setAdding(false);
  }, [from, scope]);

  const people = useMemo(
    () => deps.employees.filter((e) => e.userId).map((e) => ({ userId: e.userId as string, workCountry: e.workCountry ?? null })),
    [deps.employees],
  );
  const country = countryForScope(scope, tt.userId, tt.workCountry, tt.defaultCountry, people);
  const calendar = tt.calendarFor(country);
  useEffect(() => {
    tt.ensureHolidayYears(country, [...new Set(days.map((d) => Number(d.slice(0, 4))))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, country, tt.enabled]);

  const model = useMemo(
    () => buildTimesheet(entries, anchor, nowMs, { extraRows: extra, byPerson }),
    [entries, anchor, nowMs, extra, byPerson],
  );
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const locale = deps.language === "sk" ? "sk-SK" : deps.language === "hu" ? "hu-HU" : "en-US";
  const today = todayIso(new Date(nowMs));
  const isAdmin = isAdminRoleName(deps.currentUser.role);
  const stampedByUser = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const entry of entries) {
      if (!entry.paidPayrollMonth || !entry.userId) continue;
      const month = entry.entryDate.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) continue;
      const list = map.get(entry.userId);
      if (list) {
        if (!list.includes(month)) list.push(month);
      } else {
        map.set(entry.userId, [month]);
      }
    }
    return map;
  }, [entries]);
  const lockFor = (userId: string | null | undefined, employeeId?: string | null) => ({
    lockAfterDays: settings.lockAfterDays,
    isAdmin,
    paidPayrollMonths: paidMonthsForOwner(
      deps.salaries,
      deps.employees,
      { userId: userId ?? null, employeeId: employeeId ?? null },
      userId ? stampedByUser.get(userId) : undefined,
    ),
  });
  const mayEdit = scope !== "all" && (scopeUserId ? tt.viewer.canTeam : tt.viewer.canEdit);

  const taskOptions = deps.tasks
    .filter((task) => !task.archived && draftProject && task.relatedProjectId === draftProject)
    .map((task) => ({ value: task.id, label: task.title }));

  const fail = (e: unknown) => tt.notify(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");

  const cellEntriesFor = (row: TimesheetRow, day: string) => {
    const cell = row.cells.find((c) => c.day === day);
    const cellEntries = (cell?.entryIds ?? []).map((id) => byId.get(id)).filter((e): e is TimeEntry => !!e);
    return { cell, cellEntries };
  };
  const gateFor = (row: TimesheetRow, day: string, cellEntries: TimeEntry[]) => {
    const owner = cellEntries[0]?.userId ?? row.userId ?? scopeUserId ?? tt.userId;
    const employeeId = cellEntries.find((e) => e.employeeId)?.employeeId ?? null;
    return timesheetCellLock(cellEntries, day, lockFor(owner, employeeId), today);
  };

  const commit = async (row: TimesheetRow, day: string, typed: number | null) => {
    if (!mayEdit) return;
    const { cell, cellEntries } = cellEntriesFor(row, day);
    if (!cell) return;
    const gate = gateFor(row, day, cellEntries);
    if (gate.locked) {
      tt.notify(
        gate.reason
          ? describeTimeLock(gate.reason, t)
          : t("This entry is locked.", "Tento záznam je uzamknutý.", "Ez a bejegyzés zárolt."),
        "warning",
      );
      return;
    }
    const edit = editCell(cellEntries, typed, row, day);
    if (edit.action === "noop") {
      if (edit.reason === "overflow") {
        tt.notify(
          t(
            "Earlier entries in this cell already add up to more than that.",
            "Skoršie záznamy v tejto bunke už dávajú viac.",
            "A cella korábbi bejegyzései már ennél többet adnak ki.",
          ),
          "warning",
        );
      } else if (edit.reason === "running") {
        tt.notify(t("Stop the running timer before editing this cell.", "Pred úpravou bunky zastavte bežiaci časovač.", "Állítsa le a futó időzítőt a cella szerkesztése előtt."), "warning");
      }
      return;
    }
    if (edit.action === "update") {
      const target = byId.get(edit.id);
      if (!target) return;
      try {
        await updateEntry(target.id, durationPatch(target, edit.durationSec));
        tt.bump();
      } catch (e) {
        fail(e);
      }
      return;
    }
    try {
      await createEntry({
        userId: row.userId ?? scopeUserId,
        projectId: edit.projectId,
        taskId: edit.taskId,
        entryDate: edit.entryDate,
        durationSec: edit.durationSec,
        billable: settings.billableByDefault,
        source: "timesheet",
      });
      tt.bump();
    } catch (e) {
      fail(e);
    }
  };

  const copyLastWeek = () => {
    const copied = copyRowKeys(
      previous.map((e) => ({ projectId: e.projectId, taskId: e.taskId, userId: e.userId })),
      [...model.rows, ...extra],
      byPerson,
    );
    if (copied.length === 0) {
      tt.notify(t("Last week has no extra rows to copy.", "Minulý týždeň nemá ďalšie riadky na skopírovanie.", "A múlt hétnek nincs másolható sora."), "warning");
      return;
    }
    setExtra((rows) => [...rows, ...copied]);
  };

  const addRow = () => {
    if (!draftProject && !draftTask) {
      tt.notify(t("Pick a project for the new row.", "Vyberte projekt pre nový riadok.", "Válasszon projektet az új sorhoz."), "warning");
      return;
    }
    const row: TimesheetRowKey = { projectId: draftProject, taskId: draftTask || null, userId: byPerson ? null : scopeUserId ?? tt.userId };
    if (rowExists([...model.rows, ...extra], row, byPerson)) {
      tt.notify(t("That row is already on this week.", "Tento riadok už v tomto týždni je.", "Ez a sor már szerepel ezen a héten."), "warning");
      return;
    }
    setExtra((rows) => [...rows, row]);
    setDraftTask("");
    setAdding(false);
  };

  const range = `${new Date(`${from}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" })} – ${new Date(`${to}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}`;
  const rowLabel = (row: TimesheetRow): { project: string; task: string; person: string } => ({
    project: row.projectId ? lookups.projectName(row.projectId) : t("Assign project", "Priradiť projekt", "Projekt hozzárendelése"),
    task: row.taskId ? lookups.taskById.get(row.taskId)?.title || t("Task", "Úloha", "Feladat") : "",
    person: row.userId ? lookups.userById.get(row.userId)?.name || "" : "",
  });

  return (
    <div className="grid gap-3" data-testid="time-timesheet">
      <Toolbar
        filters={
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" onClick={() => setAnchor(addDays(weekStart(anchor), -7))} aria-label={t("Previous week", "Predošlý týždeň", "Előző hét")} className="inline-flex size-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer">
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" onClick={() => setAnchor(todayIso())} className="inline-flex h-9 items-center rounded-xl px-3 text-ui font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
              {t("Today", "Dnes", "Ma")}
            </button>
            <button type="button" onClick={() => setAnchor(addDays(weekStart(anchor), 7))} aria-label={t("Next week", "Ďalší týždeň", "Következő hét")} className="inline-flex size-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer">
              <ChevronRight className="size-4" />
            </button>
            <span className="px-2 text-ui font-semibold capitalize text-slate-800">{range}</span>
          </div>
        }
        trailing={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={copyLastWeek} disabled={!mayEdit} data-testid="timesheet-copy" className="inline-flex h-9 items-center rounded-xl px-3 text-ui font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer">
              {t("Copy rows from last week", "Kopírovať riadky z minulého týždňa", "Sorok másolása a múlt hétről")}
            </button>
            <button type="button" onClick={() => setAdding(true)} disabled={!mayEdit} data-testid="timesheet-add-row" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-ui font-semibold text-primary-foreground cursor-pointer disabled:opacity-40">
              <Plus className="size-4" />
              {t("Add row", "Pridať riadok", "Sor hozzáadása")}
            </button>
          </div>
        }
        primary={
          <SubmitWeekButton
            weekStart={from}
            userId={scopeUserId ?? (scope === "me" ? tt.userId ?? undefined : undefined)}
            entries={entries.map((e) => ({ entryDate: e.entryDate, userId: e.userId, approvalStatus: e.approvalStatus, running: e.running }))}
          />
        }
      />

      {byPerson && (
        <p className="type-meta text-slate-500">{t("Pick one person to edit the timesheet.", "Vyberte jednu osobu, ak chcete upravovať výkaz.", "Válasszon egy személyt a munkaidő-nyilvántartás szerkesztéséhez.")}</p>
      )}

      {adding && mayEdit && (
        <Surface tone="inset" className="flex flex-wrap items-center gap-2">
          <ProjectPicker
            projects={deps.projects}
            leads={deps.leads}
            projectTypes={deps.projectTypes}
            value={draftProject}
            onChange={(id) => {
              setDraftProject(id);
              setDraftTask("");
            }}
            t={t}
            recentIds={recentProjectIds}
            secondsByProject={secondsByProject}
            onCreateProject={deps.onCreateProject}
            disabled={!deps.canPickProject}
          />
          <div className="min-w-40 flex-1">
            <CustomSelect
              value={draftTask}
              onChange={setDraftTask}
              options={[{ value: "", label: t("No task", "Bez úlohy", "Feladat nélkül") }, ...taskOptions]}
              placeholder={t("Task", "Úloha", "Feladat")}
              size="sm"
              disabled={!draftProject}
            />
          </div>
          <button type="button" onClick={addRow} className="inline-flex h-9 items-center rounded-xl bg-teal-600 px-3 text-ui font-semibold text-white cursor-pointer">
            {t("Add", "Pridať", "Hozzáadás")}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="inline-flex h-9 items-center rounded-xl px-3 text-ui font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer">
            {t("Cancel", "Zrušiť", "Mégse")}
          </button>
        </Surface>
      )}

      <Surface padding="none" className="overflow-x-auto">
        <table className="w-full border-collapse" data-testid="timesheet-grid">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white px-3 py-2 text-left type-overline text-slate-500">{t("Project", "Projekt", "Projekt")}</th>
              {model.days.map((day) => {
                const holiday = calendar.holiday(day);
                const offName = holiday ? holidayName(holiday, country, deps.language) : calendar.override(day)?.kind === "extraDayOff" ? calendar.override(day)?.name : null;
                const dt = new Date(`${day}T12:00:00`);
                return (
                  <th
                    key={day}
                    data-testid="timesheet-day"
                    data-date={day}
                    data-holiday={offName ? "1" : "0"}
                    className={`min-w-16 px-1 py-2 text-center ${offName ? "bg-slate-100" : ""} ${calendar.isOffDay(day) && !offName ? "text-slate-400" : "text-slate-600"}`}
                  >
                    <div className="type-overline">{dt.toLocaleDateString(locale, { weekday: "short" })}</div>
                    <div className={`text-ui font-semibold tabular-nums ${day === today ? "text-teal-700" : ""}`}>{dt.getDate()}</div>
                    {offName && <div className="truncate text-micro font-semibold text-slate-500" data-testid="timesheet-holiday">{offName}</div>}
                  </th>
                );
              })}
              <th className="px-2 py-2 text-right type-overline text-slate-500">{t("Total", "Spolu", "Összesen")}</th>
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row) => {
              const label = rowLabel(row);
              return (
                <tr key={`${row.userId ?? ""}-${row.projectId ?? ""}-${row.taskId ?? ""}`} className="border-t border-slate-100">
                  <th className="sticky left-0 bg-white px-3 py-1.5 text-left font-normal">
                    <div className="flex items-center gap-1.5">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: projectColor(row.projectId) }} />
                      <span className="min-w-0">
                        {byPerson && label.person && <span className="block type-meta text-slate-500">{label.person}</span>}
                        <span className={`block truncate text-ui font-semibold ${row.projectId ? "text-slate-800" : "text-amber-700"}`}>{label.project}</span>
                        {label.task && <span className="block truncate type-meta text-slate-500">{label.task}</span>}
                      </span>
                    </div>
                  </th>
                  {row.cells.map((cell) => {
                    const last = cell.lastId ? byId.get(cell.lastId) : undefined;
                    const { cellEntries } = cellEntriesFor(row, cell.day);
                    const gate = gateFor(row, cell.day, cellEntries);
                    const disabled = !mayEdit || gate.locked;
                    const lockTitle = gate.locked && gate.reason ? describeTimeLock(gate.reason, t) : undefined;
                    return (
                      <td
                        key={cell.day}
                        onPointerDown={() => {
                          if (mayEdit && gate.locked && lockTitle) tt.notify(lockTitle, "warning");
                        }}
                        className={`px-1 py-1 ${calendar.holiday(cell.day) || calendar.override(cell.day)?.kind === "extraDayOff" ? "bg-slate-100" : ""}`}
                      >
                        <Cell
                          seconds={cell.seconds}
                          disabled={disabled}
                          title={lockTitle}
                          onCommit={(sec) => void commit(row, cell.day, sec)}
                          onInvalid={() => tt.notify(t("Enter the hours, for example 1.5, 1:30 or 90m.", "Zadajte hodiny, napríklad 1.5, 1:30 alebo 90m.", "Adja meg az órákat, például 1.5, 1:30 vagy 90m."), "warning")}
                          onOpen={last ? () => onOpen(last) : undefined}
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-right text-ui font-semibold tabular-nums text-slate-800">{row.totalSec > 0 ? formatDuration(row.totalSec) : "–"}</td>
                </tr>
              );
            })}
            {!loading && model.rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-ui text-slate-500">{t("No rows this week. Add one, or copy last week's rows.", "Tento týždeň nemá riadky. Pridajte riadok alebo skopírujte minulý týždeň.", "Ezen a héten nincs sor. Adjon hozzá egyet, vagy másolja a múlt hetet.")}</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50" data-testid="timesheet-total">
              <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left text-ui font-semibold text-slate-800">{t("Totals", "Súčty", "Összesen")}</th>
              {model.columnTotals.map((sec, i) => (
                <td key={model.days[i]} className="px-1 py-2 text-center text-ui font-semibold tabular-nums text-slate-800">{sec > 0 ? formatDuration(sec) : "–"}</td>
              ))}
              <td className="px-2 py-2 text-right text-ui font-bold tabular-nums text-teal-700">{model.grandTotal > 0 ? formatDuration(model.grandTotal) : "–"}</td>
            </tr>
          </tfoot>
        </table>
      </Surface>
    </div>
  );
}

function Cell({ seconds, disabled, title, onCommit, onInvalid, onOpen }: { seconds: number; disabled: boolean; title?: string; onCommit: (sec: number) => void; onInvalid: () => void; onOpen?: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (seconds > 0 ? formatDuration(seconds) : "");
  return (
    <input
      value={shown}
      disabled={disabled}
      title={title}
      onFocus={() => setText(seconds > 0 ? formatDuration(seconds) : "")}
      onChange={(e) => setText(e.target.value)}
      onDoubleClick={() => onOpen?.()}
      onBlur={() => {
        const raw = (text ?? "").trim();
        const current = seconds > 0 ? formatDuration(seconds) : "";
        setText(null);
        if (!raw || raw === current) return;
        const sec = parseDurationInput(raw);
        if (sec == null) onInvalid();
        else onCommit(sec);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="h-9 w-full rounded-lg bg-transparent px-1 text-right text-ui tabular-nums text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-teal-600/40 disabled:text-slate-400"
    />
  );
}
