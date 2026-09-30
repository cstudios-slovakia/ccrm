import React, { useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  Archive as ArchiveIcon,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  CornerDownLeft,
  Filter,
  ListTodo,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type { Lead, Project, Task, UserProfile } from "../types";
import type { Language } from "../utils/translations";
import { CustomSelect } from "./ui/CustomSelect";
import { TaskEditDrawer } from "./TaskEditDrawer";
import { TaskPillText } from "./TaskPillText";
import { VoiceTaskActionBar } from "./VoiceTaskActionBar";
import {
  buildProjectTasks,
  computeTaskDateRange,
  getTaskCreationDate,
  isDoneTaskState,
  localDateStr,
  localStampStr,
  parseTaskLines,
  splitFilteredTasks,
  toggleTaskDone,
  type TaskDateBasis,
  type TaskDateFilter,
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

const QUICK_ADD_DEADLINE_TIME = "";

export interface EntityTasksPanelProps {
  entityType: "project" | "lead" | "client";
  entityId: string;
  entityName?: string;
  /** Not saved yet: its tasks would point at an entity that may never exist. */
  isNew?: boolean;
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
  relatedLeadId?: string;
  relatedProjectId?: string;
  clientAssociatedLeadIds?: string[];
  accentColor?: "indigo" | "orange" | "blue" | "violet";
}

/**
 * Unified Tasks panel for Projects, Leads, and Clients.
 * Supports quick multi-line task creation, voice action bar, TaskEditDrawer,
 * and a date interval filter (All, Last week, Last month, Last quarter, Last year to date, Custom).
 * In all filter modes, completed tasks are displayed with strikethrough.
 */
export const EntityTasksPanel: React.FC<EntityTasksPanelProps> = ({
  entityType,
  entityId,
  entityName = "",
  isNew = false,
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
  relatedLeadId,
  relatedProjectId,
  clientAssociatedLeadIds,
  accentColor = entityType === "project"
    ? "indigo"
    : entityType === "client"
      ? "orange"
      : "blue",
}) => {
  const t: Translate = (en, sk, hu) => (userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en);
  const locale = userLanguage === "sk" ? "sk-SK" : userLanguage === "hu" ? "hu-HU" : "en-US";

  const userNames = users.map((u) => u.name).filter(Boolean);
  const myName = currentUser?.name || userNames[0] || "";

  const [draft, setDraft] = useState("");
  const [deadline, setDeadline] = useState(() => localDateStr(new Date()));
  const [assignee, setAssignee] = useState(() => resolveAssigneeName(myName, myName, userNames));
  const [showFinished, setShowFinished] = useState(true);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [recentIds, setRecentIds] = useState<Set<string>>(() => new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Date interval filter state
  const [dateFilter, setDateFilter] = useState<TaskDateFilter>("all");
  const [dateBasis, setDateBasis] = useState<TaskDateBasis>("due");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Filter tasks belonging to this entity
  const entityTasks = useMemo(() => {
    if (!entityId) return [];
    if (entityType === "project") {
      return tasks.filter((t) => t.relatedProjectId === entityId);
    }
    if (entityType === "lead") {
      return tasks.filter((t) => t.relatedLeadId === entityId);
    }
    if (entityType === "client") {
      const leadIds = clientAssociatedLeadIds || [];
      return tasks.filter(
        (t) =>
          t.relatedLeadId &&
          (leadIds.includes(t.relatedLeadId) ||
            t.relatedLeadId === entityId ||
            (relatedLeadId && t.relatedLeadId === relatedLeadId) ||
            (entityName && t.relatedLeadId === entityName))
      );
    }
    return [];
  }, [tasks, entityType, entityId, relatedLeadId, entityName, clientAssociatedLeadIds]);

  // Visibility based on task access permissions
  const visibleTasks = useMemo(() => {
    return taskAccess.viewAll ? entityTasks : entityTasks.filter((task) => isOnPersonalDashboard(task, myName));
  }, [entityTasks, taskAccess.viewAll, myName]);

  // Apply date interval filter and split into open and finished
  const { open, finished, allFiltered } = useMemo(() => {
    return splitFilteredTasks(
      visibleTasks,
      taskStates,
      dateFilter,
      customStart,
      customEnd,
      new Date(),
      dateBasis,
    );
  }, [visibleTasks, taskStates, dateFilter, customStart, customEnd, dateBasis]);

  const activeRange = useMemo(() => {
    if (dateFilter === "all") return null;
    if (dateFilter === "custom") {
      if (!customStart && !customEnd) return null;
      return { start: customStart || null, end: customEnd || null };
    }
    return computeTaskDateRange(dateFilter, new Date());
  }, [dateFilter, customStart, customEnd]);

  const formatDateRangeLabel = (range: { start: string | null; end: string | null } | null) => {
    if (!range) return null;
    const formatPart = (iso: string | null) => {
      if (!iso) return "…";
      const [y, m, d] = iso.split("-").map(Number);
      if (!y || !m || !d) return iso;
      const date = new Date(y, m - 1, d);
      return date.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
    };
    return `${formatPart(range.start)} – ${formatPart(range.end)}`;
  };

  const pendingTitles = parseTaskLines(draft);
  const canCreate = taskAccess.create && !isNew;

  // Picker project list
  const projectsForPicker = useMemo(() => {
    if (entityType === "project") {
      const current = projects.find((p) => p.id === entityId);
      if (current) return projects;
      return [
        {
          id: entityId,
          name: entityName || "Current Project",
          projectTypeId: "default",
          status: "in_progress",
        } as unknown as Project,
        ...projects,
      ];
    }
    return projects;
  }, [projects, entityType, entityId, entityName]);

  const addTasks = () => {
    if (!canCreate || pendingTitles.length === 0) return;
    const today = localDateStr(new Date());
    const created = buildProjectTasks(pendingTitles, {
      projectId: entityType === "project" ? entityId : (relatedProjectId || ""),
      status: taskStates[0] || "New",
      deadline: deadline || today,
      deadlineTime: QUICK_ADD_DEADLINE_TIME,
      assignee,
      createdBy: myName,
      startDate: today,
    }).map((task) => ({
      ...task,
      relatedLeadId:
        entityType === "lead"
          ? entityId
          : entityType === "client"
            ? (relatedLeadId || entityId)
            : (relatedLeadId || undefined),
      relatedProjectId: entityType === "project" ? entityId : (relatedProjectId || undefined),
    }));

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

  const formatCreated = (task: Task) => {
    const raw = getTaskCreationDate(task);
    const [y, m, d] = (raw || "").split("-").map(Number);
    if (!y || !m || !d) return raw || "—";
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
      ...(y !== new Date().getFullYear() ? { year: "numeric" } : {}),
    });
  };

  const nowStamp = localStampStr(new Date());

  if (!taskAccess.view) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs font-semibold text-slate-400 py-12">
        {t("You do not have access to tasks.", "Nemáte prístup k úlohám.", "Nincs hozzáférése a feladatokhoz.")}
      </div>
    );
  }

  // Accent styling tokens
  const accentClasses = {
    indigo: {
      btn: "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20 text-white",
      badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
      activeTab: "bg-indigo-600 text-white shadow-sm border-indigo-700",
      text: "text-indigo-600",
      focusBorder: "focus-within:border-indigo-300",
      focusInput: "focus:border-indigo-400",
    },
    orange: {
      btn: "bg-orange-600 hover:bg-orange-700 shadow-orange-600/20 text-white",
      badge: "bg-orange-50 text-orange-700 border-orange-200",
      activeTab: "bg-orange-600 text-white shadow-sm border-orange-700",
      text: "text-orange-600",
      focusBorder: "focus-within:border-orange-300",
      focusInput: "focus:border-orange-400",
    },
    blue: {
      btn: "bg-blue-600 hover:bg-blue-700 shadow-blue-600/20 text-white",
      badge: "bg-blue-50 text-blue-700 border-blue-200",
      activeTab: "bg-blue-600 text-white shadow-sm border-blue-700",
      text: "text-blue-600",
      focusBorder: "focus-within:border-blue-300",
      focusInput: "focus:border-blue-400",
    },
    violet: {
      btn: "bg-violet-600 hover:bg-violet-700 shadow-violet-600/20 text-white",
      badge: "bg-violet-50 text-violet-700 border-violet-200",
      activeTab: "bg-violet-600 text-white shadow-sm border-violet-700",
      text: "text-violet-600",
      focusBorder: "focus-within:border-violet-300",
      focusInput: "focus:border-violet-400",
    },
  }[accentColor];

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
        className={`group flex items-start gap-3 px-3.5 py-3 rounded-2xl border transition-all ${
          closed
            ? "bg-slate-50/80 border-slate-200/80 opacity-80 hover:opacity-100"
            : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
        } ${recentIds.has(task.id) ? "border-indigo-400 animate-in fade-in slide-in-from-top-1 duration-300" : ""}`}
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
          className={`mt-0.5 h-5 w-5 shrink-0 rounded-lg border-2 flex items-center justify-center transition-all active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            done
              ? "bg-emerald-500 border-emerald-500 text-white shadow-sm"
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
            className={`block text-xs font-bold truncate transition-colors ${
              closed ? "text-slate-400 line-through" : "text-slate-800 group-hover:text-indigo-600"
            }`}
          >
            <TaskPillText text={task.title} />
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
            {dateBasis === "created" ? (
              <>
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md tabular-nums bg-sky-50 text-sky-700 font-semibold border border-sky-200/60"
                  title={t("Creation date", "Dátum vytvorenia", "Létrehozás dátuma")}
                >
                  <Calendar className="h-2.5 w-2.5 text-sky-500" />
                  <span>{t("Created", "Vytvorené", "Létrehozva")}: {formatCreated(task)}</span>
                </span>
                {task.deadline && (
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md tabular-nums ${
                      overdue ? "bg-rose-50 text-rose-600 font-extrabold" : "bg-slate-100 text-slate-600"
                    }`}
                    title={t("Due date", "Termín", "Határidő")}
                  >
                    <Clock className="h-2.5 w-2.5" />
                    {formatDue(task)}
                  </span>
                )}
              </>
            ) : (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md tabular-nums ${
                  overdue ? "bg-rose-50 text-rose-600 font-extrabold" : "bg-slate-100 text-slate-600"
                }`}
                title={t("Due date", "Termín", "Határidő")}
              >
                <Clock className="h-2.5 w-2.5" />
                {formatDue(task)}
              </span>
            )}
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

  const filterButtons: { id: TaskDateFilter; label: string }[] = [
    { id: "all", label: t("All", "Všetky", "Mind") },
    { id: "last_week", label: t("Last week", "Minulý týždeň", "Múlt hét") },
    { id: "last_month", label: t("Last month", "Minulý mesiac", "Múlt hónap") },
    { id: "last_quarter", label: t("Last quarter", "Minulý štvrťrok", "Múlt negyedév") },
    { id: "last_year_to_date", label: t("Last year to date", "Minulý rok k dnešku", "Előző év (eddig)") },
    { id: "custom", label: t("Custom interval", "Vlastný interval", "Egyéni időszak") },
  ];

  return (
    <div className="flex-1 min-h-0 lg:overflow-y-auto flex flex-col gap-4 pr-0 lg:pr-1">
      {/* Quick Add Card */}
      {taskAccess.create && (
        <div className={`shrink-0 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 transition-all ${accentClasses.focusBorder} focus-within:bg-white focus-within:shadow-sm`}>
          {isNew ? (
            <p className="px-1 py-2 text-xs font-semibold text-slate-500">
              {t(
                "Save this entity first, then add its tasks here.",
                "Najprv túto položku uložte, potom sem pridajte jej úlohy.",
                "Először mentse el az entitást, utána adja hozzá a feladatait.",
              )}
            </p>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <Plus className={`h-4 w-4 mt-2.5 shrink-0 ${accentClasses.text}`} />
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      addTasks();
                    }
                  }}
                  rows={Math.min(Math.max(draft.split("\n").length, 1), 6)}
                  aria-label={t("New tasks, one per line", "Nové úlohy, jedna na riadok", "Új feladatok, soronként egy")}
                  placeholder={t(
                    "Write a task and press Enter",
                    "Napíšte úlohu a stlačte Enter",
                    "Írjon egy feladatot és nyomjon Entert",
                  )}
                  className="flex-1 min-w-0 resize-none bg-transparent py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />
              </div>

              <div className="mt-2 pt-2 border-t border-slate-200/70 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-bold text-slate-500">
                <label className="flex items-center gap-1.5">
                  <span className="uppercase tracking-wider">{t("Due", "Termín", "Határidő")}</span>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className={`px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 font-bold ${accentClasses.focusInput} focus:outline-none`}
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

              <div className="mt-2.5 pt-2.5 border-t border-slate-200/70">
                <VoiceTaskActionBar
                  canCreate={canCreate}
                  systemLanguage={userLanguage}
                  currentUser={currentUser}
                  users={users}
                  defaultAssignee={assignee}
                  defaultStatus={taskStates[0] || "New"}
                  relatedProjectId={entityType === "project" ? entityId : (relatedProjectId || undefined)}
                  relatedLeadId={
                    entityType === "lead"
                      ? entityId
                      : entityType === "client"
                        ? (relatedLeadId || entityId)
                        : (relatedLeadId || undefined)
                  }
                  manualButtonText={
                    pendingTitles.length > 1
                      ? t(`Add ${pendingTitles.length} Tasks`, `Pridať ${pendingTitles.length} úloh`, `${pendingTitles.length} feladat hozzáadása`)
                      : t("Add Task", "Pridať úlohu", "Feladat hozzáadása")
                  }
                  manualButtonIcon={<CornerDownLeft className="h-3.5 w-3.5" />}
                  manualButtonClassName={`py-2 px-3 rounded-xl ${accentClasses.btn} text-[10px] font-black uppercase tracking-wider shadow-sm transition-all duration-300 ease-in-out hover:scale-[1.01] cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed`}
                  voiceButtonClassName="w-[20%] py-2 px-3 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white rounded-xl font-black text-[10px] uppercase tracking-wider shadow-sm hover:scale-[1.01] transition-all duration-300 ease-in-out cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  onManualCreateClick={addTasks}
                  onTasksCreated={(createdTasks) => {
                    const mapped = createdTasks.map((t) => ({
                      ...t,
                      relatedLeadId:
                        entityType === "lead"
                          ? entityId
                          : entityType === "client"
                            ? (relatedLeadId || entityId)
                            : (relatedLeadId || undefined),
                      relatedProjectId: entityType === "project" ? entityId : (relatedProjectId || undefined),
                    }));
                    setTasks((prev) => [...mapped, ...prev]);
                    setRecentIds(new Set(mapped.map((tk) => tk.id)));
                  }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* FILTER BAR: All, Last week, Last month, Last quarter, Last year to date, Custom interval */}
      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-2.5 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
              <Filter className="h-3 w-3" />
              <span>{t("Filter tasks", "Filtrovať úlohy", "Feladatok szűrése")}</span>
            </div>

            {/* LIGHTSWITCH: Due date vs Creation date */}
            <div
              role="radiogroup"
              aria-label={t("Filter by date type", "Filtrovať podľa typu dátumu", "Szűrés dátumtípus szerint")}
              className="inline-flex items-center p-0.5 rounded-xl bg-slate-200/80 border border-slate-300/70 shadow-inner"
            >
              <button
                type="button"
                role="radio"
                aria-checked={dateBasis === "due"}
                onClick={() => setDateBasis("due")}
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                  dateBasis === "due"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Clock className="w-2.5 h-2.5" />
                <span>{t("Due date", "Termín", "Határidő")}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={dateBasis === "created"}
                onClick={() => setDateBasis("created")}
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                  dateBasis === "created"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Calendar className="w-2.5 h-2.5" />
                <span>{t("Creation date", "Dátum vytvorenia", "Létrehozás")}</span>
              </button>
            </div>

            {activeRange && (
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 text-[9px] font-bold">
                {formatDateRangeLabel(activeRange)}
              </span>
            )}
          </div>
          {dateFilter !== "all" && (
            <button
              type="button"
              onClick={() => {
                setDateFilter("all");
                setCustomStart("");
                setCustomEnd("");
              }}
              className="text-[9px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              {t("Reset filter", "Zrušiť filter", "Szűrő visszaállítása")}
            </button>
          )}
        </div>

        {/* Filter Presets Pill Switcher */}
        <div className="flex flex-wrap items-center gap-1.5">
          {filterButtons.map((btn) => {
            const isSelected = dateFilter === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => setDateFilter(btn.id)}
                className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-150 cursor-pointer border ${
                  isSelected
                    ? `${accentClasses.activeTab} shadow-xs`
                    : "bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100/90 border-slate-200"
                }`}
              >
                {btn.label}
              </button>
            );
          })}
        </div>

        {/* Custom interval date inputs */}
        {dateFilter === "custom" && (
          <div className="mt-1 pt-2 border-t border-slate-200/60 flex flex-wrap items-center gap-3 text-[10px] font-bold animate-in fade-in duration-200">
            <label className="flex items-center gap-1.5">
              <span className="text-slate-500 uppercase">{t("From", "Od", "Tól")}:</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className={`px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 ${accentClasses.focusInput} focus:outline-none`}
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-slate-500 uppercase">{t("To", "Do", "Ig")}:</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className={`px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 ${accentClasses.focusInput} focus:outline-none`}
              />
            </label>
            {(customStart || customEnd) && (
              <span className="text-[9px] text-slate-400 font-semibold">
                {t("Showing tasks matching interval", "Zobrazujú sa úlohy zodpovedajúce intervalu", "Az időszaknak megfelelő feladatok megjelenítése")}
              </span>
            )}
          </div>
        )}
      </div>

      {/* OPEN TASKS SECTION */}
      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
          <ListTodo className="h-3.5 w-3.5" />
          {t("Open tasks", "Otvorené úlohy", "Nyitott feladatok")}
          <span className="px-1.5 rounded-full bg-slate-100 text-slate-600 font-extrabold">{open.length}</span>
        </span>
        {open.length > 0 ? (
          <ul className="flex flex-col gap-2">{open.map(renderRow)}</ul>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-6 text-center text-xs font-semibold text-slate-400">
            {allFiltered.length === 0 && dateFilter !== "all"
              ? dateBasis === "created"
                ? t(
                    "No tasks match this creation date filter.",
                    "Tomuto filtru dátumu vytvorenia nezodpovedajú žiadne úlohy.",
                    "Nincsenek feladatok a kiválasztott létrehozási időszakban.",
                  )
                : t(
                    "No tasks match this date filter.",
                    "Tomuto filtru termínov nezodpovedajú žiadne úlohy.",
                    "Nincsenek feladatok a kiválasztott időszakban.",
                  )
              : finished.length > 0
                ? t("All tasks in this view are completed.", "Všetky úlohy v tomto zobrazení sú hotové.", "Minden feladat befejeződött ebben a nézetben.")
                : canCreate
                  ? t("No tasks yet — write the first one above.", "Zatiaľ žiadne úlohy — napíšte prvú vyššie.", "Még nincs feladat — írja be az elsőt fent.")
                  : t("No tasks available.", "Žiadne úlohy k dispozícii.", "Nincsenek elérhető feladatok.")}
          </div>
        )}
      </div>

      {/* COMPLETED TASKS SECTION: Strikethrough & clearly visible */}
      {finished.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setShowFinished((v) => !v)}
            aria-expanded={showFinished}
            className="self-start flex items-center gap-1.5 px-2 py-1 -mx-2 rounded-lg text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showFinished ? "" : "-rotate-90"}`} />
            {t("Completed", "Dokončené", "Befejezett")}
            <span className="px-1.5 rounded-full bg-slate-100 text-slate-600 font-extrabold">{finished.length}</span>
          </button>
          {showFinished && (
            <ul className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              {finished.map(renderRow)}
            </ul>
          )}
        </div>
      )}

      {/* Task Edit Drawer */}
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
