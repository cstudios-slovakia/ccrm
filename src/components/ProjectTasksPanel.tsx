import React, { useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  Archive as ArchiveIcon,
  Check,
  ChevronDown,
  Clock,
  CornerDownLeft,
  ListTodo,
  Lock,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { Lead, Project, Task, UserProfile } from "../types";
import type { Language } from "../utils/translations";
import { CustomSelect } from "./ui/CustomSelect";
import { TaskEditDrawer } from "./TaskEditDrawer";
import {
  buildProjectTasks,
  isDoneTaskState,
  localDateStr,
  localStampStr,
  parseTaskLines,
  splitProjectTasks,
  toggleTaskDone,
} from "../utils/projectTasks";
import { taskPriorityLabel, taskStateLabel, type Translate } from "../utils/taskLabels";
import { requestTaskDeletion } from "../utils/taskApi";
import {
  canArchiveTask,
  canDeleteTask,
  canEditTask,
  isOnPersonalDashboard,
  resolveAssigneeName,
  type TaskAccess,
} from "../utils/taskSelectors";

const toast = (message: string) => {
  const show = (window as any).showToast;
  if (typeof show === "function") show(message);
};

// A quick-added task is due by the end of its day ("Not set" in the drawer).
// A fixed hour such as the board's 16:00 turned every task written in the
// evening red — overdue the moment it was created.
const QUICK_ADD_DEADLINE_TIME = "";

interface ProjectTasksPanelProps {
  project: Project;
  /** Not saved yet: its tasks would point at a project that may never exist. */
  isNew: boolean;
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  projects: Project[];
  leads: Lead[];
  users: UserProfile[];
  userLanguage: Language;
  taskStates: string[];
  taskStateColors?: Record<string, string>;
  taskAccess: TaskAccess;
  currentUser?: UserProfile;
  /** False when no outgoing mail server is set up; task e-mail reminders then warn. */
  mailConfigured?: boolean;
}

/**
 * A project's Tasks tab. These are ordinary tasks — the same records the Tasks
 * board shows, synced the same way — that carry this project's id. Writing a
 * line and pressing Enter creates one; a pasted list creates one per line; a
 * click opens the full task drawer.
 */
export const ProjectTasksPanel: React.FC<ProjectTasksPanelProps> = ({
  project,
  isNew,
  tasks,
  setTasks,
  projects,
  leads,
  users,
  userLanguage,
  taskStates,
  taskStateColors = {},
  taskAccess,
  currentUser,
  mailConfigured,
}) => {
  const t: Translate = (en, sk, hu) => (userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en);
  const locale = userLanguage === "sk" ? "sk-SK" : userLanguage === "hu" ? "hu-HU" : "en-US";

  const userNames = users.map((u) => u.name).filter(Boolean);
  const myName = currentUser?.name || userNames[0] || "";

  const [draft, setDraft] = useState("");
  const [deadline, setDeadline] = useState(() => localDateStr(new Date()));
  const [assignee, setAssignee] = useState(() => resolveAssigneeName(myName, myName, userNames));
  const [showFinished, setShowFinished] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  // The rows just added get a brief highlight, so a pasted list visibly landed.
  const [recentIds, setRecentIds] = useState<Set<string>>(() => new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // The same visibility rule as the Tasks board: the whole team's tasks for a
  // role that may see them, otherwise only the ones assigned to or created by you.
  const { open, finished } = useMemo(() => {
    const visible = taskAccess.viewAll ? tasks : tasks.filter((task) => isOnPersonalDashboard(task, myName));
    return splitProjectTasks(visible, project.id, taskStates);
  }, [tasks, taskAccess.viewAll, myName, project.id, taskStates]);

  const pendingTitles = parseTaskLines(draft);
  const canCreate = taskAccess.create && !isNew;
  // The picker in the drawer should offer this project even before the list has it.
  const projectsForPicker = projects.some((p) => p.id === project.id) ? projects : [project, ...projects];

  const addTasks = () => {
    if (!canCreate || pendingTitles.length === 0) return;
    const today = localDateStr(new Date());
    const created = buildProjectTasks(pendingTitles, {
      projectId: project.id,
      status: taskStates[0] || "New",
      deadline: deadline || today,
      deadlineTime: QUICK_ADD_DEADLINE_TIME,
      assignee,
      createdBy: myName,
      startDate: today,
    });
    setTasks((prev) => [...created, ...prev]);
    setDraft("");
    setRecentIds(new Set(created.map((task) => task.id)));
    if (created.length > 1) {
      toast(
        t(
          `${created.length} tasks added`,
          `Pridané úlohy: ${created.length}`,
          `${created.length} feladat hozzáadva`,
        ),
      );
    }
    inputRef.current?.focus();
  };

  const toggleDone = (task: Task) => {
    if (!canEditTask(task, currentUser, taskAccess)) return;
    setTasks((prev) => prev.map((tk) => (tk.id === task.id ? toggleTaskDone(tk, taskStates, myName) : tk)));
  };

  const deleteTask = async (task: Task): Promise<boolean> => {
    if (!canDeleteTask(task, currentUser, taskAccess)) return false;
    const confirmed = window.confirm(
      t(
        `Permanently delete "${task.title}"? This cannot be undone.`,
        `Natrvalo odstrániť úlohu "${task.title}"? Túto akciu nemožno vrátiť späť.`,
        `Véglegesen törli a(z) "${task.title}" feladatot? Ez nem vonható vissza.`,
      ),
    );
    if (!confirmed) return false;
    try {
      await requestTaskDeletion(task.id);
      setTasks((prev) => prev.filter((tk) => tk.id !== task.id));
      toast(t("Task deleted", "Úloha odstránená", "Feladat törölve"));
      return true;
    } catch (error) {
      console.error("Task deletion failed", error);
      toast(
        t(
          "Task was not deleted. Please try again.",
          "Úloha nebola odstránená. Skúste to znova.",
          "A feladat nem lett törölve. Próbálja újra.",
        ),
      );
      return false;
    }
  };

  const formatDue = (task: Task) => {
    const [y, m, d] = (task.deadline || "").split("-").map(Number);
    if (!y || !m || !d) return task.deadline;
    const date = new Date(y, m - 1, d);
    const day = date.toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
      ...(y !== new Date().getFullYear() ? { year: "numeric" } : {}),
    });
    return task.deadlineTime ? `${day} · ${task.deadlineTime}` : day;
  };

  const nowStamp = localStampStr(new Date());

  if (!taskAccess.view) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs font-semibold text-slate-400">
        {t("You do not have access to tasks.", "Nemáte prístup k úlohám.", "Nincs hozzáférése a feladatokhoz.")}
      </div>
    );
  }

  const renderRow = (task: Task) => {
    const mayEdit = canEditTask(task, currentUser, taskAccess);
    const mayDelete = canDeleteTask(task, currentUser, taskAccess);
    const done = isDoneTaskState(task.status, taskStates);
    const closed = done || Boolean(task.archived);
    const overdue = !closed && `${task.deadline} ${task.deadlineTime || "23:59"}` < nowStamp;
    const stateColor = taskStateColors[task.status];
    const hasHexColor = typeof stateColor === "string" && /^#[0-9a-f]{6}$/i.test(stateColor);

    return (
      <li
        key={task.id}
        className={`group flex items-start gap-3 px-3 py-2.5 rounded-xl border bg-white transition-all hover:border-indigo-300 hover:shadow-sm ${
          recentIds.has(task.id)
            ? "border-indigo-300 animate-in fade-in slide-in-from-top-1 duration-300"
            : "border-slate-200"
        }`}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          disabled={!mayEdit || Boolean(task.archived)}
          onClick={() => toggleDone(task)}
          title={
            !mayEdit
              ? t("Read-only access — you cannot change this task.", "Iba na čítanie — túto úlohu nemôžete meniť.", "Csak olvasható — ez a feladat nem módosítható.")
              : done
                ? t("Reopen task", "Znovu otvoriť úlohu", "Feladat újranyitása")
                : t("Mark as done", "Označiť ako hotové", "Megjelölés készként")
          }
          className={`mt-0.5 h-5 w-5 shrink-0 rounded-md border-2 flex items-center justify-center transition-all active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            done
              ? "bg-emerald-500 border-emerald-500 text-white"
              : "bg-white border-slate-300 hover:border-emerald-500 cursor-pointer"
          }`}
        >
          {done && <Check className="h-3.5 w-3.5 stroke-[3]" />}
        </button>

        <button
          type="button"
          onClick={() => setEditingTask(task)}
          className="flex-1 min-w-0 text-left cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span
            className={`block text-sm font-bold truncate transition-colors ${
              closed ? "text-slate-400 line-through" : "text-slate-800 group-hover:text-indigo-700"
            }`}
          >
            {task.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
            <span
              className={`inline-flex items-center gap-1 ${
                task.priority === "high" ? "text-rose-600" : task.priority === "low" ? "text-slate-400" : "text-amber-600"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  task.priority === "high" ? "bg-rose-500" : task.priority === "low" ? "bg-slate-400" : "bg-amber-500"
                }`}
              />
              {taskPriorityLabel(task.priority, t)}
            </span>
            <span
              className="px-1.5 py-0.5 rounded-md border bg-slate-50 text-slate-600 border-slate-200"
              style={hasHexColor ? { backgroundColor: `${stateColor}1A`, color: stateColor, borderColor: `${stateColor}40` } : undefined}
            >
              {taskStateLabel(task.status, t)}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md tabular-nums ${
                overdue ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-600"
              }`}
            >
              <Clock className="h-2.5 w-2.5" />
              {formatDue(task)}
            </span>
            {task.assignedUsers?.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 truncate max-w-[140px]">
                {task.assignedUsers.join(", ")}
              </span>
            )}
            {task.description && (
              <AlignLeft
                className="h-3 w-3 text-slate-400"
                aria-label={t("Has a description", "Má popis", "Van leírása")}
              />
            )}
            {task.isLocking && <Lock className="h-3 w-3 text-violet-500" />}
            {task.archived && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">
                <ArchiveIcon className="h-2.5 w-2.5" />
                {t("Archived", "Archivované", "Archivált")}
              </span>
            )}
          </span>
        </button>

        <div className="flex items-center gap-0.5 shrink-0 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button
            type="button"
            onClick={() => setEditingTask(task)}
            title={mayEdit ? t("Edit Task", "Upraviť úlohu", "Feladat szerkesztése") : t("View Task", "Zobraziť úlohu", "Feladat megtekintése")}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 active:scale-95 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {mayDelete && (
            <button
              type="button"
              onClick={() => void deleteTask(task)}
              title={t("Delete Task", "Odstrániť úlohu", "Feladat törlése")}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-95 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 pr-1">
      {taskAccess.create && (
        <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 p-3 transition-all focus-within:border-indigo-300 focus-within:bg-white focus-within:shadow-sm">
          {isNew ? (
            <p className="px-1 py-2 text-xs font-semibold text-slate-500">
              {t(
                "Save the project first, then add its tasks here.",
                "Najprv projekt uložte, potom sem pridajte jeho úlohy.",
                "Először mentse a projektet, utána adja hozzá a feladatait.",
              )}
            </p>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <Plus className="h-4 w-4 mt-2.5 shrink-0 text-indigo-500" />
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter adds; Shift+Enter starts another line. An IME
                    // composition uses Enter to confirm, so it is left alone.
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      addTasks();
                    }
                  }}
                  rows={Math.min(Math.max(draft.split("\n").length, 1), 8)}
                  aria-label={t("New tasks, one per line", "Nové úlohy, jedna na riadok", "Új feladatok, soronként egy")}
                  placeholder={t(
                    "Write a task and press Enter",
                    "Napíšte úlohu a stlačte Enter",
                    "Írjon egy feladatot és nyomjon Entert",
                  )}
                  className="flex-1 min-w-0 resize-none bg-transparent py-2 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addTasks}
                  disabled={pendingTitles.length === 0}
                  className="mt-1 shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider shadow-sm shadow-indigo-600/20 transition-all hover:bg-indigo-700 active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  <CornerDownLeft className="h-3.5 w-3.5" />
                  {pendingTitles.length > 1
                    ? t(`Add ${pendingTitles.length}`, `Pridať ${pendingTitles.length}`, `${pendingTitles.length} hozzáadása`)
                    : t("Add", "Pridať", "Hozzáadás")}
                </button>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-200/70 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-bold text-slate-500">
                <label className="flex items-center gap-1.5">
                  <span className="uppercase tracking-wider">{t("Due", "Termín", "Határidő")}</span>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 font-bold focus:border-indigo-400 focus:outline-none"
                  />
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="uppercase tracking-wider">{t("Assignee", "Zodpovedný", "Felelős")}</span>
                  <div className="w-44">
                    <CustomSelect
                      size="sm"
                      value={assignee}
                      onChange={setAssignee}
                      options={[
                        { value: "", label: t("-- Unassigned --", "-- Nepriradený --", "-- Kijelöletlen --") },
                        ...userNames.map((name) => ({ value: name, label: name })),
                      ]}
                    />
                  </div>
                </div>
                <span className="ml-auto hidden md:inline text-slate-400 font-semibold">
                  {t(
                    "One task per line · Shift+Enter new line",
                    "Každý riadok je úloha · Shift+Enter nový riadok",
                    "Soronként egy feladat · Shift+Enter új sor",
                  )}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
          <ListTodo className="h-3.5 w-3.5" />
          {t("Open tasks", "Otvorené úlohy", "Nyitott feladatok")}
          <span className="px-1.5 rounded-full bg-slate-100 text-slate-600">{open.length}</span>
        </span>
        {open.length > 0 ? (
          <ul className="flex flex-col gap-2">{open.map(renderRow)}</ul>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-8 text-center text-xs font-semibold text-slate-400">
            {finished.length > 0
              ? t("Everything is done here.", "Všetko je hotové.", "Minden kész.")
              : canCreate
                ? t("No tasks yet — write the first one above.", "Zatiaľ žiadne úlohy — napíšte prvú vyššie.", "Még nincs feladat — írja be az elsőt fent.")
                : t("This project has no tasks.", "Tento projekt nemá žiadne úlohy.", "Ennek a projektnek nincs feladata.")}
          </div>
        )}
      </div>

      {finished.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowFinished((v) => !v)}
            aria-expanded={showFinished}
            className="self-start flex items-center gap-1.5 px-2 py-1 -mx-2 rounded-lg text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showFinished ? "" : "-rotate-90"}`} />
            {t("Completed", "Dokončené", "Befejezett")}
            <span className="px-1.5 rounded-full bg-slate-100 text-slate-600">{finished.length}</span>
          </button>
          {showFinished && (
            <ul className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              {finished.map(renderRow)}
            </ul>
          )}
        </div>
      )}

      {editingTask && (
        <TaskEditDrawer
          key={editingTask.id}
          task={editingTask}
          leads={leads}
          projects={projectsForPicker}
          users={users}
          taskStates={taskStates}
          systemLanguage={userLanguage}
          currentUserName={myName}
          mailConfigured={mailConfigured}
          canEdit={canEditTask(editingTask, currentUser, taskAccess)}
          canArchive={taskAccess.edit && canArchiveTask(editingTask, currentUser)}
          canDelete={canDeleteTask(editingTask, currentUser, taskAccess)}
          onSave={(next) => setTasks((prev) => prev.map((tk) => (tk.id === next.id ? next : tk)))}
          onToggleArchive={(next) =>
            setTasks((prev) => prev.map((tk) => (tk.id === next.id ? { ...tk, archived: !next.archived } : tk)))
          }
          onDelete={deleteTask}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
};
