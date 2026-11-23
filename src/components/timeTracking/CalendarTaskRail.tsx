import { useMemo } from "react";
import { CheckSquare, GripVertical } from "lucide-react";
import { Surface } from "../layout";
import { useTimeEntries } from "../../hooks/useTimeEntries";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { entryDurationSec } from "../../utils/timeCalendar.ts";
import { formatDuration, projectColor, todayIso, weekDays } from "../../utils/timeTracking.ts";
import { RoundTimerButton } from "./RoundTimerButton";
import { useTimeLookups, type TimeDeps } from "./shared";

/**
 * The Calendar's side rail: the viewer's open tasks that are due this week or have time tracked this week
 * (own entries of the current week, whatever the Calendar is showing). Drag a row onto the calendar or press play.
 */
export function CalendarTaskRail({ deps }: { deps: TimeDeps }) {
  const tt = useTimeTracking();
  const { t, nowMs, settings } = tt;
  const lookups = useTimeLookups(deps);
  const week = useMemo(() => weekDays(todayIso(new Date(nowMs))), [nowMs]);
  const { entries: weekEntries } = useTimeEntries({ from: week[0], to: week[6] });

  const trackedByTask = useMemo(() => {
    const map = new Map<string, number>();
    const seen = new Set<string>();
    for (const entry of [...tt.running.filter((r) => r.entryDate >= week[0] && r.entryDate <= week[6]), ...weekEntries]) {
      if (!entry.taskId || seen.has(entry.id)) continue;
      seen.add(entry.id);
      map.set(entry.taskId, (map.get(entry.taskId) ?? 0) + entryDurationSec(entry, nowMs));
    }
    return map;
  }, [weekEntries, tt.running, week, nowMs]);

  const tasks = deps.tasks
    .filter((task) => {
      if (task.archived || deps.isTaskDone(task)) return false;
      const names = [task.owner, ...(task.assignedUsers ?? [])].filter(Boolean);
      if (!names.includes(deps.currentUser.name)) return false;
      const dueThisWeek = !!task.deadline && task.deadline >= week[0] && task.deadline <= week[6];
      return dueThisWeek || (trackedByTask.get(task.id) ?? 0) > 0;
    })
    .sort((a, b) => (a.deadline || "").localeCompare(b.deadline || "") || a.title.localeCompare(b.title));

  return (
    <aside className="ws-lg:w-72 ws-lg:shrink-0" data-testid="calendar-task-rail">
      <Surface className="flex max-h-[36rem] flex-col gap-2">
        <h3 className="flex items-center gap-2 type-label text-gray-800">
          <CheckSquare className="size-4 shrink-0 text-entity-text" />
          {t("Your tasks this week", "Vaše úlohy tento týždeň", "Az Ön feladatai ezen a héten")}
        </h3>
        <p className="type-meta text-gray-500">
          {t(
            "Drag a task onto the calendar to log time, or press play to start the timer on it.",
            "Úlohu pretiahnite do kalendára a zapíšte čas, alebo na nej spustite časovač tlačidlom prehrať.",
            "Húzza a feladatot a naptárra az idő rögzítéséhez, vagy a lejátszás gombbal indítsa rajta az időzítőt.",
          )}
        </p>
        <div className="flex flex-col gap-1.5 overflow-y-auto">
          {tasks.length === 0 && (
            <p className="text-ui text-gray-500">{t("No open tasks due or tracked this week.", "Žiadne otvorené úlohy s termínom alebo časom tento týždeň.", "Nincs ezen a héten esedékes vagy időt kapott nyitott feladat.")}</p>
          )}
          {tasks.map((task) => {
            const projectId = lookups.resolveTaskProject(task).projectId;
            const tracked = trackedByTask.get(task.id) ?? 0;
            return (
              <div key={task.id} className="flex items-center gap-1.5 rounded-md border border-gray-200/80 px-2 py-1.5">
                <span
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-ccrm-task", task.id);
                    e.dataTransfer.setData("text/plain", `task:${task.id}`);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="cursor-grab text-gray-400"
                  aria-label={t("Drag onto the calendar", "Pretiahnuť do kalendára", "Húzza a naptárra")}
                >
                  <GripVertical className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-ui font-semibold text-gray-800">{task.title}</div>
                  <div className="flex min-w-0 items-center gap-1.5 type-meta">
                    {projectId ? (
                      <>
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: projectColor(projectId) }} />
                        <span className="truncate text-gray-500">{lookups.projectName(projectId)}</span>
                      </>
                    ) : (
                      <span className="truncate text-amber-700">{t("No project", "Bez projektu", "Nincs projekt")}</span>
                    )}
                    {tracked > 0 && (
                      <span className="shrink-0 tabular-nums text-gray-500">
                        · {formatDuration(tracked)} {t("tracked", "zaznamenané", "rögzítve")}
                      </span>
                    )}
                  </div>
                </div>
                <RoundTimerButton
                  kind="start"
                  size="md"
                  label={t("Start timer", "Spustiť časovač", "Időzítő indítása")}
                  onClick={(ev) => void tt.start({ taskId: task.id, projectId, originType: "task", originId: task.id, billable: settings.billableByDefault }, { anchor: ev.currentTarget })}
                />
              </div>
            );
          })}
        </div>
        <p className="mt-1 rounded-md bg-gray-50 px-3 py-2 type-meta text-gray-500">
          {t(
            "Tip: click and drag on an empty slot to create an entry. Drag an entry's bottom edge to change its length.",
            "Tip: potiahnutím na prázdnom mieste vytvoríte záznam. Ťahaním za spodný okraj záznamu zmeníte jeho dĺžku.",
            "Tipp: egy üres sávon húzva új bejegyzést hozhat létre. A bejegyzés alsó szélét húzva módosíthatja a hosszát.",
          )}
        </p>
      </Surface>
    </aside>
  );
}
