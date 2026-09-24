import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
    CheckSquare,
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Eye,
    Lock,
    Briefcase,
    Plus,
    X,
    AlertCircle,
    ChevronDown,
    ChevronUp,
    Settings,
    RotateCcw,
    Archive as ArchiveIcon,
    Clock,
    FolderKanban,
    Trash2,
    Users,
    ArrowUpRight,
    Flame,
    Minus,
    CheckCircle2,
    PlusCircle,
    History,
    Search,
    ArrowUpDown,
} from "lucide-react";
import type { Task, UserProfile, Lead, Project } from "../types";
import type { Language } from "../utils/translations";
import { CalendarPane } from "./Dashboard";
import { CustomSelect } from "./ui/CustomSelect";
import { ClientSelect } from "./ui/ClientSelect";
import { DeadlineTimePicker, TaskEditDrawer, taskProjectOptions } from "./TaskEditDrawer";
import { TaskEmailReminderField } from "./TaskEmailReminderField";
import { projectDisplayName } from "../utils/projects";
import { taskPriorityLabel, taskStateLabel } from "../utils/taskLabels";
import { requestTaskDeletion } from "../utils/taskApi";
import { isTaskOverdue as isTaskOverdueShared } from "../utils/projectTasks";
import { nowLocalStamp } from "../utils/localTime";
import {
    canArchiveTask as userCanArchiveTask,
    canDeleteTask as userCanDeleteTask,
    canEditTask as userCanEditTask,
    isActiveTask,
    isOnPersonalDashboard,
    isTaskAssignedTo,
    isTaskCreatedBy,
    type TaskAccess,
} from "../utils/taskSelectors";

// Format a Date as a LOCAL calendar date (YYYY-MM-DD). Task deadlines are stored
// as plain local date strings, so we must NOT go through toISOString() (which
// converts to UTC and, in timezones ahead of UTC, shifts the day back by one —
// making tasks appear on the wrong calendar cell and breaking day-click matching).
const toLocalDateStr = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};

// Cookie helper for calendar scope / display mode
const getCalendarScopeCookie = (): "month" | "week" | "timeline" | "hide" => {
    if (typeof document === "undefined") return "month";
    const match = document.cookie.match(/(?:^|;\s*)ccrm_task_calendar_scope=([^;]+)/);
    const val = match ? decodeURIComponent(match[1]) : "";
    if (val === "month" || val === "week" || val === "timeline" || val === "hide") {
        return val;
    }
    return "month";
};

const setCalendarScopeCookie = (scope: "month" | "week" | "timeline" | "hide") => {
    if (typeof document === "undefined") return;
    document.cookie = `ccrm_task_calendar_scope=${encodeURIComponent(scope)}; path=/; max-age=31536000; SameSite=Lax`;
};

// Reusable calendar date-range filter (item 9) — reuses the overview CalendarPane range picker
// inside a compact popover with month navigation. Used by the Global Tasks and Archive views.
const DateRangeCalendarFilter: React.FC<{
    start: Date | null;
    end: Date | null;
    onChange: (start: Date | null, end: Date | null) => void;
    systemLanguage: Language;
    t: (en: string, sk: string, hu: string) => string;
}> = ({ start, end, onChange, systemLanguage, t }) => {
    const [open, setOpen] = useState(false);
    const [viewDate, setViewDate] = useState<Date>(() => start || new Date());
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const fmt = (d: Date | null) => (d ? toLocalDateStr(d) : "");
    const locale = systemLanguage === "sk" ? "sk-SK" : systemLanguage === "hu" ? "hu-HU" : "en-US";

    const handleSelect = (date: Date) => {
        if (!start || (start && end)) {
            onChange(date, null);
        } else if (date < start) {
            onChange(date, null);
        } else {
            onChange(start, date);
        }
    };

    const labelText = start
        ? end && fmt(end) !== fmt(start)
            ? `${fmt(start)} → ${fmt(end)}`
            : fmt(start)
        : t("Filter by date", "Filtrovať podľa dátumu", "Szűrés dátum szerint");

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 text-xs font-extrabold cursor-pointer transition-all ${
                    start
                        ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-400"
                }`}
            >
                <CalendarIcon className="h-3.5 w-3.5 text-indigo-600" />
                <span>{labelText}</span>
                {start && (
                    <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                            e.stopPropagation();
                            onChange(null, null);
                        }}
                        className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-rose-500 flex items-center"
                    >
                        <X className="h-3 w-3" />
                    </span>
                )}
            </button>
            {open && (
                <div className="absolute right-0 z-[999] mt-2 w-[300px] bg-white border border-slate-200 rounded-2xl shadow-xl p-3 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between mb-2">
                        <button
                            type="button"
                            onClick={() => setViewDate(new Date(year, month - 1, 1))}
                            className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 cursor-pointer"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">
                            {viewDate.toLocaleDateString(locale, { month: "long", year: "numeric" })}
                        </span>
                        <button
                            type="button"
                            onClick={() => setViewDate(new Date(year, month + 1, 1))}
                            className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 cursor-pointer"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                    <CalendarPane
                        title=""
                        year={year}
                        month={month}
                        selectedStart={start}
                        selectedEnd={end}
                        onSelect={handleSelect}
                        systemLanguage={systemLanguage}
                    />
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="mt-2 w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer transition-colors"
                    >
                        {t("Done", "Hotovo", "Kész")}
                    </button>
                </div>
            )}
        </div>
    );
};


// Calendar geometry, shared by every tab that draws a calendar (My Calendar,
// Global Tasks, Archive). Kept as plain functions of an anchor date so each tab
// can page its own calendar independently instead of all three sharing one.
const getMonthDays = (year: number, month: number): Date[] => {
    const date = new Date(year, month, 1);
    const days: Date[] = [];
    while (date.getMonth() === month) {
        days.push(new Date(date));
        date.setDate(date.getDate() + 1);
    }
    return days;
};

// How many empty cells precede the 1st, with the week starting on Monday.
const getMonthPadding = (year: number, month: number): number =>
    (new Date(year, month, 1).getDay() + 6) % 7;

// The seven days of the week the anchor falls into, Monday-first to match the
// weekday header used by the month grid.
const getWeekDays = (anchor: Date): Date[] => {
    const monday = new Date(
        anchor.getFullYear(),
        anchor.getMonth(),
        anchor.getDate(),
    );
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d;
    });
};

// Everything one calendar panel needs: where it is pointed, what it shows on a
// given day, and how a task looks inside the day view. My Calendar, Global Tasks
// and the Archive each pass their own, so the three calendars page and select
// days independently while sharing one implementation.
type CalendarPanelConfig = {
    anchor: Date;
    scope: "month" | "week" | "timeline" | "hide";
    selectedDay: Date | null;
    onSelectDay: (day: Date | null) => void;
    tasksForDate: (dateStr: string) => Task[];
    renderDayItem: (task: Task) => React.ReactNode;
    emptyDayLabel: string;
    // Omitted where creating a task from a day makes no sense (the Archive).
    onAddTask?: (dateStr: string) => void;
};

// Colour scheme of one time bucket in the left-hand task panel. My Calendar and
// Global Tasks render the same bucket sections through renderTaskBucket.
const BUCKET_TONES = {
    rose: {
        shell: "bg-rose-50/50 border border-rose-100",
        headerBg: "bg-rose-50/60 hover:bg-rose-50/90",
        title: "text-rose-600",
        chevron: "text-rose-500 group-hover/btn:text-rose-700",
        emptyBorder: "border-rose-200/50",
        emptyText: "text-rose-500",
        border: "border-rose-100",
    },
    indigo: {
        shell: "bg-indigo-50/30 border border-indigo-100",
        headerBg: "bg-indigo-50/40 hover:bg-indigo-50/70",
        title: "text-indigo-600",
        chevron: "text-indigo-500 group-hover/btn:text-indigo-700",
        emptyBorder: "border-indigo-200/50",
        emptyText: "text-indigo-400",
        border: "border-indigo-100",
    },
    amber: {
        shell: "bg-amber-50/30 border border-amber-100",
        headerBg: "bg-amber-50/40 hover:bg-amber-50/70",
        title: "text-amber-600",
        chevron: "text-amber-500 group-hover/btn:text-amber-700",
        emptyBorder: "border-amber-200/50",
        emptyText: "text-amber-500",
        border: "border-amber-100",
    },
    slate: {
        shell: "bg-slate-50/50 border border-slate-200",
        headerBg: "bg-slate-50 hover:bg-slate-100/70",
        title: "text-slate-600",
        chevron: "text-slate-500 group-hover/btn:text-slate-700",
        emptyBorder: "border-slate-200",
        emptyText: "text-slate-400",
        border: "border-slate-200",
    },
    emerald: {
        shell: "bg-emerald-50/40 border border-emerald-200/80",
        headerBg: "bg-emerald-50/50 hover:bg-emerald-50/80",
        title: "text-emerald-700",
        chevron: "text-emerald-500 group-hover/btn:text-emerald-700",
        emptyBorder: "border-emerald-200/50",
        emptyText: "text-emerald-600",
        border: "border-emerald-100",
    },
    sky: {
        shell: "bg-sky-50/40 border border-sky-100",
        headerBg: "bg-sky-50/50 hover:bg-sky-50/80",
        title: "text-sky-700",
        chevron: "text-sky-500 group-hover/btn:text-sky-700",
        emptyBorder: "border-sky-200/50",
        emptyText: "text-sky-500",
        border: "border-sky-100",
    },
} as const;

interface TaskDashboardViewProps {
    tasks: Task[];
    setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
    leads: Lead[];
    /** For the task drawers' "Project" field and the project badge on a card. */
    projects?: Project[];
    users?: UserProfile[]; // made optional to avoid TS errors if not passed
    systemLanguage: Language;
    currentUser?: UserProfile;
    taskStates?: string[];
    taskStateColors?: Record<string, string>;
    autoOpenAddTask?: boolean;
    setAutoOpenAddTask?: (val: boolean) => void;
    taskAccess?: TaskAccess;
    /** False when no outgoing mail server is set up; task e-mail reminders then warn. */
    mailConfigured?: boolean;
}

export const TaskDashboardView: React.FC<TaskDashboardViewProps> = ({
    tasks,
    setTasks,
    leads,
    projects = [],
    users = [],
    systemLanguage,
    currentUser,
    taskStates = ["New", "In progress", "Blocked", "Done"],
    taskStateColors = {
        New: "#3b82f6",
        "In progress": "#f59e0b",
        Blocked: "#ef4444",
        Done: "#10b981",
    },
    autoOpenAddTask,
    setAutoOpenAddTask,
    taskAccess = { view: true, create: true, edit: true, delete: true, viewAll: true },
    mailConfigured,

}) => {
    const isDoneState = (status: string) => {
        return (
            status.toLowerCase() === "done" ||
            (taskStates.length > 0 &&
                status === taskStates[taskStates.length - 1])
        );
    };

    // Fallback owner/assignee name when none is selected — the logged-in user,
    // else the first registered user. Never a hardcoded demo account.
    const defaultUserName = currentUser?.name || users[0]?.name || "";

    // Item 11 — the personal dashboard (time buckets, calendar) only surfaces tasks
    // that belong to the logged-in user, so users never see each other's open tasks on
    // My Calendar. Global Tasks is the shared board: it is team-wide for everyone by
    // default (canSeeAllTasks), and a role can have that taken away with the
    // `tasks.view_all` permission in Settings → Roles & RBAC. Before 1.6.48 the board
    // was admin-only, which left every other user looking at a single column of their
    // own tasks. The Archive tab is team-wide for everyone — completed work is shared
    // history.
    const myName = currentUser?.name || defaultUserName;
    const canSeeAllTasks = taskAccess.viewAll;
    // A task reaches this dashboard two ways: it is assigned to you, or you are
    // the one who created it. Assignment alone was the rule until 1.6.46, which
    // hid every task a user opened for somebody else — above all the ones created
    // from a lead profile, where the assignee defaults to the lead's owner. That
    // rule left work you scheduled yourself in no calendar you could reach, and
    // it applies to tasks already in the database, not only to new ones.
    const isMyTask = (task: Task) => isOnPersonalDashboard(task, myName);
    // Someone else does the work, you only opened it — worth marking on the card
    // so a delegated task is not mistaken for your own.
    const isDelegatedByMe = (task: Task) =>
        !isTaskAssignedTo(task, myName) && isTaskCreatedBy(task, myName);
    const mayEditTask = (task: Task) =>
        userCanEditTask(task, currentUser, taskAccess);
    const mayDeleteTask = (task: Task) =>
        userCanDeleteTask(task, currentUser, taskAccess);
    // Archiving is the creator's call alone — see canArchiveTask. It still
    // changes the task, so a read-only role (no tasks edit access) cannot do
    // it even to its own tasks.
    const mayArchiveTask = (task: Task) =>
        taskAccess.edit && userCanArchiveTask(task, currentUser);
    const readOnlyHint = () => t(
        "Read-only access — you cannot change tasks.",
        "Iba na čítanie — úlohy nemôžete meniť.",
        "Csak olvasható hozzáférés — a feladatok nem módosíthatók.",
    );
    const archiveDeniedHint = () =>
        !taskAccess.edit
            ? readOnlyHint()
            : t(
                  "Only the person who created this task can archive it.",
                  "Úlohu môže archivovať iba ten, kto ju vytvoril.",
                  "Csak a feladat létrehozója archiválhatja.",
              );
    const myTasks = tasks.filter(isMyTask).filter((task) => !task.archived);

    // Inclusive date-range check against a YYYY-MM-DD string (item 9 calendar filters)
    const dateInRange = (dateStr: string, start: Date | null, end: Date | null) => {
        if (!start) return true;
        const startStr = toLocalDateStr(start);
        const endStr = toLocalDateStr(end || start);
        return dateStr >= startStr && dateStr <= endStr;
    };

    // --- Translations Helper ---
    const t = (en: string, sk: string, hu: string) => {
        if (systemLanguage === "sk") return sk;
        if (systemLanguage === "hu") return hu;
        return en;
    };

    // Legacy archived tasks predate the completedBy field, so it's empty on them.
    // Fall back to a neutral label, never to the current viewer's name — that would
    // misattribute the completion to whoever happens to be looking at the archive.
    const unknownCompletedBy = t("Unknown", "Neznámy", "Ismeretlen");

    // Tasks completed before completedBy was persisted got a best-effort name
    // back-filled server-side (creator, else assignee). Those rows are exactly the
    // ones carrying a name but no completedAt — a real completion always writes
    // both together — so the archive can show the guess in a muted italic and say
    // so on hover, rather than passing an estimate off as recorded history.
    const isEstimatedCompleter = (task: Task) =>
        Boolean(task.completedBy) && !task.completedAt;
    const estimatedCompleterHint = t(
        "Estimated: this task was completed before the app recorded who finished it, so the creator or assignee is shown.",
        "Odhad: táto úloha bola dokončená skôr, než aplikácia zaznamenávala, kto ju dokončil, preto je zobrazený jej tvorca alebo riešiteľ.",
        "Becslés: ezt a feladatot azelőtt fejezték be, hogy az alkalmazás rögzítette volna a befejezőt, ezért a létrehozó vagy a felelős látható.",
    );

    // Locale for native date/time display — driven by the language/region setting.
    const locale = systemLanguage === "sk" ? "sk-SK" : systemLanguage === "hu" ? "hu-HU" : "en-US";

    // Formats a stored "HH:MM" string as a regional time (24h for sk/hu, AM/PM for en-US).
    const formatTimeDisplay = (timeStr?: string) => {
        if (!timeStr) return "";
        const [h, min] = timeStr.split(":").map(Number);
        if (isNaN(h) || isNaN(min)) return timeStr;
        return new Date(2000, 0, 1, h, min).toLocaleTimeString(locale, {
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    // Calendar weekday headers (Mon-first), localized.
    const weekdayNames =
        systemLanguage === "sk"
            ? ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"]
            : systemLanguage === "hu"
              ? ["Hét", "Ked", "Sze", "Csü", "Pén", "Szo", "Vas"]
              : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    // Shared with the task drawer and a project's Tasks tab — see utils/taskLabels.
    const priorityLabel = (prio: string) => taskPriorityLabel(prio, t);
    const stateLabel = (st: string) => taskStateLabel(st, t);

    // The name a task's project goes by on a card; empty when it has none.
    const projectNameFor = (task: Task) => {
        if (!task.relatedProjectId) return "";
        const project = projects.find((p) => p.id === task.relatedProjectId);
        return project
            ? projectDisplayName(project, leads, t("Untitled project", "Projekt bez názvu", "Névtelen projekt"))
            : "";
    };

    // Locale used to render dates in the region format configured in Settings.
    const dateLocale =
        systemLanguage === "sk"
            ? "sk-SK"
            : systemLanguage === "hu"
              ? "hu-HU"
              : "en-US";

    // Renders a "YYYY-MM-DD" task date as a short, region-formatted string (e.g. "23 Jul 2026").
    const formatTaskDate = (dateStr: string) => {
        if (!dateStr) return dateStr;
        const [y, m, d] = dateStr.split("-").map(Number);
        if (!y || !m || !d) return dateStr;
        return new Date(y, m - 1, d).toLocaleDateString(dateLocale, {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    };


    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<"calendar" | "archive" | "global">(
        "calendar",
    );
    // Calendar scope: month view, week view, timeline activity log, or hidden (persisted in cookie)
    const [calendarScope, setCalendarScopeState] = useState<
        "month" | "week" | "timeline" | "hide"
    >(() => getCalendarScopeCookie());

    const setCalendarScope = (scope: "month" | "week" | "timeline" | "hide") => {
        setCalendarScopeState(scope);
        setCalendarScopeCookie(scope);
    };
    const [selectedDay, setSelectedDay] = useState<Date | null>(null);

    // Timeline view filter states
    const [timelineFilter, setTimelineFilter] = useState<
        "all" | "created" | "completed"
    >("all");
    const [timelineSearch, setTimelineSearch] = useState("");
    const [timelineSort, setTimelineSort] = useState<"newest" | "oldest">(
        "newest",
    );

    // Global Tasks: the right-hand half switches between the team workload (the
    // default) and a calendar of the same filtered tasks. It keeps its own anchor,
    // scope and day selection so paging the team calendar never moves My Calendar.
    const [globalRightView, setGlobalRightView] = useState<
        "workload" | "calendar"
    >("workload");
    const [globalCalendarDate, setGlobalCalendarDate] = useState(new Date());
    const [globalCalendarScope, setGlobalCalendarScope] = useState<
        "month" | "week" | "timeline" | "hide"
    >("month");
    const [globalSelectedDay, setGlobalSelectedDay] = useState<Date | null>(
        null,
    );

    // Archive: the same switch over the completed-task history — the grouped list
    // (default) or a calendar of the same filtered tasks, again with its own
    // anchor, scope and day selection.
    const [archiveView, setArchiveView] = useState<"list" | "calendar">("list");
    const [archiveCalendarDate, setArchiveCalendarDate] = useState(new Date());
    const [archiveCalendarScope, setArchiveCalendarScope] = useState<
        "month" | "week" | "timeline" | "hide"
    >("month");
    const [archiveSelectedDay, setArchiveSelectedDay] = useState<Date | null>(
        null,
    );

    // Archive filters state
    const [archiveSearchQuery, setArchiveSearchQuery] = useState("");
    const [archivePriorityFilter, setArchivePriorityFilter] = useState("all");
    const [archiveUserFilter, setArchiveUserFilter] = useState("all");
    const [archiveTimingFilter, setArchiveTimingFilter] = useState("all");

    // Expand/collapse states for task buckets.
    // Missed (Overdue) and Today are always visible (no collapse) — only Tomorrow and
    // Future stay collapsible.
    const [isTomorrowExpanded, setIsTomorrowExpanded] = useState(false);
    const [isFutureExpanded, setIsFutureExpanded] = useState(false);

    // Global Tasks: the left panel keeps the same convention — Missed and Today
    // are always open, Upcoming (tomorrow and later) folds away.
    const [isGlobalUpcomingExpanded, setIsGlobalUpcomingExpanded] =
        useState(false);
    // Global Tasks: which member rows on the right are folded shut. Stacking the
    // whole team vertically makes a long page, so each card can be collapsed to
    // its header; they all start open.
    const [collapsedMembers, setCollapsedMembers] = useState<Set<string>>(
        () => new Set(),
    );
    const [isUnassignedCollapsed, setIsUnassignedCollapsed] = useState(false);
    const toggleMemberCard = (userName: string) =>
        setCollapsedMembers((prev) => {
            const next = new Set(prev);
            if (next.has(userName)) {
                next.delete(userName);
            } else {
                next.add(userName);
            }
            return next;
        });

    // Calendar-based date-range filters for Global tasks & Archive (item 9)
    const [globalDateStart, setGlobalDateStart] = useState<Date | null>(null);
    const [globalDateEnd, setGlobalDateEnd] = useState<Date | null>(null);
    const [archiveDateStart, setArchiveDateStart] = useState<Date | null>(null);
    const [archiveDateEnd, setArchiveDateEnd] = useState<Date | null>(null);

    // Add Task Inline Card State
    const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);

    // Edit Task Drawer State
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [deletingTaskIds, setDeletingTaskIds] = useState<Set<string>>(new Set());

    // Multi-select & Bulk Actions State
    const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
    const [activeBulkMenu, setActiveBulkMenu] = useState<"status" | "priority" | "assignee" | "reschedule" | null>(null);
    const bulkToolbarRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (bulkToolbarRef.current && !bulkToolbarRef.current.contains(e.target as Node)) {
                setActiveBulkMenu(null);
            }
        };
        if (activeBulkMenu) {
            document.addEventListener("mousedown", handler);
        }
        return () => document.removeEventListener("mousedown", handler);
    }, [activeBulkMenu]);

    // Global view filters & user list memo
    const [globalPriorityFilter, setGlobalPriorityFilter] = useState("all");
    const [globalStateFilter, setGlobalStateFilter] = useState("all");
    // "all" keeps the whole-team board; any other value narrows both halves of
    // the split view to that one project manager.
    const [globalUserFilter, setGlobalUserFilter] = useState("all");
    const allUsersList = useMemo(() => {
        const list = users.map((u) => u.name);
        tasks.forEach((t) => {
            if (t.owner && !list.includes(t.owner)) {
                list.push(t.owner);
            }
            if (t.assignedUsers) {
                t.assignedUsers.forEach((u) => {
                    if (u && !list.includes(u)) {
                        list.push(u);
                    }
                });
            }
        });
        if (list.length === 0) {
            if (defaultUserName) list.push(defaultUserName);
        }
        return Array.from(new Set(list));
    }, [users, tasks]);

    // A selected manager can disappear from the list (user deleted, or their
    // last task reassigned). Fall back to the team-wide board instead of
    // leaving the filter pinned to a name that matches nothing.
    React.useEffect(() => {
        if (globalUserFilter !== "all" && !allUsersList.includes(globalUserFilter)) {
            setGlobalUserFilter("all");
        }
    }, [allUsersList, globalUserFilter]);

    React.useEffect(() => {
        if (autoOpenAddTask) {
            if (taskAccess.create) {
                resetNewTaskForm();
                setIsAddDrawerOpen(true);
            } else if (typeof (window as any).showToast === "function") {
                (window as any).showToast(
                    t(
                        "You do not have permission to create tasks.",
                        "Nemáte oprávnenie vytvárať úlohy.",
                        "Nincs jogosultsága feladatok létrehozására.",
                    ),
                );
            }
            if (setAutoOpenAddTask) {
                setAutoOpenAddTask(false);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoOpenAddTask, setAutoOpenAddTask]);

    const closeAddDrawer = () => {
        setIsAddDrawerOpen(false);
    };
    const [newTitle, setNewTitle] = useState("");
    const [newPriority, setNewPriority] = useState<"low" | "medium" | "high">(
        "medium",
    );
    const [newDeadline, setNewDeadline] = useState(() =>
        toLocalDateStr(new Date()),
    );
    const [newDeadlineTime, setNewDeadlineTime] = useState("16:00");
    const [newRelatedLeadId, setNewRelatedLeadId] = useState("");
    const [newRelatedProjectId, setNewRelatedProjectId] = useState("");
    const [newIsLocking, setNewIsLocking] = useState(false);
    const [newEmailReminders, setNewEmailReminders] = useState<Task["emailReminders"]>(undefined);
    const [newAssignedUser, setNewAssignedUser] = useState(defaultUserName);

    // Resets the "New Task" form to fresh defaults
    const resetNewTaskForm = (deadlineDateStr?: string) => {
        setNewTitle("");
        setNewPriority("medium");
        setNewDeadline(deadlineDateStr || toLocalDateStr(new Date()));
        setNewDeadlineTime("16:00");
        setNewRelatedLeadId("");
        setNewRelatedProjectId("");
        setNewIsLocking(false);
        setNewEmailReminders(undefined);
        setNewAssignedUser(defaultUserName);
    };

    // Helpers
    const today = new Date();
    const todayStr = toLocalDateStr(today);
    const yesterdayStr = toLocalDateStr(new Date(today.getTime() - 86400000));
    // Steps an anchor date one month or one week in the given direction. Month
    // steps pin the day to the 1st so a 31st never overflows into the month after
    // next.
    const stepAnchor = (anchor: Date, scope: "month" | "week", dir: -1 | 1) => {
        const next = new Date(anchor);
        if (scope === "week") {
            next.setDate(next.getDate() + dir * 7);
        } else {
            next.setMonth(next.getMonth() + dir, 1);
        }
        return next;
    };

    const monthNames = [
        t("January", "Január", "Január"),
        t("February", "Február", "Február"),
        t("March", "Marec", "Március"),
        t("April", "Apríl", "Április"),
        t("May", "Máj", "Május"),
        t("June", "Jún", "Június"),
        t("July", "Júl", "Július"),
        t("August", "August", "Augusztus"),
        t("September", "September", "Szeptember"),
        t("October", "Október", "Október"),
        t("November", "November", "November"),
        t("December", "December", "December"),
    ];

    // Header label for the paged week, e.g. "24 - 30 Aug 2026".
    const weekRangeLabelOf = (anchor: Date) => {
        const days = getWeekDays(anchor);
        const short = (d: Date) =>
            d.toLocaleDateString(dateLocale, { day: "numeric", month: "short" });
        return `${short(days[0])} – ${short(days[6])} ${days[6].getFullYear()}`;
    };

    // Chronological order for a single day: earliest deadline time first, so a
    // 10:00 task always sits above a 12:00 one and the evening ones land last.
    // Tasks with no explicit time keep the 23:59 default used by the overdue
    // logic, which parks them at the end of the day; ties fall back to the title
    // so the order stays stable between renders.
    const byDeadlineTime = (a: Task, b: Task) => {
        const timeComp = (a.deadlineTime || "23:59").localeCompare(
            b.deadlineTime || "23:59",
        );
        if (timeComp !== 0) return timeComp;
        return a.title.localeCompare(b.title);
    };

    // Same chronological rule across more than one day: earliest date first,
    // then the time within that day. Used by every list that mixes dates (the
    // overdue/upcoming buckets and the Global Tasks columns).
    const byDeadline = (a: Task, b: Task) => {
        const dateComp = a.deadline.localeCompare(b.deadline);
        if (dateComp !== 0) return dateComp;
        return byDeadlineTime(a, b);
    };

    // Item 12: the dashboard calendar shows ONLY tasks (no lead timeline events).
    // Item 11: only the logged-in user's tasks.
    const myTasksForDate = (dateStr: string) =>
        myTasks
            .filter((t) => t.deadline === dateStr && !isDoneState(t.status))
            .sort(byDeadlineTime);

    const calculateOverdueDays = (
        deadlineStr: string,
        completedAtStr?: string,
        deadlineTimeStr?: string,
    ) => {
        if (!completedAtStr) return null;
        const compParts = completedAtStr.split(" ");
        const compDateStr = compParts[0]; // YYYY-MM-DD
        const compTimeStr = compParts[1] || "00:00"; // HH:MM

        if (compDateStr < deadlineStr) return null;

        const limitTime = deadlineTimeStr || "23:59";
        if (compDateStr === deadlineStr) {
            if (compTimeStr <= limitTime) return null;
            return 1; // Completed late on the same day
        }

        const deadDate = new Date(`${deadlineStr}T${limitTime}:00`);
        const compDate = new Date(`${compDateStr}T${compTimeStr}:00`);
        const diffTime = compDate.getTime() - deadDate.getTime();
        if (diffTime <= 0) return null;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    };

    const completedUsersList = useMemo(() => {
        const list = users.map((u) => u.name);
        tasks.forEach((t) => {
            if (
                isDoneState(t.status) &&
                t.completedBy &&
                !list.includes(t.completedBy)
            ) {
                list.push(t.completedBy);
            }
        });
        return Array.from(new Set(list));
    }, [users, tasks]);

    const filteredArchivedTasks = useMemo(() => {
        return tasks.filter((task) => {
            if (!isDoneState(task.status)) return false;

            // The archive is a team-wide history: every user sees the completed
            // tasks of the whole team, not just their own. Use the "Completed By"
            // filter to narrow it down to a single person.

            // Item 9 — calendar date-range filter (by deadline/due date)
            if (!dateInRange(task.deadline, archiveDateStart, archiveDateEnd))
                return false;

            // Search Query
            if (archiveSearchQuery.trim()) {
                const query = archiveSearchQuery.toLowerCase();
                const matchesTitle = task.title.toLowerCase().includes(query);
                const matchesDesc =
                    task.description?.toLowerCase().includes(query) || false;
                if (!matchesTitle && !matchesDesc) return false;
            }

            // Priority
            if (
                archivePriorityFilter !== "all" &&
                task.priority !== archivePriorityFilter
            ) {
                return false;
            }

            // Completed By
            if (
                archiveUserFilter !== "all" &&
                (task.completedBy || unknownCompletedBy) !== archiveUserFilter
            ) {
                return false;
            }

            // Timing Status
            if (archiveTimingFilter !== "all") {
                const overdueDays = calculateOverdueDays(
                    task.deadline,
                    task.completedAt,
                    task.deadlineTime,
                );
                const isOverdue = overdueDays !== null && overdueDays > 0;
                if (archiveTimingFilter === "overdue" && !isOverdue)
                    return false;
                if (archiveTimingFilter === "on_time" && isOverdue)
                    return false;
            }

            return true;
        });
    }, [
        tasks,
        archiveSearchQuery,
        archivePriorityFilter,
        archiveUserFilter,
        archiveTimingFilter,
        archiveDateStart,
        archiveDateEnd,
        unknownCompletedBy,
    ]);

    const archivedTasksGroupedByDate = useMemo(() => {
        const groups: { [date: string]: Task[] } = {};
        filteredArchivedTasks.forEach((task) => {
            // Group by due date (deadline)
            const date = task.deadline || "no-date";
            if (!groups[date]) {
                groups[date] = [];
            }
            groups[date].push(task);
        });
        return Object.keys(groups)
            .sort((a, b) => b.localeCompare(a))
            .map((date) => ({
                date,
                tasks: groups[date],
            }));
    }, [filteredArchivedTasks]);

    // Completed tasks land on the archive calendar by their due date, which is
    // the same date the grouped list buckets them under.
    const archivedTasksForDate = (dateStr: string) =>
        filteredArchivedTasks
            .filter((task) => task.deadline === dateStr)
            .sort(byDeadlineTime);

    const handleRestoreTask = (task: Task) => {
        if (!mayEditTask(task)) return;
        const restoredTask: Task = {
            ...task,
            status: taskStates[0] || "New",
            completedAt: undefined,
            completedBy: undefined,
        };
        setTasks((prev) =>
            prev.map((t) => (t.id === task.id ? restoredTask : t)),
        );
        setEditingTask(restoredTask);
        if (typeof (window as any).showToast === "function") {
            (window as any).showToast(
                t(
                    "Task restored and ready for editing!",
                    "Úloha bola obnovená a je pripravená na úpravu!",
                    "A feladat helyreállítva és kész a szerkesztésre!",
                ),
            );
        }
    };

    const handleArchiveTask = (task: Task) => {
        if (!mayArchiveTask(task)) return;
        setTasks((prev) =>
            prev.map((t) =>
                t.id === task.id ? { ...t, archived: true } : t,
            ),
        );
        if (typeof (window as any).showToast === "function") {
            // Name the consequence: archiving takes the task out of every
            // calendar and list at once, and users were reading it as a delete.
            (window as any).showToast(
                t(
                    "Task archived — hidden from the calendar. Find it under Archived tasks.",
                    "Úloha archivovaná — zmizne z kalendára. Nájdete ju medzi archivovanými úlohami.",
                    "Feladat archiválva — eltűnik a naptárból. Az archivált feladatok között találja meg.",
                ),
            );
        }
    };

    const handleUnarchiveTask = (task: Task) => {
        if (!mayArchiveTask(task)) return;
        setTasks((prev) =>
            prev.map((t) =>
                t.id === task.id ? { ...t, archived: false } : t,
            ),
        );
        if (typeof (window as any).showToast === "function") {
            (window as any).showToast(
                t(
                    "Task unarchived",
                    "Archivácia úlohy zrušená",
                    "Feladat archiválása visszavonva",
                ),
            );
        }
    };

    const handleDeleteTask = async (task: Task) => {
        if (!mayDeleteTask(task) || deletingTaskIds.has(task.id)) return;
        const confirmed = window.confirm(
            t(
                `Permanently delete "${task.title}"? This cannot be undone.`,
                `Natrvalo odstrániť úlohu "${task.title}"? Túto akciu nemožno vrátiť späť.`,
                `Véglegesen törli a(z) "${task.title}" feladatot? Ez nem vonható vissza.`,
            ),
        );
        if (!confirmed) return;
        setDeletingTaskIds((prev) => new Set(prev).add(task.id));
        try {
            await requestTaskDeletion(task.id);
            setTasks((prev) => prev.filter((item) => item.id !== task.id));
            if (typeof (window as any).showToast === "function") {
                (window as any).showToast(
                    t("Task deleted", "Úloha odstránená", "Feladat törölve"),
                );
            }
        } catch (error) {
            console.error("Task deletion failed", error);
            if (typeof (window as any).showToast === "function") {
                (window as any).showToast(
                    t(
                        "Task was not deleted. Please try again.",
                        "Úloha nebola odstránená. Skúste to znova.",
                        "A feladat nem lett törölve. Próbálja újra.",
                    ),
                );
            }
        } finally {
            setDeletingTaskIds((prev) => {
                const next = new Set(prev);
                next.delete(task.id);
                return next;
            });
        }
    };

    // --- Bulk Selection & Operations ---
    const isSingleUserView = canSeeAllTasks && globalUserFilter !== "all";

    const matchesGlobalFilters = React.useCallback(
        (task: Task) => {
            if (
                globalPriorityFilter !== "all" &&
                task.priority !== globalPriorityFilter
            )
                return false;
            if (globalStateFilter !== "all" && task.status !== globalStateFilter)
                return false;
            if (
                isSingleUserView &&
                !task.assignedUsers?.includes(globalUserFilter)
            )
                return false;
            if (!dateInRange(task.deadline, globalDateStart, globalDateEnd))
                return false;
            return true;
        },
        [globalPriorityFilter, globalStateFilter, isSingleUserView, globalUserFilter, globalDateStart, globalDateEnd]
    );

    const filteredGlobalTasks = useMemo(() => {
        const activeTasks = (canSeeAllTasks ? tasks : myTasks).filter((task) =>
            isActiveTask(task, isDoneState)
        );
        return activeTasks.filter(matchesGlobalFilters);
    }, [canSeeAllTasks, tasks, myTasks, matchesGlobalFilters]);

    const visibleTasksInCurrentView = useMemo(() => {
        if (viewMode === "calendar") {
            return myTasks;
        }
        if (viewMode === "global") {
            return filteredGlobalTasks;
        }
        if (viewMode === "archive") {
            const manualArchived = tasks.filter((t) => t.archived);
            const map = new Map<string, Task>();
            filteredArchivedTasks.forEach((t) => map.set(t.id, t));
            manualArchived.forEach((t) => map.set(t.id, t));
            return Array.from(map.values());
        }
        return [];
    }, [viewMode, myTasks, filteredGlobalTasks, filteredArchivedTasks, tasks]);

    const areAllVisibleSelected = useMemo(() => {
        if (visibleTasksInCurrentView.length === 0) return false;
        return visibleTasksInCurrentView.every((t) => selectedTaskIds.has(t.id));
    }, [visibleTasksInCurrentView, selectedTaskIds]);

    const handleToggleSelect = (taskId: string) => {
        setSelectedTaskIds((prev) => {
            const next = new Set(prev);
            if (next.has(taskId)) {
                next.delete(taskId);
            } else {
                next.add(taskId);
            }
            return next;
        });
    };

    const handleSelectAllVisible = () => {
        setSelectedTaskIds((prev) => {
            const next = new Set(prev);
            if (areAllVisibleSelected) {
                visibleTasksInCurrentView.forEach((t) => next.delete(t.id));
            } else {
                visibleTasksInCurrentView.forEach((t) => next.add(t.id));
            }
            return next;
        });
    };

    const handleClearSelection = () => {
        setSelectedTaskIds(new Set());
    };

    const selectedTasks = useMemo(() => {
        return tasks.filter((t) => selectedTaskIds.has(t.id));
    }, [tasks, selectedTaskIds]);

    const hasActiveSelected = useMemo(() => {
        return selectedTasks.some((t) => !t.archived);
    }, [selectedTasks]);

    const hasArchivedSelected = useMemo(() => {
        return selectedTasks.some((t) => t.archived);
    }, [selectedTasks]);

    const handleBulkStatusChange = (newStatus: string) => {
        const now = new Date();
        const completedAtStr = isDoneState(newStatus)
            ? toLocalDateStr(now) + " " + now.toTimeString().split(" ")[0].substring(0, 5)
            : undefined;
        const completedByName = isDoneState(newStatus)
            ? currentUser?.name || defaultUserName
            : undefined;

        let modifiedCount = 0;
        let skippedCount = 0;

        setTasks((prev) =>
            prev.map((t) => {
                if (selectedTaskIds.has(t.id)) {
                    if (mayEditTask(t)) {
                        modifiedCount++;
                        return {
                            ...t,
                            status: newStatus,
                            completedBy: completedByName,
                            completedAt: completedAtStr,
                        };
                    } else {
                        skippedCount++;
                    }
                }
                return t;
            })
        );
        setActiveBulkMenu(null);

        if (typeof (window as any).showToast === "function") {
            if (modifiedCount > 0) {
                (window as any).showToast(
                    t(
                        `${modifiedCount} tasks updated to "${stateLabel(newStatus)}"${skippedCount > 0 ? ` (${skippedCount} skipped)` : ""}`,
                        `${modifiedCount} úloh zmenených na "${stateLabel(newStatus)}"${skippedCount > 0 ? ` (${skippedCount} vynechaných)` : ""}`,
                        `${modifiedCount} feladat módosítva "${stateLabel(newStatus)}" állapotra${skippedCount > 0 ? ` (${skippedCount} kihagyva)` : ""}`
                    )
                );
            } else if (skippedCount > 0) {
                (window as any).showToast(
                    t(
                        "No tasks could be modified due to permissions.",
                        "Žiadne úlohy nebolo možné upraviť z dôvodu oprávnení.",
                        "A jogosultságok miatt egyetlen feladat sem módosítható."
                    )
                );
            }
        }
    };

    const handleBulkPriorityChange = (newPriority: "low" | "medium" | "high") => {
        let modifiedCount = 0;
        let skippedCount = 0;

        setTasks((prev) =>
            prev.map((t) => {
                if (selectedTaskIds.has(t.id)) {
                    if (mayEditTask(t)) {
                        modifiedCount++;
                        return { ...t, priority: newPriority };
                    } else {
                        skippedCount++;
                    }
                }
                return t;
            })
        );
        setActiveBulkMenu(null);

        if (typeof (window as any).showToast === "function") {
            if (modifiedCount > 0) {
                (window as any).showToast(
                    t(
                        `${modifiedCount} tasks updated to ${priorityLabel(newPriority)} priority${skippedCount > 0 ? ` (${skippedCount} skipped)` : ""}`,
                        `${modifiedCount} úloh aktualizovaných na prioritu ${priorityLabel(newPriority)}${skippedCount > 0 ? ` (${skippedCount} vynechaných)` : ""}`,
                        `${modifiedCount} feladat prioritása módosítva: ${priorityLabel(newPriority)}${skippedCount > 0 ? ` (${skippedCount} kihagyva)` : ""}`
                    )
                );
            } else if (skippedCount > 0) {
                (window as any).showToast(
                    t(
                        "No tasks could be modified due to permissions.",
                        "Žiadne úlohy nebolo možné upraviť z dôvodu oprávnení.",
                        "A jogosultságok miatt egyetlen feladat sem módosítható."
                    )
                );
            }
        }
    };

    const handleBulkAssigneeChange = (assignedUser: string) => {
        let modifiedCount = 0;
        let skippedCount = 0;

        setTasks((prev) =>
            prev.map((t) => {
                if (selectedTaskIds.has(t.id)) {
                    if (mayEditTask(t)) {
                        modifiedCount++;
                        return {
                            ...t,
                            owner: assignedUser,
                            assignedUsers: assignedUser ? [assignedUser] : [],
                        };
                    } else {
                        skippedCount++;
                    }
                }
                return t;
            })
        );
        setActiveBulkMenu(null);

        if (typeof (window as any).showToast === "function") {
            if (modifiedCount > 0) {
                (window as any).showToast(
                    t(
                        `${modifiedCount} tasks assigned to ${assignedUser || "unassigned"}${skippedCount > 0 ? ` (${skippedCount} skipped)` : ""}`,
                        `${modifiedCount} úloh priradených používateľovi ${assignedUser || "nepriradené"}${skippedCount > 0 ? ` (${skippedCount} vynechaných)` : ""}`,
                        `${modifiedCount} feladat hozzárendelve: ${assignedUser || "nincs felelős"}${skippedCount > 0 ? ` (${skippedCount} kihagyva)` : ""}`
                    )
                );
            } else if (skippedCount > 0) {
                (window as any).showToast(
                    t(
                        "No tasks could be modified due to permissions.",
                        "Žiadne úlohy nebolo možné upraviť z dôvodu oprávnení.",
                        "A jogosultságok miatt egyetlen feladat sem módosítható."
                    )
                );
            }
        }
    };

    const handleBulkReschedule = (newDateStr: string) => {
        if (!newDateStr) return;
        let modifiedCount = 0;
        let skippedCount = 0;

        setTasks((prev) =>
            prev.map((t) => {
                if (selectedTaskIds.has(t.id)) {
                    if (mayEditTask(t)) {
                        modifiedCount++;
                        return { ...t, deadline: newDateStr };
                    } else {
                        skippedCount++;
                    }
                }
                return t;
            })
        );
        setActiveBulkMenu(null);

        if (typeof (window as any).showToast === "function") {
            if (modifiedCount > 0) {
                (window as any).showToast(
                    t(
                        `${modifiedCount} tasks rescheduled to ${formatTaskDate(newDateStr)}${skippedCount > 0 ? ` (${skippedCount} skipped)` : ""}`,
                        `${modifiedCount} úloh preplánovaných na ${formatTaskDate(newDateStr)}${skippedCount > 0 ? ` (${skippedCount} vynechaných)` : ""}`,
                        `${modifiedCount} feladat átütemezve: ${formatTaskDate(newDateStr)}${skippedCount > 0 ? ` (${skippedCount} kihagyva)` : ""}`
                    )
                );
            } else if (skippedCount > 0) {
                (window as any).showToast(
                    t(
                        "No tasks could be modified due to permissions.",
                        "Žiadne úlohy nebolo možné upraviť z dôvodu oprávnení.",
                        "A jogosultságok miatt egyetlen feladat sem módosítható."
                    )
                );
            }
        }
    };

    const handleBulkArchive = () => {
        let modifiedCount = 0;
        let skippedCount = 0;

        setTasks((prev) =>
            prev.map((t) => {
                if (selectedTaskIds.has(t.id) && !t.archived) {
                    if (mayArchiveTask(t)) {
                        modifiedCount++;
                        return { ...t, archived: true };
                    } else {
                        skippedCount++;
                    }
                }
                return t;
            })
        );
        handleClearSelection();

        if (typeof (window as any).showToast === "function") {
            if (modifiedCount > 0) {
                (window as any).showToast(
                    t(
                        `${modifiedCount} tasks archived`,
                        `${modifiedCount} úloh archivovaných`,
                        `${modifiedCount} feladat archiválva`
                    )
                );
            } else if (skippedCount > 0) {
                (window as any).showToast(
                    t(
                        "No tasks could be archived due to permissions.",
                        "Žiadne úlohy nebolo možné archivovať z dôvodu oprávnení.",
                        "A jogosultságok miatt egyetlen feladat sem archiválható."
                    )
                );
            }
        }
    };

    const handleBulkRestore = () => {
        let modifiedCount = 0;
        let skippedCount = 0;

        setTasks((prev) =>
            prev.map((t) => {
                if (selectedTaskIds.has(t.id) && t.archived) {
                    if (mayArchiveTask(t)) {
                        modifiedCount++;
                        return {
                            ...t,
                            archived: false,
                            status: taskStates[0] || "New",
                            completedAt: undefined,
                            completedBy: undefined,
                        };
                    } else {
                        skippedCount++;
                    }
                }
                return t;
            })
        );
        handleClearSelection();

        if (typeof (window as any).showToast === "function") {
            if (modifiedCount > 0) {
                (window as any).showToast(
                    t(
                        `${modifiedCount} tasks restored`,
                        `${modifiedCount} úloh obnovených z archívu`,
                        `${modifiedCount} feladat visszaállítva az archívumból`
                    )
                );
            } else if (skippedCount > 0) {
                (window as any).showToast(
                    t(
                        "No tasks could be restored due to permissions.",
                        "Žiadne úlohy nebolo možné obnoviť z dôvodu oprávnení.",
                        "A jogosultságok miatt egyetlen feladat sem állítható vissza."
                    )
                );
            }
        }
    };

    const handleBulkDelete = async () => {
        const deletableTasks = tasks.filter(
            (t) => selectedTaskIds.has(t.id) && mayDeleteTask(t)
        );
        if (deletableTasks.length === 0) {
            if (typeof (window as any).showToast === "function") {
                (window as any).showToast(
                    t(
                        "You do not have permission to delete the selected tasks.",
                        "Nemáte oprávnenie vymazať vybrané úlohy.",
                        "Nincs jogosultsága a kiválasztott feladatok törlésére."
                    )
                );
            }
            return;
        }

        const count = deletableTasks.length;
        const confirmed = window.confirm(
            t(
                `Permanently delete ${count} selected task${count > 1 ? "s" : ""}? This cannot be undone.`,
                `Natrvalo odstrániť ${count} vybraných úloh? Túto akciu nemožno vrátiť späť.`,
                `Véglegesen törli a(z) ${count} kiválasztott feladatot? Ez nem vonható vissza.`
            )
        );
        if (!confirmed) return;

        const idsToDelete = new Set(deletableTasks.map((t) => t.id));
        setDeletingTaskIds((prev) => new Set([...prev, ...idsToDelete]));

        try {
            await Promise.all(
                deletableTasks.map((t) =>
                    requestTaskDeletion(t.id).catch((err) => {
                        console.error(`Failed to delete task ${t.id}`, err);
                        return null;
                    })
                )
            );

            setTasks((prev) => prev.filter((item) => !idsToDelete.has(item.id)));
            setSelectedTaskIds((prev) => {
                const next = new Set(prev);
                idsToDelete.forEach((id) => next.delete(id));
                return next;
            });

            if (typeof (window as any).showToast === "function") {
                (window as any).showToast(
                    t(
                        `${count} tasks deleted`,
                        `${count} úloh odstránených`,
                        `${count} feladat törölve`
                    )
                );
            }
        } finally {
            setDeletingTaskIds((prev) => {
                const next = new Set(prev);
                idsToDelete.forEach((id) => next.delete(id));
                return next;
            });
        }
    };

    const renderBulkActionToolbar = () => {
        if (selectedTaskIds.size === 0) return null;
        if (typeof document === "undefined") return null;

        const selectedCount = selectedTaskIds.size;
        const countLabel =
            systemLanguage === "sk"
                ? selectedCount === 1
                    ? "1 vybraná"
                    : selectedCount >= 2 && selectedCount <= 4
                      ? `${selectedCount} vybrané`
                      : `${selectedCount} vybraných`
                : systemLanguage === "hu"
                  ? `${selectedCount} kiválasztva`
                  : `${selectedCount} selected`;

        return createPortal(
            <div
                ref={bulkToolbarRef}
                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100000] max-w-[95vw] sm:max-w-3xl lg:max-w-4xl bg-slate-900/95 text-white backdrop-blur-xl px-4 py-2.5 rounded-2xl shadow-2xl border border-slate-700/70 flex flex-wrap items-center justify-between gap-2.5 animate-in fade-in slide-in-from-bottom-5 duration-200"
            >
                {/* Left: Count and selection management */}
                <div className="flex items-center gap-2">
                    <span className="bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-black px-2.5 py-1 rounded-xl">
                        {countLabel}
                    </span>
                    <button
                        type="button"
                        onClick={handleSelectAllVisible}
                        className="text-[11px] font-bold text-slate-300 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                        {areAllVisibleSelected
                            ? t("Deselect visible", "Zrušiť výber zobrazených", "Láthatók kijelölésének törlése")
                            : t(
                                  `Select all visible (${visibleTasksInCurrentView.length})`,
                                  `Vybrať všetky zobrazené (${visibleTasksInCurrentView.length})`,
                                  `Összes látható kijelölése (${visibleTasksInCurrentView.length})`
                              )}
                    </button>
                    <button
                        type="button"
                        onClick={handleClearSelection}
                        title={t("Clear selection", "Zrušiť výber", "Kijelölés törlése")}
                        className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="h-5 w-px bg-slate-700/80 hidden sm:block" />

                {/* Right: Actions */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Status Dropdown */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() =>
                                setActiveBulkMenu(
                                    activeBulkMenu === "status" ? null : "status"
                                )
                            }
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-xs font-black transition-colors border border-slate-700/50 cursor-pointer"
                        >
                            <CheckSquare className="h-3.5 w-3.5 text-indigo-400" />
                            <span>{t("Status", "Stav", "Státusz")}</span>
                            <ChevronDown className="h-3 w-3 text-slate-400" />
                        </button>
                        {activeBulkMenu === "status" && (
                            <div className="absolute bottom-full mb-2 left-0 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-1.5 min-w-[160px] space-y-0.5 animate-in fade-in zoom-in-95 duration-100 z-50">
                                {taskStates.map((st) => (
                                    <button
                                        key={st}
                                        type="button"
                                        onClick={() => handleBulkStatusChange(st)}
                                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-200 hover:bg-indigo-600 hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
                                    >
                                        <span
                                            className="h-2 w-2 rounded-full shrink-0"
                                            style={{
                                                backgroundColor:
                                                    taskStateColors[st] || "#94a3b8",
                                            }}
                                        />
                                        <span>{stateLabel(st)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Priority Dropdown */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() =>
                                setActiveBulkMenu(
                                    activeBulkMenu === "priority" ? null : "priority"
                                )
                            }
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-xs font-black transition-colors border border-slate-700/50 cursor-pointer"
                        >
                            <Flame className="h-3.5 w-3.5 text-amber-400" />
                            <span>{t("Priority", "Priorita", "Prioritás")}</span>
                            <ChevronDown className="h-3 w-3 text-slate-400" />
                        </button>
                        {activeBulkMenu === "priority" && (
                            <div className="absolute bottom-full mb-2 left-0 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-1.5 min-w-[140px] space-y-0.5 animate-in fade-in zoom-in-95 duration-100 z-50">
                                {(["low", "medium", "high"] as const).map((prio) => (
                                    <button
                                        key={prio}
                                        type="button"
                                        onClick={() => handleBulkPriorityChange(prio)}
                                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-200 hover:bg-indigo-600 hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
                                    >
                                        <span
                                            className={`h-2 w-2 rounded-full shrink-0 ${
                                                prio === "high"
                                                    ? "bg-rose-500"
                                                    : prio === "medium"
                                                      ? "bg-amber-500"
                                                      : "bg-slate-400"
                                            }`}
                                        />
                                        <span>{priorityLabel(prio)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Assignee Dropdown */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() =>
                                setActiveBulkMenu(
                                    activeBulkMenu === "assignee" ? null : "assignee"
                                )
                            }
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-xs font-black transition-colors border border-slate-700/50 cursor-pointer"
                        >
                            <Users className="h-3.5 w-3.5 text-sky-400" />
                            <span>{t("Assignee", "Riešiteľ", "Felelős")}</span>
                            <ChevronDown className="h-3 w-3 text-slate-400" />
                        </button>
                        {activeBulkMenu === "assignee" && (
                            <div className="absolute bottom-full mb-2 left-0 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-1.5 min-w-[170px] max-h-56 overflow-y-auto space-y-0.5 animate-in fade-in zoom-in-95 duration-100 z-50">
                                {allUsersList.map((uName) => (
                                    <button
                                        key={uName}
                                        type="button"
                                        onClick={() => handleBulkAssigneeChange(uName)}
                                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-200 hover:bg-indigo-600 hover:text-white transition-colors flex items-center justify-between gap-2 cursor-pointer"
                                    >
                                        <span className="truncate">{uName}</span>
                                        {uName === myName && (
                                            <span className="text-[9px] bg-slate-800 px-1 py-0.5 rounded text-indigo-300">
                                                {t("You", "Vy", "Ön")}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Reschedule Popover */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() =>
                                setActiveBulkMenu(
                                    activeBulkMenu === "reschedule" ? null : "reschedule"
                                )
                            }
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-xs font-black transition-colors border border-slate-700/50 cursor-pointer"
                        >
                            <CalendarIcon className="h-3.5 w-3.5 text-indigo-400" />
                            <span>{t("Reschedule", "Termín", "Átütemezés")}</span>
                            <ChevronDown className="h-3 w-3 text-slate-400" />
                        </button>
                        {activeBulkMenu === "reschedule" && (
                            <div className="absolute bottom-full mb-2 left-0 sm:right-0 sm:left-auto bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-3 min-w-[220px] space-y-2 animate-in fade-in zoom-in-95 duration-100 z-50">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                                    {t("Set Due Date", "Nastaviť termín", "Határidő beállítása")}
                                </span>
                                <div className="grid grid-cols-3 gap-1">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleBulkReschedule(toLocalDateStr(new Date()))
                                        }
                                        className="px-2 py-1 rounded bg-slate-800 hover:bg-indigo-600 text-[10px] font-bold text-center transition-colors cursor-pointer"
                                    >
                                        {t("Today", "Dnes", "Ma")}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleBulkReschedule(
                                                toLocalDateStr(
                                                    new Date(Date.now() + 86400000)
                                                )
                                            )
                                        }
                                        className="px-2 py-1 rounded bg-slate-800 hover:bg-indigo-600 text-[10px] font-bold text-center transition-colors cursor-pointer"
                                    >
                                        {t("Tomorrow", "Zajtra", "Holnap")}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleBulkReschedule(
                                                toLocalDateStr(
                                                    new Date(Date.now() + 7 * 86400000)
                                                )
                                            )
                                        }
                                        className="px-2 py-1 rounded bg-slate-800 hover:bg-indigo-600 text-[10px] font-bold text-center transition-colors cursor-pointer"
                                    >
                                        {t("+1 Week", "+1 týždeň", "+1 hét")}
                                    </button>
                                </div>
                                <div className="pt-1 border-t border-slate-800">
                                    <input
                                        type="date"
                                        onChange={(e) => {
                                            if (e.target.value) {
                                                handleBulkReschedule(e.target.value);
                                            }
                                        }}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Archive / Restore Button */}
                    {hasActiveSelected && (
                        <button
                            type="button"
                            onClick={handleBulkArchive}
                            title={t("Archive selected tasks", "Archivovať vybrané úlohy", "Kiválasztott feladatok archiválása")}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-amber-900/40 text-amber-300 hover:text-amber-100 text-xs font-black transition-colors border border-slate-700/50 hover:border-amber-700/50 cursor-pointer"
                        >
                            <ArchiveIcon className="h-3.5 w-3.5 text-amber-400" />
                            <span>{t("Archive", "Archivovať", "Archiválás")}</span>
                        </button>
                    )}
                    {hasArchivedSelected && (
                        <button
                            type="button"
                            onClick={handleBulkRestore}
                            title={t("Restore selected tasks", "Obnoviť vybrané úlohy", "Kiválasztott feladatok visszaállítása")}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-indigo-900/40 text-indigo-300 hover:text-indigo-100 text-xs font-black transition-colors border border-slate-700/50 hover:border-indigo-700/50 cursor-pointer"
                        >
                            <RotateCcw className="h-3.5 w-3.5 text-indigo-400" />
                            <span>{t("Restore", "Obnoviť", "Visszaállítás")}</span>
                        </button>
                    )}

                    {/* Delete Button */}
                    <button
                        type="button"
                        onClick={handleBulkDelete}
                        title={t("Delete selected tasks", "Odstrániť vybrané úlohy", "Kiválasztott feladatok törlése")}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-100 text-xs font-black transition-colors border border-rose-800/60 cursor-pointer ml-1"
                    >
                        <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                        <span className="hidden sm:inline">{t("Delete", "Vymazať", "Törlés")}</span>
                    </button>
                </div>
            </div>,
            document.body
        );
    };

    const handleCreateTask = (e: React.FormEvent) => {
        e.preventDefault();
        if (!taskAccess.create) {
            closeAddDrawer();
            return;
        }
        const lines = newTitle
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (lines.length === 0) {
            (window as any).showToast(
                t(
                    "Please enter a task title!",
                    "Prosím zadajte názov úlohy!",
                    "Kérjük, adja meg a feladat címét!",
                ),
            );
            return;
        }

        const now = Date.now();
        const createdTasks: Task[] = lines.map((title, index) => ({
            id: `task-${now}-${index}-${Math.random().toString(36).slice(2, 7)}`,
            title,
            description: "",
            status: taskStates[0] || "New",
            priority: newPriority,
            deadline: newDeadline,
            deadlineTime: newDeadlineTime,
            owner: newAssignedUser,
            createdBy: myName,
            assignedUsers: newAssignedUser ? [newAssignedUser] : [],
            relatedLeadId: newRelatedLeadId || undefined,
            relatedProjectId: newRelatedProjectId || undefined,
            isLocking: newRelatedLeadId ? newIsLocking : false,
            emailReminders: newEmailReminders,
        }));

        setTasks((prev) => [...createdTasks, ...prev]);

        // Reset Form & Close Card
        resetNewTaskForm();
        closeAddDrawer();
    };

    // --- RENDERING ---

    // --- RENDERING HELPERS ---

    const renderMonthGrid = (cfg: CalendarPanelConfig) => {
        const monthDays = getMonthDays(
            cfg.anchor.getFullYear(),
            cfg.anchor.getMonth(),
        );
        const padding = getMonthPadding(
            cfg.anchor.getFullYear(),
            cfg.anchor.getMonth(),
        );
        return (
            <div className="flex flex-col h-full bg-white animate-in fade-in zoom-in-95 duration-200">
                {/* Days Header */}
                <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200 shrink-0">
                    {weekdayNames.map((d) => (
                        <div
                            key={d}
                            className="py-2.5 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest border-r border-slate-100 last:border-0"
                        >
                            {d}
                        </div>
                    ))}
                </div>

                {/* Grid Cells */}
                <div className="flex-1 grid grid-cols-7 grid-rows-5 lg:overflow-y-auto overflow-visible">
                    {Array.from({ length: padding }).map((_, i) => (
                        <div
                            key={`pad-${i}`}
                            className="bg-slate-50/50 border-b border-r border-slate-100 min-h-[80px]"
                        />
                    ))}

                    {monthDays.map((date, idx) => {
                        const dateStr = toLocalDateStr(date);
                        const isToday = dateStr === todayStr;
                        const isPast = dateStr < todayStr;
                        const isTomorrow = dateStr === tomorrowStr;

                        const dayTasks = cfg.tasksForDate(dateStr);

                        const displayTasks = dayTasks.slice(0, 3);
                        const hiddenCount = dayTasks.length - displayTasks.length;

                        // Determine cell background styling based on time bucket
                        let cellBgClass = "bg-white";
                        if (isPast) cellBgClass = "bg-slate-50/70";
                        else if (isToday)
                            cellBgClass =
                                "bg-indigo-50/40 border-indigo-100/60 shadow-[inset_0_0_10px_rgba(79,70,229,0.05)]";
                        else if (isTomorrow) cellBgClass = "bg-amber-50/30";

                        return (
                            <div
                                key={idx}
                                onClick={() => cfg.onSelectDay(date)}
                                className={`min-h-[80px] border-b border-r border-slate-100 p-1.5 flex flex-col gap-1 transition-all cursor-pointer group relative hover:bg-slate-50 ${cellBgClass}`}
                            >
                                <div
                                    className={`text-[10px] font-black self-end mb-0.5 w-5 h-5 flex items-center justify-center rounded-full ${
                                        isToday
                                            ? "bg-indigo-600 text-white shadow-sm"
                                            : isPast
                                              ? "text-slate-300 group-hover:text-slate-500"
                                              : isTomorrow
                                                ? "text-amber-600 group-hover:bg-amber-100"
                                                : "text-slate-400 group-hover:bg-slate-100 group-hover:text-indigo-600"
                                    }`}
                                >
                                    {date.getDate()}
                                </div>

                                <div className="flex-1 space-y-1 overflow-hidden">
                                    {/* Render Tasks */}
                                    {displayTasks.map((t) => (
                                        <div
                                            key={t.id}
                                            className={`truncate text-[8px] font-bold px-1 py-0.5 rounded border shadow-[0_1px_2px_rgba(0,0,0,0.02)] ${
                                                t.priority === "high"
                                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                                    : t.priority === "medium"
                                                      ? "bg-amber-50 text-amber-700 border-amber-200"
                                                      : "bg-slate-50 text-slate-700 border-slate-200"
                                            }`}
                                        >
                                            {t.isLocking && (
                                                <Lock className="inline h-2 w-2 mr-0.5 -mt-0.5 text-rose-500" />
                                            )}
                                            {t.title}
                                        </div>
                                    ))}

                                    {hiddenCount > 0 && (
                                        <div className="text-[8px] font-black text-slate-400 pl-1">
                                            +{hiddenCount}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // Week scope: the same seven weekday columns as the month grid, but showing a
    // single paged week so every task of that week is readable without opening a
    // day. Each column lists its tasks in chronological order.
    const renderWeekGrid = (cfg: CalendarPanelConfig) => {
        const weekDays = getWeekDays(cfg.anchor);
        return (
            <div className="flex flex-col h-full bg-white animate-in fade-in zoom-in-95 duration-200">
                {/* Days Header */}
                <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200 shrink-0">
                    {weekDays.map((date, idx) => {
                        const dateStr = toLocalDateStr(date);
                        const isToday = dateStr === todayStr;
                        return (
                            <div
                                key={dateStr}
                                className={`py-2 text-center border-r border-slate-100 last:border-0 ${
                                    isToday ? "bg-indigo-50/60" : ""
                                }`}
                            >
                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    {weekdayNames[idx]}
                                </div>
                                <div
                                    className={`mt-1 mx-auto text-[11px] font-black w-6 h-6 flex items-center justify-center rounded-full ${
                                        isToday
                                            ? "bg-indigo-600 text-white shadow-sm"
                                            : "text-slate-600"
                                    }`}
                                >
                                    {date.getDate()}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Day Columns */}
                <div className="flex-1 grid grid-cols-7 lg:overflow-y-auto overflow-visible">
                    {weekDays.map((date) => {
                        const dateStr = toLocalDateStr(date);
                        const isToday = dateStr === todayStr;
                        const isPast = dateStr < todayStr;
                        const dayTasks = cfg.tasksForDate(dateStr);

                        return (
                            <div
                                key={dateStr}
                                onClick={() => cfg.onSelectDay(date)}
                                className={`min-h-[220px] border-r border-slate-100 last:border-0 p-1.5 flex flex-col gap-1.5 transition-all cursor-pointer hover:bg-slate-50 ${
                                    isToday
                                        ? "bg-indigo-50/30"
                                        : isPast
                                          ? "bg-slate-50/70"
                                          : "bg-white"
                                }`}
                            >
                                {dayTasks.length === 0 ? (
                                    <span className="text-[8px] font-bold text-slate-300 uppercase tracking-wider text-center mt-2">
                                        —
                                    </span>
                                ) : (
                                    dayTasks.map((tk) => (
                                        <div
                                            key={tk.id}
                                            className={`text-[8.5px] font-bold px-1.5 py-1 rounded-lg border shadow-[0_1px_2px_rgba(0,0,0,0.02)] ${
                                                tk.priority === "high"
                                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                                    : tk.priority === "medium"
                                                      ? "bg-amber-50 text-amber-700 border-amber-200"
                                                      : "bg-slate-50 text-slate-700 border-slate-200"
                                            }`}
                                        >
                                            <span className="block font-black tabular-nums opacity-70">
                                                {formatTimeDisplay(
                                                    tk.deadlineTime || "23:59",
                                                )}
                                            </span>
                                            <span className="block truncate">
                                                {tk.isLocking && (
                                                    <Lock className="inline h-2 w-2 mr-0.5 -mt-0.5 text-rose-500" />
                                                )}
                                                {tk.title}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderDayView = (cfg: CalendarPanelConfig) => {
        const dayDate = cfg.selectedDay;
        if (!dayDate) return null;

        const selectedDateStr = toLocalDateStr(dayDate);
        const dayTasks = cfg.tasksForDate(selectedDateStr);

        return (
            <div className="flex flex-col h-full animate-in fade-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <div>
                        <button
                            onClick={() => cfg.onSelectDay(null)}
                            className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-black text-[10px] uppercase tracking-wider transition-colors cursor-pointer mb-2"
                        >
                            <ChevronLeft className="h-4 w-4" />
                            {cfg.scope === "week"
                                ? t(
                                      "Back to Week Calendar",
                                      "Späť na týždenný kalendár",
                                      "Vissza a heti naptárhoz",
                                  )
                                : t(
                                      "Back to Month Calendar",
                                      "Späť na mesačný kalendár",
                                      "Vissza a havi naptárhoz",
                                  )}
                        </button>
                        <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                            <CalendarIcon className="h-6 w-6 text-indigo-600 stroke-[2.5]" />
                            {dayDate.toLocaleDateString(dateLocale, {
                                weekday: "long",
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                            })}
                        </h2>
                    </div>
                    {cfg.onAddTask && (
                        <button
                            onClick={() => cfg.onAddTask?.(selectedDateStr)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-[10px] uppercase tracking-wider shadow-md shadow-indigo-600/30 transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!taskAccess.create}
                        >
                            <Plus className="h-4 w-4 stroke-[3]" />
                            {t("Add Task", "Pridať úlohu", "Új feladat")}
                        </button>
                    )}
                </div>

                <div className="flex-1 lg:overflow-y-auto overflow-visible p-6 space-y-3 bg-slate-50/30">
                    {/* The day reads as a timeline: tasks run strictly from the
                        earliest deadline time at the top to the latest at the
                        bottom. They used to be bucketed by status, which pushed a
                        10:00 task below an evening one whenever their states
                        differed. The status stays visible on each card. */}
                    {dayTasks.length === 0 ? (
                        <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center bg-white">
                            <span className="text-xs font-bold text-slate-400">
                                {cfg.emptyDayLabel}
                            </span>
                        </div>
                    ) : (
                        dayTasks.map((tk) => (
                            <div key={tk.id} className="flex items-start gap-3">
                                <span className="shrink-0 mt-4 w-[52px] text-right text-[10px] font-black tabular-nums text-indigo-500">
                                    {formatTimeDisplay(
                                        tk.deadlineTime || "23:59",
                                    )}
                                </span>
                                <div className="flex-1 min-w-0">
                                    {cfg.renderDayItem(tk)}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    // One calendar panel: the month or week grid, or the day view once a day is
    // clicked. Every tab renders its calendar through this, so the behaviour is
    // identical wherever a calendar appears.
    const renderCalendarPanel = (cfg: CalendarPanelConfig) =>
        cfg.selectedDay
            ? renderDayView(cfg)
            : cfg.scope === "week"
              ? renderWeekGrid(cfg)
              : renderMonthGrid(cfg);

    // Month/week switch plus the previous/next/today pager. Shared by all three
    // calendars; `compact` keeps the in-panel copies a touch smaller than the one
    // in the page header.
    const renderCalendarNav = (cfg: {
        anchor: Date;
        onAnchorChange: (next: Date) => void;
        scope: "month" | "week" | "timeline" | "hide";
        onScopeChange: (scope: "month" | "week" | "timeline" | "hide") => void;
        onSelectDay: (day: Date | null) => void;
        compact?: boolean;
        showTimelineOption?: boolean;
        showHideOption?: boolean;
    }) => {
        const availableScopes = [
            "month",
            "week",
            ...(cfg.showTimelineOption ? ["timeline" as const] : []),
            ...(cfg.showHideOption ? ["hide" as const] : []),
        ] as const;

        const effectiveScopeForStep: "month" | "week" =
            cfg.scope === "week" ? "week" : "month";

        return (
            <div className="flex items-center gap-2 flex-wrap">
                {/* Scope switcher */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-sm gap-1 max-w-full overflow-x-auto">
                    {availableScopes.map((scope) => (
                        <button
                            key={scope}
                            onClick={() => {
                                cfg.onScopeChange(scope);
                                cfg.onSelectDay(null);
                            }}
                            className={`px-2.5 sm:px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                                cfg.scope === scope
                                    ? "bg-white text-indigo-600 shadow-sm border border-slate-200/50"
                                    : "text-slate-500 hover:bg-slate-200/80 hover:text-slate-700"
                            }`}
                        >
                            {scope === "month"
                                ? t("Month", "Mesiac", "Hónap")
                                : scope === "week"
                                  ? t("Week", "Týždeň", "Hét")
                                  : scope === "timeline"
                                    ? t("Timeline", "Časová os", "Idővonal")
                                    : t("Hide", "Skryť", "Elrejtés")}
                        </button>
                    ))}
                </div>

                {cfg.scope !== "hide" && cfg.scope !== "timeline" && (
                    <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                        <button
                            onClick={() =>
                                cfg.onAnchorChange(
                                    stepAnchor(cfg.anchor, effectiveScopeForStep, -1),
                                )
                            }
                            title={
                                cfg.scope === "week"
                                    ? t(
                                          "Previous week",
                                          "Predchádzajúci týždeň",
                                          "Előző hét",
                                      )
                                    : t(
                                          "Previous month",
                                          "Predchádzajúci mesiac",
                                          "Előző hónap",
                                      )
                            }
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 cursor-pointer transition-colors active:scale-95"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                            onClick={() => cfg.onAnchorChange(new Date())}
                            title={t(
                                "Jump to today",
                                "Prejsť na dnešok",
                                "Ugrás a mai napra",
                            )}
                            className={`px-4 font-black text-indigo-950 text-center tracking-wider uppercase hover:text-indigo-600 cursor-pointer transition-colors ${
                                cfg.compact
                                    ? "text-[11px] min-w-[130px]"
                                    : "text-sm min-w-[160px]"
                            }`}
                        >
                            {cfg.scope === "week"
                                ? weekRangeLabelOf(cfg.anchor)
                                : `${monthNames[cfg.anchor.getMonth()]} ${cfg.anchor.getFullYear()}`}
                        </button>
                        <button
                            onClick={() =>
                                cfg.onAnchorChange(
                                    stepAnchor(cfg.anchor, effectiveScopeForStep, 1),
                                )
                            }
                            title={
                                cfg.scope === "week"
                                    ? t(
                                          "Next week",
                                          "Nasledujúci týždeň",
                                          "Következő hét",
                                      )
                                    : t(
                                          "Next month",
                                          "Nasledujúci mesiac",
                                          "Következő hónap",
                                      )
                            }
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 cursor-pointer transition-colors active:scale-95"
                        >
                            <ChevronRight className="h-5 w-5" />
                        </button>
                    </div>
                )}
            </div>
        );
    };

    const isTaskOverdue = (task: Task) => isTaskOverdueShared(task, taskStates, nowLocalStamp());

    const tomorrowStr = toLocalDateStr(new Date(today.getTime() + 86400000));
    // All personal and delegated tasks are grouped together in the same time divisions:
    const overdueTasks = myTasks.filter((t) => isTaskOverdue(t)).sort(byDeadline);
    const todayTasks = myTasks
        .filter(
            (t) =>
                t.deadline === todayStr &&
                !isTaskOverdue(t) &&
                !isDoneState(t.status),
        )
        .sort(byDeadlineTime);
    const tomorrowTasks = myTasks
        .filter((t) => t.deadline === tomorrowStr && !isDoneState(t.status))
        .sort(byDeadlineTime);
    const futureTasks = myTasks
        .filter((t) => t.deadline > tomorrowStr && !isDoneState(t.status))
        .sort(byDeadline);

    // The lead a task is linked to, as a link straight to that lead's detail —
    // so a task on the calendar can be followed to its client without leaving
    // for the pipeline and searching. A lead that no longer exists stays a
    // plain, unclickable badge.
    const renderLeadBadge = (task: Task, maxWidth: string) => {
        if (!task.relatedLeadId) return null;
        const lead = leads.find((l) => String(l.id) === String(task.relatedLeadId));
        if (!lead) {
            return (
                <span className={`text-[9px] font-bold text-slate-500 flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded-md truncate ${maxWidth}`}>
                    <Briefcase className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">Lead</span>
                </span>
            );
        }
        return (
            <a
                href={`#lead-${encodeURIComponent(lead.id)}`}
                onClick={(e) => e.stopPropagation()}
                data-testid="task-lead-link"
                title={t("Open lead", "Otvoriť lead", "Lead megnyitása")}
                className={`group/lead text-[9px] font-bold text-slate-600 flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded-md ${maxWidth} hover:bg-indigo-100 hover:text-indigo-700 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 transition-all cursor-pointer`}
            >
                <Briefcase className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{lead.name || "Lead"}</span>
                <ArrowUpRight className="h-2.5 w-2.5 shrink-0 transition-transform group-hover/lead:translate-x-px group-hover/lead:-translate-y-px" />
            </a>
        );
    };

    const renderPriorityIcon = (priority: Task["priority"], className: string = "h-3.5 w-3.5") => {
        if (priority === "high") {
            return (
                <span
                    title={`${t("Priority", "Priorita", "Prioritás")}: ${priorityLabel("high")}`}
                    className="shrink-0 flex items-center text-rose-500"
                >
                    <Flame className={`${className} fill-rose-500/20`} />
                </span>
            );
        }
        if (priority === "medium") {
            return (
                <span
                    title={`${t("Priority", "Priorita", "Prioritás")}: ${priorityLabel("medium")}`}
                    className="shrink-0 flex items-center text-amber-500"
                >
                    <ArrowUpDown className={`${className} stroke-[2.5]`} />
                </span>
            );
        }
        return (
            <span
                title={`${t("Priority", "Priorita", "Prioritás")}: ${priorityLabel("low")}`}
                className="shrink-0 flex items-center text-slate-400"
            >
                <Minus className={`${className} stroke-[3]`} />
            </span>
        );
    };

    const renderTaskCard = (task: Task) => {
        const isSelected = selectedTaskIds.has(task.id);

        return (
            <div
                key={task.id}
                className={`group px-3.5 py-2.5 transition-colors border-b border-slate-100 last:border-b-0 flex items-start justify-between gap-3 text-xs ${
                    isSelected
                        ? "bg-indigo-50/70"
                        : "bg-white hover:bg-slate-50/90"
                } relative`}
            >
                {task.isLocking && (
                    <div className="absolute top-0 right-0 w-1 h-full bg-rose-500" />
                )}

                {/* Left checkbox */}
                <div className="pt-0.5 shrink-0">
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                            e.stopPropagation();
                            handleToggleSelect(task.id);
                        }}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600 shrink-0 block"
                        aria-label={`Select ${task.title}`}
                    />
                </div>

                {/* Main 2-line task body */}
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                    {/* Line 1: Status dropdown + Priority Icon + Task Name */}
                    <div className="flex items-center gap-2 min-w-0">
                        <div
                            className="w-[96px] shrink-0"
                            style={
                                {
                                    "--task-status-bg": `${taskStateColors[task.status] || "#64748b"}15`,
                                    "--task-status-color": taskStateColors[task.status] || "#64748b",
                                    "--task-status-border": `${taskStateColors[task.status] || "#64748b"}35`,
                                } as React.CSSProperties
                            }
                        >
                            <CustomSelect
                                value={task.status}
                                disabled={!mayEditTask(task)}
                                size="sm"
                                onChange={(newStatus) => {
                                    const now = new Date();
                                    const completedAtStr = isDoneState(newStatus)
                                        ? toLocalDateStr(now) +
                                          " " +
                                          now.toTimeString().split(" ")[0].substring(0, 5)
                                        : undefined;
                                    const completedByName = isDoneState(newStatus)
                                        ? currentUser?.name || defaultUserName
                                        : undefined;

                                    setTasks((prev) =>
                                        prev.map((t) =>
                                            t.id === task.id
                                                ? {
                                                      ...t,
                                                      status: newStatus,
                                                      completedBy: completedByName,
                                                      completedAt: completedAtStr,
                                                  }
                                                : t,
                                        ),
                                    );
                                }}
                                className="!bg-[var(--task-status-bg)] !text-[var(--task-status-color)] !border-[var(--task-status-border)] !text-[10px] !py-0.5 !px-2 font-black uppercase tracking-wider truncate"
                                options={taskStates.map((st) => ({ value: st, label: stateLabel(st) }))}
                            />
                        </div>

                        {renderPriorityIcon(task.priority, "h-3.5 w-3.5 shrink-0")}

                        <span
                            onClick={() => setEditingTask(task)}
                            className="font-bold text-slate-800 truncate cursor-pointer hover:text-indigo-600 transition-colors"
                            title={task.title}
                        >
                            {task.title}
                        </span>
                    </div>

                    {/* Line 2: Everything else (delegated badge, lead/client, project, due date/time, assignee) */}
                    <div className="flex items-center gap-2 flex-wrap min-w-0 text-[10px]">
                        {isDelegatedByMe(task) && (
                            <span
                                title={t(
                                    "You created this task for someone else. It stays on your calendar so you can follow it up.",
                                    "Túto úlohu ste vytvorili pre niekoho iného. Vo vašom kalendári zostáva, aby ste ju mohli sledovať.",
                                    "Ezt a feladatot másnak hozta létre. A naptárában marad, hogy nyomon követhesse.",
                                )}
                                className="font-black uppercase px-1.5 py-0.5 rounded border bg-violet-50 text-violet-600 border-violet-200 cursor-help shrink-0"
                            >
                                {t("Delegated", "Delegované", "Delegálva")}
                                {task.assignedUsers?.[0]
                                    ? ` · ${task.assignedUsers[0]}`
                                    : ""}
                            </span>
                        )}

                        {renderLeadBadge(task, "max-w-[140px]")}

                        {projectNameFor(task) && (
                            <span className="font-bold text-purple-700 flex items-center gap-1 bg-purple-50 px-1.5 py-0.5 rounded-md truncate max-w-[140px] shrink-0 border border-purple-100">
                                <FolderKanban className="h-2.5 w-2.5 shrink-0 text-purple-500" />
                                <span className="truncate">{projectNameFor(task)}</span>
                            </span>
                        )}

                        <span className="inline-flex items-center gap-1 bg-indigo-50/80 px-2 py-0.5 rounded-md border border-indigo-100/70 text-indigo-700 font-bold tabular-nums">
                            <Clock className="h-2.5 w-2.5 shrink-0 text-indigo-500" />
                            <span>
                                {formatTaskDate(task.deadline)} ·{" "}
                                {formatTimeDisplay(task.deadlineTime || "23:59")}
                            </span>
                        </span>

                        {task.assignedUsers && task.assignedUsers.length > 0 && (
                            <span className="font-bold text-slate-600 flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded-md truncate max-w-[120px] border border-slate-200">
                                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
                                <span className="truncate">
                                    {task.assignedUsers.join(", ")}
                                </span>
                            </span>
                        )}

                        {task.description && (
                            <span className="text-slate-400 font-medium truncate max-w-[180px]" title={task.description}>
                                {task.description}
                            </span>
                        )}
                    </div>
                </div>

                {/* Right side quick action buttons */}
                <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleArchiveTask(task);
                        }}
                        className="p-1 hover:bg-slate-100 active:scale-95 rounded-md text-slate-400 hover:text-slate-600 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-35"
                        disabled={!mayArchiveTask(task)}
                        title={
                            mayArchiveTask(task)
                                ? t(
                                      "Archive Task",
                                      "Archivovať úlohu",
                                      "Feladat archiválása",
                                  )
                                : archiveDeniedHint()
                        }
                    >
                        <ArchiveIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setEditingTask(task);
                        }}
                        className="p-1 hover:bg-slate-100 active:scale-95 rounded-md text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                        title={
                            mayEditTask(task)
                                ? t(
                                      "Edit Task",
                                      "Upraviť úlohu",
                                      "Feladat szerkesztése",
                                  )
                                : t(
                                      "View Task",
                                      "Zobraziť úlohu",
                                      "Feladat megtekintése",
                                  )
                        }
                    >
                        {mayEditTask(task) ? (
                            <Settings className="h-3.5 w-3.5" />
                        ) : (
                            <Eye className="h-3.5 w-3.5" />
                        )}
                    </button>
                </div>
            </div>
        );
    };

    // One row of the completed-task archive. Shared by the grouped archive
    // list and the archive calendar's day view, so a completed task reads the
    // same either way.
    const renderArchivedTaskRow = (task: Task) => {
        const overdueDays =
            calculateOverdueDays(
                task.deadline,
                task.completedAt,
                task.deadlineTime,
            );
        const isOverdue =
            overdueDays !== null &&
            overdueDays > 0;
        const isSelected = selectedTaskIds.has(task.id);
        return (
            <div
                key={task.id}
                className={`p-2.5 rounded-xl border ${
                    isSelected
                        ? "bg-indigo-50/50 ring-1 ring-indigo-300/80 border-indigo-300"
                        : "bg-white border-slate-200 hover:border-slate-300"
                } transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-sm hover:shadow`}
            >
                <div className="flex-1 min-w-0 flex items-center gap-3">
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                            e.stopPropagation();
                            handleToggleSelect(task.id);
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600 shrink-0"
                        aria-label={`Select ${task.title}`}
                    />
                    {/* Priority indicator: distinct icon per level */}
                    {renderPriorityIcon(task.priority, "h-3.5 w-3.5")}

                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-slate-800 truncate">
                                {
                                    task.title
                                }
                            </span>
                            {renderLeadBadge(task, "max-w-[140px]")}
                            {projectNameFor(task) && (
                                <span className="text-[9px] font-bold text-purple-700 flex items-center gap-0.5 bg-purple-50 px-1.5 py-0.5 rounded-md truncate max-w-[140px]">
                                    <FolderKanban className="h-2.5 w-2.5 shrink-0" />
                                    <span className="truncate">{projectNameFor(task)}</span>
                                </span>
                            )}
                        </div>
                        {task.description && (
                            <p className="text-[10px] font-semibold text-slate-500 truncate mt-0.5">
                                {
                                    task.description
                                }
                            </p>
                        )}
                    </div>
                </div>

                {/* Log details and actions */}
                <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-end">
                    <div className="text-right space-y-0.5">
                        <div className="text-[10px] font-bold text-slate-600">
                            <span
                                className={`font-extrabold ${isEstimatedCompleter(task) ? "text-slate-500 italic" : "text-slate-800"}`}
                                title={
                                    isEstimatedCompleter(
                                        task,
                                    )
                                        ? estimatedCompleterHint
                                        : undefined
                                }
                            >
                                {task.completedBy ||
                                    unknownCompletedBy}
                            </span>
                            <span className="text-slate-400 font-bold ml-1">
                                @{" "}
                                {task.completedAt
                                    ? `${formatTaskDate(task.completedAt.slice(0, 10))} ${task.completedAt.slice(11, 16)}`
                                    : `${formatTaskDate(task.deadline)} @ ${task.deadlineTime || "23:59"}`}
                            </span>
                        </div>
                        <div>
                            {isOverdue ? (
                                <span className="px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-[8px] font-black text-rose-600 uppercase tracking-wide">
                                    ⚠️{" "}
                                    {t(
                                        `Overdue by ${overdueDays}d`,
                                        `Zmeškané o ${overdueDays}d`,
                                        `${overdueDays}d késés`,
                                    )}
                                </span>
                            ) : (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[8px] font-black text-emerald-600 uppercase tracking-wide">
                                    ✓{" "}
                                    {t(
                                        "On time",
                                        "Načas",
                                        "Időben",
                                    )}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            onClick={() =>
                                handleRestoreTask(
                                    task,
                                )
                            }
                            disabled={!mayEditTask(task)}
                            title={
                                mayEditTask(task) ? undefined : readOnlyHint()
                            }
                            className="px-2.5 py-1.5 border border-indigo-200 hover:bg-indigo-50 text-indigo-600 rounded-lg font-black text-[9px] uppercase tracking-wider shadow-sm transition-all active:scale-95 flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100"
                        >
                            <RotateCcw className="h-3 w-3 stroke-[2.5]" />
                            {t(
                                "Restore",
                                "Obnoviť",
                                "Visszaállítás",
                            )}
                        </button>
                        {mayDeleteTask(task) && (
                            <button
                                onClick={() =>
                                    handleDeleteTask(
                                        task,
                                    )
                                }
                                title={t(
                                    "Delete permanently",
                                    "Natrvalo odstrániť",
                                    "Végleges törlés",
                                )}
                                className="px-2 py-1.5 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-lg font-black text-[9px] uppercase tracking-wider shadow-sm transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                            >
                                <Trash2 className="h-3 w-3 stroke-[2.5]" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // One time bucket of the left-hand task panel (Overdue / Today / Tomorrow /
    // Upcoming). Shared by My Calendar and Global Tasks so both panels look and
    // behave the same. Pass `expanded` to make the bucket collapsible; leave it
    // undefined for the ones that are always open.
    const renderTaskBucket = (opts: {
        tone: keyof typeof BUCKET_TONES;
        icon: React.ReactNode;
        title: string;
        tasks: Task[];
        emptyLabel: string;
        expanded?: boolean;
        onToggle?: () => void;
    }) => {
        const tone = BUCKET_TONES[opts.tone];
        const collapsible = typeof opts.expanded === "boolean";
        const isOpen = !collapsible || opts.expanded === true;
        const heading = (
            <h3
                className={`text-xs font-black uppercase tracking-widest flex items-center gap-2 select-none ${tone.title}`}
            >
                {opts.icon} {opts.title} ({opts.tasks.length})
            </h3>
        );

        return (
            <div className="border-b border-slate-200 last:border-b-0">
                {collapsible ? (
                    <button
                        onClick={opts.onToggle}
                        className={`w-full px-4 py-2.5 flex items-center justify-between text-left focus:outline-none cursor-pointer transition-colors ${tone.headerBg}`}
                    >
                        {heading}
                        <span className={`transition-colors ${tone.chevron}`}>
                            {isOpen ? (
                                <ChevronUp className="h-4 w-4" />
                            ) : (
                                <ChevronDown className="h-4 w-4" />
                            )}
                        </span>
                    </button>
                ) : (
                    <div className={`w-full px-4 py-2.5 flex items-center justify-between text-left ${tone.headerBg}`}>
                        {heading}
                    </div>
                )}
                {isOpen && (
                    <div className={collapsible ? "animate-in fade-in slide-in-from-top-1 duration-150" : ""}>
                        {opts.tasks.length === 0 ? (
                            <div className="px-4 py-2.5 bg-slate-50/40 text-center">
                                <span className="text-[11px] font-semibold text-slate-400 italic">
                                    {opts.emptyLabel}
                                </span>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100 bg-white">
                                {opts.tasks.map(renderTaskCard)}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const renderGlobalTasksView = () => {
        // Team-wide by default; a role whose `tasks.view_all` is revoked keeps the
        // old single-column board of its own work (see resolveTaskViewAll).
        const columnUsers = !canSeeAllTasks
            ? [myName]
            : isSingleUserView
              ? [globalUserFilter]
              : allUsersList;

        const filteredTasks = filteredGlobalTasks;

        // Same separation as My Calendar, with Tomorrow folded into Upcoming:
        // the team board answers "what is late / due now / still coming",
        // and a dedicated Tomorrow bucket only splits that last group in two.
        const globalOverdue = filteredTasks
            .filter((task) => isTaskOverdue(task))
            .sort(byDeadline);
        const globalToday = filteredTasks
            .filter(
                (task) =>
                    task.deadline === todayStr && !isTaskOverdue(task),
            )
            .sort(byDeadlineTime);
        const globalUpcoming = filteredTasks
            .filter((task) => task.deadline > todayStr)
            .sort(byDeadline);

        // Who a card collects. On the team-wide board that is the assignee, so a
        // task hangs under whoever has to do it. On the restricted board there is
        // only your own card, and it has to hold everything the buckets on the
        // left hold — including a task you opened for somebody else, which is on
        // your dashboard but assigned to them, and would otherwise be listed on
        // the left with no row on the right.
        const tasksForMember = (userName: string) =>
            filteredTasks
                .filter((task) =>
                    canSeeAllTasks
                        ? Boolean(task.assignedUsers?.includes(userName))
                        : isOnPersonalDashboard(task, userName),
                )
                .sort(byDeadline);

        const memberColor = (userName: string) =>
            users.find((u) => u.name === userName)?.color || "#6366f1";

        // Header of one stacked member card. Rendered on its own for members with
        // no active tasks (a single compact line instead of an empty card body).
        const renderMemberHeading = (userName: string) => (
            <span className="flex items-center gap-2 min-w-0">
                <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: memberColor(userName) }}
                />
                <span className="font-extrabold text-slate-800 text-xs uppercase tracking-wider truncate">
                    {userName}
                </span>
                {userName === myName && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-[9px] font-black uppercase tracking-wider text-indigo-600">
                        {t("You", "Vy", "Ön")}
                    </span>
                )}
            </span>
        );

        const renderMemberCard = (userName: string) => {
            const memberTasks = tasksForMember(userName);

            // Nobody to show work for — keep it to one quiet line so a large
            // team does not push the members who do have tasks off the screen.
            if (memberTasks.length === 0) {
                return (
                    <div
                        key={userName}
                        className="shrink-0 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/50 px-4 py-2.5"
                    >
                        {renderMemberHeading(userName)}
                        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-slate-400">
                            {t(
                                "No active tasks",
                                "Žiadne aktívne úlohy",
                                "Nincs aktív feladat",
                            )}
                        </span>
                    </div>
                );
            }

            const lateCount = memberTasks.filter((task) =>
                isTaskOverdue(task),
            ).length;
            const isOpen = !collapsedMembers.has(userName);

            return (
                // shrink-0 is defensive. `overflow-hidden` drops a flex item's
                // automatic minimum size to zero, which by the spec lets these cards
                // shrink to fit the scrolling column rather than overflow it. Chrome
                // keeps them at their content height either way (measured), so this
                // pins the behaviour rather than fixing a live bug.
                <div
                    key={userName}
                    className="shrink-0 rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden transition-all"
                >
                    <button
                        onClick={() => toggleMemberCard(userName)}
                        className="w-full flex items-center justify-between gap-3 bg-slate-100/60 hover:bg-slate-100 px-4 py-3 text-left transition-colors cursor-pointer group/member"
                    >
                        {renderMemberHeading(userName)}
                        <span className="flex items-center gap-2 shrink-0">
                            {lateCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-[9px] font-black uppercase tracking-wider text-rose-600">
                                    {lateCount}{" "}
                                    {t("late", "po termíne", "késés")}
                                </span>
                            )}
                            <span className="px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-[10px] font-black text-slate-500 shadow-sm">
                                {memberTasks.length}
                            </span>
                            <span className="text-slate-400 group-hover/member:text-slate-600 transition-colors">
                                {isOpen ? (
                                    <ChevronUp className="h-4 w-4" />
                                ) : (
                                    <ChevronDown className="h-4 w-4" />
                                )}
                            </span>
                        </span>
                    </button>
                    {isOpen && (
                        <div className="p-4 space-y-3 animate-in fade-in duration-200">
                            {memberTasks.map(renderTaskCard)}
                        </div>
                    )}
                </div>
            );
        };

        // The right-hand calendar draws the very same filtered tasks the
        // workload cards draw, so switching the view never changes what is on the
        // board — only how it is laid out.
        const isGlobalCalendar = globalRightView === "calendar";
        const globalTasksForDate = (dateStr: string) =>
            filteredTasks
                .filter((task) => task.deadline === dateStr)
                .sort(byDeadlineTime);

        const unassignedTasks = canSeeAllTasks
            ? filteredTasks
                  .filter(
                      (task) =>
                          !task.assignedUsers ||
                          task.assignedUsers.length === 0,
                  )
                  .sort(byDeadline)
            : [];

        return (
            <div className="flex-1 min-h-0 flex flex-col gap-6 animate-in fade-in slide-in-from-top-4 duration-300">
                {/* FILTERS */}
                <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                            {t(
                                "Filter Workloads",
                                "Filtrovať vyťaženie",
                                "Munkaterhelés szűrése",
                            )}
                        </span>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap">
                        {/* Priority Filter */}
                        <div className="flex items-center gap-1.5 text-xs font-bold">
                            <span className="text-slate-500">
                                {t("Priority:", "Priorita:", "Prioritás:")}
                            </span>
                            <CustomSelect
                                value={globalPriorityFilter}
                                onChange={(v) => setGlobalPriorityFilter(v)}
                                size="sm"
                                options={[
                                    {
                                        value: "all",
                                        label: t(
                                            "All Priorities",
                                            "Všetky priority",
                                            "Minden prioritás",
                                        ),
                                    },
                                    { value: "high", label: t("High", "Vysoká", "Magas") },
                                    { value: "medium", label: t("Medium", "Stredná", "Közepes") },
                                    { value: "low", label: t("Low", "Nízka", "Alacsony") },
                                ]}
                            />
                        </div>

                        {/* State Filter */}
                        <div className="flex items-center gap-1.5 text-xs font-bold">
                            <span className="text-slate-500">
                                {t("Status:", "Stav:", "Státusz:")}
                            </span>
                            <CustomSelect
                                value={globalStateFilter}
                                onChange={(v) => setGlobalStateFilter(v)}
                                size="sm"
                                options={[
                                    {
                                        value: "all",
                                        label: t(
                                            "All Statuses",
                                            "Všetky stavy",
                                            "Minden státusz",
                                        ),
                                    },
                                    ...taskStates
                                        .filter((st) => !isDoneState(st))
                                        .map((st) => ({ value: st, label: stateLabel(st) })),
                                ]}
                            />
                        </div>

                        {/* Project Manager Filter — only meaningful on the
                            team-wide board; a restricted role already sees
                            nothing but its own work. */}
                        {canSeeAllTasks && (
                            <div className="flex items-center gap-1.5 text-xs font-bold">
                                <span className="text-slate-500">
                                    {t(
                                        "Project Manager:",
                                        "Projektový manažér:",
                                        "Projektmenedzser:",
                                    )}
                                </span>
                                <CustomSelect
                                    value={globalUserFilter}
                                    onChange={(v) => setGlobalUserFilter(v)}
                                    size="sm"
                                    options={[
                                        {
                                            value: "all",
                                            label: t("All", "Všetci", "Mindenki"),
                                        },
                                        ...allUsersList.map((uName) => ({
                                            value: uName,
                                            label: uName,
                                        })),
                                    ]}
                                />
                            </div>
                        )}

                        {/* Date Filter (item 9) */}
                        <div className="flex items-center gap-1.5 text-xs font-bold">
                            <span className="text-slate-500">
                                {t("Date:", "Dátum:", "Dátum:")}
                            </span>
                            <DateRangeCalendarFilter
                                start={globalDateStart}
                                end={globalDateEnd}
                                onChange={(s, e) => {
                                    setGlobalDateStart(s);
                                    setGlobalDateEnd(e);
                                }}
                                systemLanguage={systemLanguage}
                                t={t}
                            />
                        </div>

                        {/* Select All Visible */}
                        <button
                            type="button"
                            onClick={handleSelectAllVisible}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 text-xs font-extrabold cursor-pointer transition-all ${
                                areAllVisibleSelected
                                    ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                    : "bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-400"
                            }`}
                            title={t("Select all visible tasks", "Vybrať všetky zobrazené úlohy", "Összes látható feladat kijelölése")}
                        >
                            <CheckSquare className="h-3.5 w-3.5 stroke-[2.5]" />
                            <span>
                                {areAllVisibleSelected
                                    ? t("Deselect all", "Zrušiť výber", "Kijelölés törlése")
                                    : t("Select all", "Vybrať všetky", "Összes kijelölése")}
                            </span>
                        </button>
                    </div>
                </div>

                {/* SPLIT VIEW — the same time buckets as My Calendar on the
                    left, the team's workload stacked one member per row on the
                    right. Below lg the two stack into a single column. */}
                <div className="flex-1 min-h-0 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
                    {/* LEFT: MISSED / TODAY / UPCOMING */}
                    <div className="flex flex-col min-w-0 min-h-0 h-auto overflow-visible lg:h-full lg:overflow-y-auto lg:pr-2 pb-2 lg:pb-0">
                        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col">
                            {renderTaskBucket({
                                tone: "rose",
                                icon: <AlertCircle className="h-4 w-4" />,
                                title: t("Missed", "Zmeškané", "Lejárt"),
                                tasks: globalOverdue,
                                emptyLabel: t(
                                    "No missed tasks!",
                                    "Žiadne zmeškané úlohy!",
                                    "Nincs lemaradás!",
                                ),
                            })}
                            {renderTaskBucket({
                                tone: "indigo",
                                icon: <CheckSquare className="h-4 w-4" />,
                                title: t("Today", "Dnes", "Ma"),
                                tasks: globalToday,
                                emptyLabel: t(
                                    "Nothing due today.",
                                    "Dnes nie je nič v termíne.",
                                    "Ma nincs esedékes feladat.",
                                ),
                            })}
                            {renderTaskBucket({
                                tone: "slate",
                                icon: <CalendarIcon className="h-4 w-4" />,
                                title: t("Upcoming", "Nadchádzajúce", "Közelgő"),
                                tasks: globalUpcoming,
                                emptyLabel: t(
                                    "No upcoming tasks.",
                                    "Žiadne nadchádzajúce úlohy.",
                                    "Nincsenek közelgő feladatok.",
                                ),
                                expanded: isGlobalUpcomingExpanded,
                                onToggle: () =>
                                    setIsGlobalUpcomingExpanded((open) => !open),
                            })}
                        </div>
                    </div>

                    {/* RIGHT: THE TEAM WORKLOAD STACKED ONE MEMBER PER ROW,
                        OR THE SAME TASKS ON A CALENDAR. The switch only changes
                        how the right half is drawn — both halves still describe
                        exactly the tasks the filter bar selected. */}
                    <div
                        className={`flex flex-col min-w-0 min-h-0 h-auto space-y-4 overflow-visible lg:h-full lg:pr-2 pb-2 lg:pb-0 ${
                            isGlobalCalendar ? "" : "lg:overflow-y-auto"
                        }`}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
                            <h3 className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-2 select-none">
                                {isGlobalCalendar ? (
                                    <CalendarIcon className="h-5 w-5" />
                                ) : (
                                    <Users className="h-5 w-5" />
                                )}
                                {!canSeeAllTasks
                                    ? t(
                                          "Your workload",
                                          "Vaše vyťaženie",
                                          "Az Ön munkaterhelése",
                                      )
                                    : isSingleUserView
                                      ? t(
                                            "Selected workload",
                                            "Vyťaženie vybraného manažéra",
                                            "A kiválasztott munkaterhelése",
                                        )
                                      : t(
                                            "Team workload",
                                            "Vyťaženie tímu",
                                            "Csapat munkaterhelése",
                                        )}
                            </h3>
                            <div className="flex items-center gap-3 flex-wrap">
                                {isGlobalCalendar &&
                                    renderCalendarNav({
                                        anchor: globalCalendarDate,
                                        onAnchorChange: setGlobalCalendarDate,
                                        scope: globalCalendarScope,
                                        onScopeChange: setGlobalCalendarScope,
                                        onSelectDay: setGlobalSelectedDay,
                                        compact: true,
                                    })}
                                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-sm gap-1">
                                    {(["workload", "calendar"] as const).map(
                                        (mode) => (
                                            <button
                                                key={mode}
                                                onClick={() => {
                                                    setGlobalRightView(mode);
                                                    setGlobalSelectedDay(null);
                                                }}
                                                className={`px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer ${
                                                    globalRightView === mode
                                                        ? "bg-white text-indigo-600 shadow-sm border border-slate-200/50"
                                                        : "text-slate-500 hover:bg-slate-200/80 hover:text-slate-700"
                                                }`}
                                            >
                                                {mode === "workload"
                                                    ? t(
                                                          "Workload",
                                                          "Vyťaženie",
                                                          "Munkaterhelés",
                                                      )
                                                    : t(
                                                          "Calendar",
                                                          "Kalendár",
                                                          "Naptár",
                                                      )}
                                            </button>
                                        ),
                                    )}
                                </div>
                                <span className="px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-[10px] font-black text-slate-500 shadow-sm">
                                    {filteredTasks.length}
                                </span>
                            </div>
                        </div>

                        {isGlobalCalendar ? (
                            <div className="flex-1 min-h-[520px] lg:min-h-0 flex flex-col bg-white rounded-3xl border border-slate-200 shadow-[0_4px_24px_rgba(0,0,0,0.02)] lg:overflow-hidden overflow-visible">
                                {renderCalendarPanel({
                                    anchor: globalCalendarDate,
                                    scope: globalCalendarScope,
                                    selectedDay: globalSelectedDay,
                                    onSelectDay: setGlobalSelectedDay,
                                    tasksForDate: globalTasksForDate,
                                    renderDayItem: renderTaskCard,
                                    emptyDayLabel: t(
                                        "No tasks scheduled.",
                                        "Žiadne úlohy.",
                                        "Nincsenek feladatok.",
                                    ),
                                    onAddTask: (dateStr) => {
                                        if (!taskAccess.create) return;
                                        resetNewTaskForm(dateStr);
                                        setIsAddDrawerOpen(true);
                                    },
                                })}
                            </div>
                        ) : (
                            <>
                                {columnUsers.map(renderMemberCard)}

                            {/* Unassigned — nobody is on the hook for these, so the
                                row only appears on the team-wide board. */}
                            {unassignedTasks.length > 0 && (
                                <div className="shrink-0 rounded-2xl border border-rose-200/60 bg-rose-50/40 shadow-sm overflow-hidden transition-all">
                                    <button
                                        onClick={() =>
                                            setIsUnassignedCollapsed((c) => !c)
                                        }
                                        className="w-full flex items-center justify-between gap-3 bg-rose-100/40 hover:bg-rose-100/70 px-4 py-3 text-left transition-colors cursor-pointer group/member"
                                    >
                                        <span className="flex items-center gap-2 min-w-0">
                                            <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0" />
                                            <span className="font-extrabold text-rose-800 text-xs uppercase tracking-wider truncate">
                                                {t(
                                                    "Unassigned",
                                                    "Nepriradené",
                                                    "Kijelöletlen",
                                                )}
                                            </span>
                                        </span>
                                        <span className="flex items-center gap-2 shrink-0">
                                            <span className="px-2.5 py-0.5 rounded-full bg-white border border-rose-200/60 text-[10px] font-black text-rose-500 shadow-sm">
                                                {unassignedTasks.length}
                                            </span>
                                            <span className="text-rose-400 group-hover/member:text-rose-600 transition-colors">
                                                {isUnassignedCollapsed ? (
                                                    <ChevronDown className="h-4 w-4" />
                                                ) : (
                                                    <ChevronUp className="h-4 w-4" />
                                                )}
                                            </span>
                                        </span>
                                    </button>
                                    {!isUnassignedCollapsed && (
                                        <div className="p-4 space-y-3 animate-in fade-in duration-200">
                                            {unassignedTasks.map(renderTaskCard)}
                                        </div>
                                    )}
                                </div>
                            )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // The left task list column for My Calendar.
    // If isCentered is true (when calendarScope === "hide"), it expands with max-w-3xl for optimal readability.
    const renderMyTaskListColumn = (isCentered: boolean = false) => (
        <div
            className={`flex flex-col space-y-6 ${
                isCentered
                    ? "w-full max-w-3xl mx-auto p-2"
                    : "lg:h-full lg:overflow-y-auto overflow-visible h-auto pr-2 pb-6 lg:pb-0"
            }`}
        >
            {/* Create New Task Section: Inline card matching column width */}
            {!isAddDrawerOpen ? (
                <button
                    onClick={() => {
                        if (!taskAccess.create) return;
                        resetNewTaskForm();
                        setIsAddDrawerOpen(true);
                    }}
                    className="w-full py-2.5 bg-[#ff5d00] hover:bg-[#e05200] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-orange-500/25 transition-all active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 flex items-center justify-center gap-2 cursor-pointer border-2 border-[#ff701e] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!taskAccess.create}
                >
                    <Plus className="h-4 w-4 stroke-[3]" />
                    {t(
                        "Create New Task",
                        "Vytvoriť novú úlohu",
                        "Új feladat",
                    )}
                </button>
            ) : (
                <div className="w-full bg-white rounded-3xl border-2 border-orange-200/90 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-3 duration-200">
                    <div className="p-4 bg-gradient-to-r from-orange-50/80 via-white to-orange-50/40 border-b border-orange-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-xl bg-[#ff5d00] text-white shadow-sm">
                                <Plus className="h-4 w-4 stroke-[3]" />
                            </span>
                            <div>
                                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                                    {t("Create New Task(s)", "Vytvoriť novú úlohu / úlohy", "Új feladat(ok) létrehozása")}
                                </h3>
                                <p className="text-[10px] font-semibold text-slate-400">
                                    {t("Shift + Enter for new lines / multiple tasks", "Shift + Enter pre nový riadok / viac úloh", "Shift + Enter új sorhoz / több feladathoz")}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={closeAddDrawer}
                            className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <form onSubmit={handleCreateTask} className="p-3.5 space-y-3 text-xs font-bold">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase flex items-center justify-between">
                                <span>{t("Task Title(s)", "Názov úlohy / úloh", "Feladat címe(i)")}</span>
                                <span className="text-[9px] font-normal text-[#ff5d00]">
                                    {t("1 line = 1 task", "1 riadok = 1 úloha", "1 sor = 1 feladat")}
                                </span>
                            </label>
                            <textarea
                                autoFocus
                                required
                                rows={2}
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleCreateTask(e);
                                    }
                                }}
                                placeholder={t(
                                    "Enter task name... (Shift+Enter for next task)",
                                    "Zadajte názov... (Shift+Enter pre ďalšiu úlohu)",
                                    "Adja meg a feladatot... (Shift+Enter új feladathoz)",
                                )}
                                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-[#ff5d00] focus:outline-none transition-colors text-xs font-semibold placeholder:text-slate-400 leading-relaxed resize-y min-h-[50px]"
                            />
                        </div>

                        {/* Row 1: Date, Time & Priority */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase">
                                    {t("Deadline Date", "Termín", "Határidő")}
                                </label>
                                <input
                                    type="date"
                                    required
                                    value={newDeadline}
                                    onChange={(e) => setNewDeadline(e.target.value)}
                                    className="w-full px-2.5 py-1.5 rounded-xl border-2 border-slate-200 focus:border-[#ff5d00] focus:outline-none text-xs h-[34px]"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase">
                                    {t("Deadline Time", "Čas termínu", "Határidő időpontja")}
                                </label>
                                <DeadlineTimePicker
                                    value={newDeadlineTime}
                                    onChange={setNewDeadlineTime}
                                    t={t}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">
                                    {t("Priority", "Priorita", "Prioritás")}
                                </label>
                                <div className="grid grid-cols-3 gap-1 bg-slate-50 p-0.5 rounded-xl border border-slate-200 h-[34px] items-center">
                                    {(["low", "medium", "high"] as const).map((prio) => (
                                        <button
                                            key={prio}
                                            type="button"
                                            onClick={() => setNewPriority(prio)}
                                            className={`py-1 rounded-lg font-black text-[9px] uppercase transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                                newPriority === prio
                                                    ? prio === "high"
                                                        ? "bg-rose-600 text-white shadow-xs"
                                                        : prio === "medium"
                                                          ? "bg-amber-500 text-white shadow-xs"
                                                          : "bg-slate-600 text-white shadow-xs"
                                                    : "bg-white text-slate-500 hover:bg-slate-100"
                                            }`}
                                        >
                                            {renderPriorityIcon(prio, "h-2.5 w-2.5")}
                                            <span className="hidden xl:inline">{priorityLabel(prio)}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Row 2: Assignee, Lead/Client, Project (All on 1 row) */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase">
                                    {t("Assignee", "Priradiť", "Felelős")}
                                </label>
                                <CustomSelect
                                    value={newAssignedUser}
                                    onChange={(v) => setNewAssignedUser(v)}
                                    size="sm"
                                    options={[
                                        {
                                            value: "",
                                            label: t("-- Unassigned --", "-- Nepriradený --", "-- Kijelöletlen --"),
                                        },
                                        ...users.map((u) => ({
                                            value: u.name,
                                            label: `${u.name} (${u.role})`,
                                        })),
                                    ]}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase">
                                    {t("Link to Lead/Client", "Záujemca / Klient", "Ügyfél / Lead")}
                                </label>
                                <ClientSelect
                                    leads={leads}
                                    value={newRelatedLeadId}
                                    onChange={(v) => {
                                        setNewRelatedLeadId(v);
                                        if (!v) setNewIsLocking(false);
                                    }}
                                    showCity={false}
                                    addKind="lead"
                                    noneLabel={t("-- None --", "-- Žiadny --", "-- Nincs --")}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase flex items-center gap-1">
                                    <FolderKanban className="h-3 w-3" />
                                    {t("Project", "Projekt", "Projekt")}
                                </label>
                                <CustomSelect
                                    searchable
                                    value={newRelatedProjectId}
                                    onChange={setNewRelatedProjectId}
                                    size="sm"
                                    options={taskProjectOptions(projects, leads, t)}
                                />
                            </div>
                        </div>

                        {newRelatedLeadId && (
                            <div className="p-2 rounded-xl bg-violet-50/60 border border-violet-100 flex items-center justify-between">
                                <span className="text-[9px] font-black text-violet-700 uppercase flex items-center gap-1">
                                    <Lock className="h-3 w-3" />{" "}
                                    {t("Block Pipeline Stage", "Zablokovať fázu pipeline", "Folyamat szakasz zárolása")}
                                </span>
                                <input
                                    type="checkbox"
                                    checked={newIsLocking}
                                    onChange={(e) => setNewIsLocking(e.target.checked)}
                                    className="h-3.5 w-3.5 cursor-pointer accent-violet-600"
                                />
                            </div>
                        )}

                        <TaskEmailReminderField
                            task={{
                                deadline: newDeadline,
                                deadlineTime: newDeadlineTime,
                                emailReminders: newEmailReminders,
                            }}
                            onChange={setNewEmailReminders}
                            currentUserName={myName}
                            users={users}
                            systemLanguage={systemLanguage}
                            t={t}
                            mailConfigured={mailConfigured}
                        />

                        <div className="flex items-center gap-2 pt-1">
                            <button
                                type="button"
                                onClick={closeAddDrawer}
                                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-xs uppercase tracking-wider transition-colors cursor-pointer"
                            >
                                {t("Cancel", "Zrušiť", "Mégse")}
                            </button>
                            <button
                                type="submit"
                                className="flex-1 py-2 bg-[#ff5d00] hover:bg-[#e05200] text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-orange-500/25 transition-all active:scale-[0.99] cursor-pointer"
                            >
                                {t("Save Task(s)", "Uložiť úlohu(y)", "Mentés")}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* One unified card for all task sections (including delegated tasks grouped in the same divisions) */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col">
                {/* Overdue / Missed — always visible */}
                {renderTaskBucket({
                    tone: "rose",
                    icon: <AlertCircle className="h-4 w-4" />,
                    title: t("Overdue", "Zmeškané", "Lejárt"),
                    tasks: overdueTasks,
                    emptyLabel: t(
                        "No overdue tasks!",
                        "Žiadne zmeškané úlohy!",
                        "Nincs lemaradás!",
                    ),
                })}

                {/* Today — always visible */}
                {renderTaskBucket({
                    tone: "indigo",
                    icon: <CheckSquare className="h-4 w-4" />,
                    title: t("Today", "Dnes", "Ma"),
                    tasks: todayTasks,
                    emptyLabel: t(
                        "All caught up!",
                        "Všetko hotové!",
                        "Minden kész!",
                    ),
                })}

                {/* Tomorrow */}
                {renderTaskBucket({
                    tone: "amber",
                    icon: <CalendarIcon className="h-4 w-4" />,
                    title: t("Tomorrow", "Zajtra", "Holnap"),
                    tasks: tomorrowTasks,
                    emptyLabel: t(
                        "No tasks for tomorrow.",
                        "Žiadne úlohy na zajtra.",
                        "Nincs feladat holnapra.",
                    ),
                    expanded: isTomorrowExpanded,
                    onToggle: () =>
                        setIsTomorrowExpanded(!isTomorrowExpanded),
                })}

                {/* Future */}
                {renderTaskBucket({
                    tone: "slate",
                    icon: <CalendarIcon className="h-4 w-4" />,
                    title: t("Future", "Budúce", "Jövőbeli"),
                    tasks: futureTasks,
                    emptyLabel: t(
                        "No future tasks.",
                        "Žiadne budúce úlohy.",
                        "Nincsenek jövőbeli feladatok.",
                    ),
                    expanded: isFutureExpanded,
                    onToggle: () =>
                        setIsFutureExpanded(!isFutureExpanded),
                })}
            </div>
        </div>
    );

    interface TimelineEvent {
        id: string;
        type: "created" | "completed";
        task: Task;
        dateStr: string;
        timestamp: number;
        timeDisplay: string;
        actor: string;
    }

    const renderTimelineView = () => {
        // Collect audit log events from tasks assigned to me or created by me
        const rawEvents: TimelineEvent[] = [];
        const now = Date.now();

        // Only include tasks which I assigned or I was assigned to
        const relevantTasks = tasks.filter((task) => {
            const createdByMe = isTaskCreatedBy(task, myName);
            const assignedToMe = isTaskAssignedTo(task, myName);
            return createdByMe || assignedToMe;
        });

        relevantTasks.forEach((task) => {
            // 1. Task Created event (strictly past or present, never in future)
            let createdTimestamp: number | null = null;
            const rawCreated = (task as any).createdAt || (task as any).created_at;
            if (rawCreated) {
                const d = new Date(rawCreated);
                if (!isNaN(d.getTime())) createdTimestamp = d.getTime();
            } else if (task.id.startsWith("task-")) {
                const parts = task.id.split("-");
                const ts = Number(parts[1]);
                if (!isNaN(ts) && ts > 1600000000000 && ts <= now) {
                    createdTimestamp = ts;
                }
            }
            if (!createdTimestamp && task.startDate) {
                const d = new Date(task.startDate);
                if (!isNaN(d.getTime()) && d.getTime() <= now) {
                    createdTimestamp = d.getTime();
                }
            }
            if (!createdTimestamp && task.deadline) {
                const d = new Date(task.deadline);
                if (!isNaN(d.getTime()) && d.getTime() <= now) {
                    createdTimestamp = d.getTime();
                }
            }

            if (createdTimestamp && createdTimestamp <= now) {
                const cDate = new Date(createdTimestamp);
                const cDateStr = toLocalDateStr(cDate);
                const hours = String(cDate.getHours()).padStart(2, "0");
                const mins = String(cDate.getMinutes()).padStart(2, "0");
                rawEvents.push({
                    id: `${task.id}-created`,
                    type: "created",
                    task,
                    dateStr: cDateStr,
                    timestamp: createdTimestamp,
                    timeDisplay: `${hours}:${mins}`,
                    actor: task.createdBy || task.owner || unknownCompletedBy,
                });
            }

            // 2. Task Completed event
            if (isDoneState(task.status) && task.completedAt) {
                const compDate = new Date(task.completedAt.replace(" ", "T"));
                const validDate = !isNaN(compDate.getTime()) ? compDate : new Date(task.completedAt);
                if (!isNaN(validDate.getTime()) && validDate.getTime() <= now) {
                    const compDateStr = toLocalDateStr(validDate);
                    const hours = String(validDate.getHours()).padStart(2, "0");
                    const mins = String(validDate.getMinutes()).padStart(2, "0");
                    rawEvents.push({
                        id: `${task.id}-completed`,
                        type: "completed",
                        task,
                        dateStr: compDateStr,
                        timestamp: validDate.getTime(),
                        timeDisplay: `${hours}:${mins}`,
                        actor: task.completedBy || task.owner || myName,
                    });
                }
            }
        });

        // Apply type filter
        const filtered = rawEvents.filter((ev) => {
            if (timelineFilter !== "all" && ev.type !== timelineFilter) return false;
            if (timelineSearch.trim()) {
                const q = timelineSearch.toLowerCase();
                const titleMatch = ev.task.title.toLowerCase().includes(q);
                const descMatch = (ev.task.description || "").toLowerCase().includes(q);
                const creatorMatch = (ev.task.createdBy || "").toLowerCase().includes(q);
                const actorMatch = ev.actor.toLowerCase().includes(q);
                const assignedMatch = (ev.task.assignedUsers || []).some((u) =>
                    u.toLowerCase().includes(q),
                );
                return titleMatch || descMatch || creatorMatch || actorMatch || assignedMatch;
            }
            return true;
        });

        // Sort events by timestamp
        filtered.sort((a, b) =>
            timelineSort === "newest"
                ? b.timestamp - a.timestamp
                : a.timestamp - b.timestamp,
        );

        // Group by dateStr
        const dateGroups: { dateStr: string; events: TimelineEvent[] }[] = [];
        filtered.forEach((ev) => {
            let grp = dateGroups.find((g) => g.dateStr === ev.dateStr);
            if (!grp) {
                grp = { dateStr: ev.dateStr, events: [] };
                dateGroups.push(grp);
            }
            grp.events.push(ev);
        });

        const formatDateHeading = (dStr: string) => {
            if (dStr === todayStr) {
                return `${t("Today", "Dnes", "Ma")} • ${formatTaskDate(dStr)}`;
            }
            if (dStr === yesterdayStr) {
                return `${t("Yesterday", "Včera", "Tegnap")} • ${formatTaskDate(dStr)}`;
            }
            if (dStr === tomorrowStr) {
                return `${t("Tomorrow", "Zajtra", "Holnap")} • ${formatTaskDate(dStr)}`;
            }
            return formatTaskDate(dStr);
        };

        return (
            <div className="flex flex-col h-full bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
                {/* Header & Controls */}
                <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
                                <History className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                                    {t("Task Activity Log", "Záznam aktivity úloh", "Feladat aktivitási napló")}
                                    <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                                        {filtered.length} {t("events", "záznamov", "bejegyzés")}
                                    </span>
                                </h3>
                                <p className="text-[11px] text-slate-400 font-medium">
                                    {t("Audit log of task creations and completions for tasks you assigned or are assigned to", "Záznam vytvorených a dokončených úloh, ktoré ste zadali alebo vám boli pridelené", "A létrehozott és befejezett feladatok naplója, amelyeket Ön adott ki vagy Önre bíztak")}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Filter pills */}
                            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
                                {(
                                    [
                                        { id: "all", label: t("All", "Všetko", "Mind") },
                                        { id: "created", label: t("Created", "Vytvorené", "Létrehozva") },
                                        { id: "completed", label: t("Completed", "Dokončené", "Befejezve") },
                                    ] as const
                                ).map((filter) => (
                                    <button
                                        key={filter.id}
                                        onClick={() => setTimelineFilter(filter.id)}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                            timelineFilter === filter.id
                                                ? "bg-indigo-600 text-white shadow-xs"
                                                : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                                        }`}
                                    >
                                        {filter.label}
                                    </button>
                                ))}
                            </div>

                            {taskAccess.create && (
                                <button
                                    onClick={() => {
                                        resetNewTaskForm();
                                        setIsAddDrawerOpen(true);
                                    }}
                                    className="px-3.5 py-1.5 bg-[#ff5d00] hover:bg-[#e05200] text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-sm shadow-orange-500/25 transition-all active:scale-[0.98] flex items-center gap-1.5 cursor-pointer shrink-0"
                                    title={t("Create New Task", "Vytvoriť novú úlohu", "Új feladat")}
                                >
                                    <Plus className="h-3.5 w-3.5 stroke-[3]" />
                                    <span>{t("New Task", "Nová úloha", "Új feladat")}</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Search & Sort Row */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <input
                                type="text"
                                value={timelineSearch}
                                onChange={(e) => setTimelineSearch(e.target.value)}
                                placeholder={t("Search timeline activity, users...", "Hľadať v záznamoch aktivity, používateľoch...", "Keresés a naplóban, felhasználók között...")}
                                className="w-full pl-8.5 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                            />
                            {timelineSearch && (
                                <button
                                    onClick={() => setTimelineSearch("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </div>

                        <button
                            onClick={() =>
                                setTimelineSort((s) =>
                                    s === "newest" ? "oldest" : "newest",
                                )
                            }
                            title={t("Toggle sort order", "Prepnúť radenie", "Rendezés váltása")}
                            className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-800 flex items-center gap-1.5 shrink-0 shadow-xs transition-all active:scale-95 cursor-pointer"
                        >
                            <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-[11px]">
                                {timelineSort === "newest"
                                    ? t("Newest", "Najnovšie", "Legújabb")
                                    : t("Oldest", "Najstaršie", "Legrégebbi")}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Timeline scroll area */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                    {dateGroups.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                            <History className="h-8 w-8 text-slate-300 mb-2" />
                            <p className="text-xs font-extrabold text-slate-600">
                                {t("No activity events found", "Nenašli sa žiadne záznamy aktivity", "Nem találhatók aktivitási bejegyzések")}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                                {t("Try adjusting your filters or search terms.", "Skúste upraviť filtre alebo hľadaný text.", "Próbálja módosítani a szűrőket vagy a keresési feltételeket.")}
                            </p>
                        </div>
                    ) : (
                        dateGroups.map((group) => (
                            <div key={group.dateStr} className="space-y-3">
                                {/* Date Group Header */}
                                <div className="sticky top-0 z-10 py-1 bg-white/95 backdrop-blur-sm flex items-center gap-2">
                                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg shadow-2xs">
                                        {formatDateHeading(group.dateStr)}
                                    </span>
                                    <div className="flex-1 h-px bg-slate-100" />
                                    <span className="text-[10px] font-bold text-slate-400">
                                        {group.events.length} {t("events", "záznamov", "bejegyzés")}
                                    </span>
                                </div>

                                {/* Events List with vertical track */}
                                <div className="relative pl-6 space-y-3 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                                    {group.events.map((ev) => {
                                        const overdueDays =
                                            ev.type === "completed" && ev.task.completedAt
                                                ? calculateOverdueDays(
                                                      ev.task.deadline,
                                                      ev.task.completedAt,
                                                      ev.task.deadlineTime,
                                                  )
                                                : null;
                                        const isLateCompleted =
                                            overdueDays !== null && overdueDays > 0;

                                        return (
                                            <div
                                                key={ev.id}
                                                className="relative group transition-all"
                                            >
                                                {/* Circle node on vertical track */}
                                                <div
                                                    className={`absolute -left-6 top-3 h-5 w-5 rounded-full border-2 bg-white flex items-center justify-center z-1 transition-transform group-hover:scale-110 shadow-2xs ${
                                                        ev.type === "created"
                                                            ? "border-emerald-500 text-emerald-600"
                                                            : "border-indigo-500 text-indigo-600"
                                                    }`}
                                                >
                                                    {ev.type === "created" ? (
                                                        <PlusCircle className="h-3 w-3 stroke-[2.5]" />
                                                    ) : (
                                                        <CheckCircle2 className="h-3 w-3 stroke-[2.5]" />
                                                    )}
                                                </div>

                                                {/* Card Content */}
                                                <div className="p-3.5 bg-slate-50 hover:bg-white rounded-2xl border border-slate-200/80 hover:border-slate-300 shadow-2xs hover:shadow-sm transition-all flex flex-col gap-2">
                                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            {/* Event Type Badge */}
                                                            <span
                                                                className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1 ${
                                                                    ev.type === "created"
                                                                        ? "bg-emerald-100 text-emerald-700"
                                                                        : "bg-indigo-100 text-indigo-700"
                                                                }`}
                                                            >
                                                                {ev.type === "created"
                                                                    ? t("Created", "Vytvorené", "Létrehozva")
                                                                    : t("Completed", "Dokončené", "Befejezve")}
                                                            </span>

                                                            {/* Event Time */}
                                                            <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                                                                <Clock className="h-2.5 w-2.5 text-slate-400" />
                                                                {ev.timeDisplay}
                                                            </span>

                                                            {/* Late / On-Time status for completed events */}
                                                            {ev.type === "completed" && (
                                                                <span
                                                                    className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                                                        isLateCompleted
                                                                            ? "bg-rose-50 text-rose-600 border border-rose-200/60"
                                                                            : "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                                                                    }`}
                                                                >
                                                                    {isLateCompleted
                                                                        ? `${t("Late", "Omeškané", "Késve")} (+${overdueDays}d)`
                                                                        : t("On Time", "Načas", "Időben")}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Priority dot + Quick edit */}
                                                        <div className="flex items-center gap-2">
                                                            <span
                                                                className={`h-2 w-2 rounded-full shrink-0 ${
                                                                    ev.task.priority === "high"
                                                                        ? "bg-rose-500"
                                                                        : ev.task.priority === "medium"
                                                                          ? "bg-amber-500"
                                                                          : "bg-slate-400"
                                                                }`}
                                                                title={`${t("Priority", "Priorita", "Prioritás")}: ${priorityLabel(ev.task.priority)}`}
                                                            />
                                                            {taskAccess.edit && (
                                                                <button
                                                                    onClick={() => setEditingTask(ev.task)}
                                                                    className="p-1 hover:bg-slate-200/70 rounded-md text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                                                                    title={t("Edit task", "Upraviť úlohu", "Feladat szerkesztése")}
                                                                >
                                                                    <Settings className="h-3 w-3" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Task Title */}
                                                    <div
                                                        onClick={() => {
                                                             if (taskAccess.edit) setEditingTask(ev.task);
                                                        }}
                                                        className={`text-xs font-black text-slate-800 hover:text-indigo-600 transition-colors ${
                                                            taskAccess.edit ? "cursor-pointer" : ""
                                                        } ${isDoneState(ev.task.status) ? "text-slate-600" : ""}`}
                                                    >
                                                        {ev.task.title}
                                                    </div>

                                                    {/* What changed & By Who + Metadata Badges */}
                                                    <div className="flex items-center gap-2 flex-wrap pt-0.5">
                                                        {/* By Who Attribution */}
                                                        {ev.type === "created" ? (
                                                            <>
                                                                <span className="text-[9.5px] font-bold text-slate-700 flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded-md">
                                                                    <Users className="h-2.5 w-2.5 text-slate-400" />
                                                                    <span>{t("By", "Od", "Által")}: <strong className="text-slate-800">{ev.actor}</strong></span>
                                                                </span>
                                                                {ev.task.assignedUsers && ev.task.assignedUsers.length > 0 && (
                                                                    <span className="text-[9.5px] font-bold text-indigo-700 flex items-center gap-1 bg-indigo-50 px-1.5 py-0.5 rounded-md truncate max-w-[150px]">
                                                                        <span className="h-1 w-1 rounded-full bg-indigo-500 shrink-0" />
                                                                        <span className="truncate">{t("Assigned to", "Priradené", "Felelős")}: <strong className="text-indigo-900">{ev.task.assignedUsers.join(", ")}</strong></span>
                                                                    </span>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span className="text-[9.5px] font-bold text-emerald-800 flex items-center gap-1 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded-md">
                                                                <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                                                                <span>{t("Completed by", "Dokončil", "Befejezte")}: <strong className="text-emerald-950">{ev.actor}</strong></span>
                                                            </span>
                                                        )}

                                                        {/* Lead & Project Badges */}
                                                        {renderLeadBadge(ev.task, "max-w-[140px]")}
                                                        {ev.task.relatedProjectId && projectNameFor(ev.task) && (
                                                            <span className="text-[9px] font-bold text-slate-600 flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded-md truncate max-w-[140px]">
                                                                <FolderKanban className="h-2.5 w-2.5 text-slate-500 shrink-0" />
                                                                <span className="truncate">{projectNameFor(ev.task)}</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    // --- FULL CALENDAR MONTH VIEW WITH LEFT SIDEBAR (SPLIT VIEW) ---
    if (!taskAccess.view) {
        return (
            <div className="w-full min-h-[360px] flex items-center justify-center animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
                    <AlertCircle className="mx-auto h-9 w-9 text-slate-400" />
                    <h1 className="mt-4 text-lg font-black text-slate-800">
                        {t("Tasks are not available", "Úlohy nie sú dostupné", "A feladatok nem érhetők el")}
                    </h1>
                    <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
                        {t("Your role does not have permission to view the task board.", "Vaša rola nemá oprávnenie zobraziť nástenku úloh.", "A szerepköre nem jogosult a feladattábla megtekintésére.")}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`w-full ${viewMode === "archive" ? "h-auto shrink-0" : "lg:h-[calc(100vh-8rem)] h-auto flex flex-col"} animate-in fade-in slide-in-from-top-4 duration-300`}
        >
            {/* HEADER */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4 mb-6 shrink-0">
                <div>
                    <h1 className="text-2xl font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                        <CalendarIcon className="h-6 w-6 text-indigo-600" />
                        {viewMode === "calendar"
                            ? t(
                                  "My Tasks",
                                  "Moje úlohy",
                                  "Saját feladatok",
                              )
                            : viewMode === "global"
                              ? t(
                                    "Global Tasks",
                                    "Globálne úlohy",
                                    "Globális feladatok",
                                )
                              : t(
                                  "Task Archive",
                                  "Archív dokončených úloh",
                                  "Feladat archívum",
                              )}
                    </h1>
                    <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mt-1">
                        {viewMode === "calendar"
                            ? t(
                                  "Tasks assigned to you. Team tasks remain available in Global Tasks.",
                                  "Úlohy priradené vám. Tímové úlohy zostávajú v Globálnych úlohách.",
                                  "Az Önhöz rendelt feladatok. A csapat feladatai a Globális feladatokban maradnak.",
                              )
                            : viewMode === "global"
                              ? t(
                                    "Active workload across the whole team.",
                                    "Aktívne pracovné zaťaženie celého tímu.",
                                    "Az egész csapat aktív munkaterhelése.",
                                )
                              : t(
                                  "History of completed tasks, logging details, and timing status.",
                                  "História dokončených úloh s informáciami o dobe omeškania.",
                                  "Befejezett feladatok előzményei és késési státuszai.",
                              )}
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 flex-wrap">
                    <div className="flex items-center bg-slate-100 p-1.5 rounded-xl border border-slate-200 shadow-sm gap-1 self-start sm:self-auto overflow-x-auto max-w-full">
                        <button
                            onClick={() => setViewMode("calendar")}
                            className={`px-3 sm:px-4 py-2 rounded-lg font-black text-xs uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                                viewMode === "calendar"
                                    ? "bg-white text-indigo-600 shadow-sm border border-slate-200/50"
                                    : "text-slate-500 hover:bg-slate-200/80 hover:text-slate-700"
                            }`}
                        >
                            {t("My Tasks", "Moje úlohy", "Saját feladatok")}
                        </button>
                        <button
                            onClick={() => setViewMode("global")}
                            className={`px-3 sm:px-4 py-2 rounded-lg font-black text-xs uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                                viewMode === "global"
                                    ? "bg-white text-indigo-600 shadow-sm border border-slate-200/50"
                                    : "text-slate-500 hover:bg-slate-200/80 hover:text-slate-700"
                            }`}
                        >
                            {t(
                                "Global Tasks",
                                "Globálne úlohy",
                                "Globális feladatok",
                            )}
                        </button>
                        <button
                            onClick={() => setViewMode("archive")}
                            className={`px-3 sm:px-4 py-2 rounded-lg font-black text-xs uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                                viewMode === "archive"
                                    ? "bg-white text-indigo-600 shadow-sm border border-slate-200/50"
                                    : "text-slate-500 hover:bg-slate-200/80 hover:text-slate-700"
                            }`}
                        >
                            {t("Archive", "Archív", "Archívum")}
                        </button>
                    </div>

                    {viewMode === "calendar" &&
                        renderCalendarNav({
                            anchor: currentDate,
                            onAnchorChange: setCurrentDate,
                            scope: calendarScope,
                            onScopeChange: setCalendarScope,
                            onSelectDay: setSelectedDay,
                            showTimelineOption: true,
                            showHideOption: true,
                        })}
                </div>
            </div>

            {viewMode === "archive" ? (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 mb-4 shrink-0">
                        <button
                            onClick={() => setViewMode("calendar")}
                            className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-black text-[10px] uppercase tracking-wider transition-colors cursor-pointer"
                        >
                            <ChevronLeft className="h-4 w-4" />
                            {t(
                                "Back to Calendar",
                                "Späť na kalendár",
                                "Vissza a naptárhoz",
                            )}
                        </button>
                        <div className="flex items-center gap-3 flex-wrap">
                            {/* The archive reads either as the grouped history
                                list or as a calendar of the same completed
                                tasks; the filters above drive both. */}
                            {archiveView === "calendar" &&
                                renderCalendarNav({
                                    anchor: archiveCalendarDate,
                                    onAnchorChange: setArchiveCalendarDate,
                                    scope: archiveCalendarScope,
                                    onScopeChange: setArchiveCalendarScope,
                                    onSelectDay: setArchiveSelectedDay,
                                    compact: true,
                                })}
                            <button
                                type="button"
                                onClick={handleSelectAllVisible}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                                    areAllVisibleSelected
                                        ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                        : "bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-400"
                                }`}
                                title={t("Select all visible tasks", "Vybrať všetky zobrazené úlohy", "Összes látható feladat kijelölése")}
                            >
                                <CheckSquare className="h-3.5 w-3.5 stroke-[2.5]" />
                                <span>
                                    {areAllVisibleSelected
                                        ? t("Deselect all", "Zrušiť výber", "Kijelölés törlése")
                                        : t("Select all", "Vybrať všetky", "Összes kijelölése")}
                                </span>
                            </button>
                            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-sm gap-1">
                                {(["list", "calendar"] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => {
                                            setArchiveView(mode);
                                            setArchiveSelectedDay(null);
                                        }}
                                        className={`px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer ${
                                            archiveView === mode
                                                ? "bg-white text-indigo-600 shadow-sm border border-slate-200/50"
                                                : "text-slate-500 hover:bg-slate-200/80 hover:text-slate-700"
                                        }`}
                                    >
                                        {mode === "list"
                                            ? t("List", "Zoznam", "Lista")
                                            : t(
                                                  "Calendar",
                                                  "Kalendár",
                                                  "Naptár",
                                              )}
                                    </button>
                                ))}
                            </div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full">
                                {t(
                                    "Total Done:",
                                    "Celkovo hotovo:",
                                    "Összesen kész:",
                                )}{" "}
                                {tasks.filter((t) => isDoneState(t.status)).length}
                            </span>
                        </div>
                    </div>

                    {/* FILTER ROW */}
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 pb-4 border-b border-slate-100 mb-4 shrink-0 text-[10px] font-bold">
                        {/* Search */}
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                                {t("Search", "Hľadať", "Keresés")}
                            </label>
                            <input
                                type="text"
                                placeholder={t(
                                    "Filter by title...",
                                    "Filtrovať podľa názvu...",
                                    "Szűrés cím alapján...",
                                )}
                                value={archiveSearchQuery}
                                onChange={(e) =>
                                    setArchiveSearchQuery(e.target.value)
                                }
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none font-bold text-xs"
                            />
                        </div>

                        {/* Priority */}
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                                {t("Priority", "Priorita", "Prioritás")}
                            </label>
                            <CustomSelect
                                value={archivePriorityFilter}
                                onChange={(v) => setArchivePriorityFilter(v)}
                                size="sm"
                                options={[
                                    {
                                        value: "all",
                                        label: t(
                                            "All Priorities",
                                            "Všetky priority",
                                            "Összes prioritás",
                                        ),
                                    },
                                    { value: "high", label: t("High", "Vysoká", "Magas") },
                                    { value: "medium", label: t("Medium", "Stredná", "Közepes") },
                                    { value: "low", label: t("Low", "Nízka", "Alacsony") },
                                ]}
                            />
                        </div>

                        {/* Completed By */}
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                                {t("Completed By", "Dokončil", "Befejezte")}
                            </label>
                            <CustomSelect
                                value={archiveUserFilter}
                                onChange={(v) => setArchiveUserFilter(v)}
                                size="sm"
                                options={[
                                    { value: "all", label: t("All Users", "Všetci", "Mindenki") },
                                    ...completedUsersList.map((uName) => ({
                                        value: uName,
                                        label: uName,
                                    })),
                                ]}
                            />
                        </div>

                        {/* Timing Status */}
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                                {t(
                                    "Timing Status",
                                    "Stav omeškania",
                                    "Késési státusz",
                                )}
                            </label>
                            <CustomSelect
                                value={archiveTimingFilter}
                                onChange={(v) => setArchiveTimingFilter(v)}
                                size="sm"
                                options={[
                                    {
                                        value: "all",
                                        label: t(
                                            "All Statuses",
                                            "Všetky stavy",
                                            "Összes státusz",
                                        ),
                                    },
                                    { value: "on_time", label: t("On Time", "Načas", "Időben") },
                                    { value: "overdue", label: t("Overdue", "Omeškané", "Lejárt") },
                                ]}
                            />
                        </div>

                        {/* Date filter (item 9) */}
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                                {t("Date", "Dátum", "Dátum")}
                            </label>
                            <DateRangeCalendarFilter
                                start={archiveDateStart}
                                end={archiveDateEnd}
                                onChange={(s, e) => {
                                    setArchiveDateStart(s);
                                    setArchiveDateEnd(e);
                                }}
                                systemLanguage={systemLanguage}
                                t={t}
                            />
                        </div>
                    </div>

                    {archiveView === "calendar" ? (
                        <div className="h-[560px] lg:h-[calc(100vh-22rem)] lg:min-h-[520px] flex flex-col rounded-3xl border border-slate-200 overflow-hidden bg-white">
                            {renderCalendarPanel({
                                anchor: archiveCalendarDate,
                                scope: archiveCalendarScope,
                                selectedDay: archiveSelectedDay,
                                onSelectDay: setArchiveSelectedDay,
                                tasksForDate: archivedTasksForDate,
                                renderDayItem: renderArchivedTaskRow,
                                emptyDayLabel: t(
                                    "No tasks completed on this day.",
                                    "V tento deň nebola dokončená žiadna úloha.",
                                    "Ezen a napon nem fejeztek be feladatot.",
                                ),
                            })}
                        </div>
                    ) : (
                        <div className="pr-1">
                            {filteredArchivedTasks.length === 0 ? (
                                <div className="py-20 text-center text-slate-400">
                                    <div className="text-4xl mb-3">🔍</div>
                                    <div className="font-black text-slate-700 uppercase tracking-wider">
                                        {t(
                                            "No matching tasks",
                                            "Žiadne zhodné úlohy",
                                            "Nincsenek egyező feladatok",
                                        )}
                                    </div>
                                    <p className="text-[10px] mt-1.5 uppercase tracking-wide font-extrabold text-slate-400">
                                        {t(
                                            "Try adjusting your filters.",
                                            "Skúste upraviť filtre.",
                                            "Próbálja módosítani a szűrőket.",
                                        )}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {archivedTasksGroupedByDate.map((group) => (
                                        <div key={group.date} className="space-y-2">
                                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1 pt-1 flex items-center gap-1.5 border-l-2 border-indigo-500">
                                                <CalendarIcon className="h-3.5 w-3.5 text-indigo-500" />
                                                {group.date === "no-date"
                                                    ? t(
                                                          "No Due Date",
                                                          "Bez termínu",
                                                          "Nincs határidő",
                                                      )
                                                    : formatTaskDate(group.date)}
                                            </div>
                                            <div className="space-y-2 pl-3">
                                                {group.tasks.map(renderArchivedTaskRow)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Manually archived tasks — hidden from active views independent of status.
                        Team-wide, same as the completed-task archive above. */}
                    {(() => {
                        const archivedList = tasks.filter(
                            (task) => task.archived,
                        );
                        if (archivedList.length === 0) return null;
                        return (
                            <div className="mt-8 pt-6 border-t border-slate-100">
                                <div className="flex items-center gap-2 mb-4">
                                    <ArchiveIcon className="h-4 w-4 text-slate-400" />
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                        {t(
                                            "Archived Tasks",
                                            "Archivované úlohy",
                                            "Archivált feladatok",
                                        )}
                                    </span>
                                    <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                        {archivedList.length}
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {archivedList.map((task) => {
                                        const isSelected = selectedTaskIds.has(task.id);
                                        return (
                                            <div
                                                key={task.id}
                                                className={`p-2.5 rounded-xl border ${
                                                    isSelected
                                                        ? "bg-indigo-50/50 ring-1 ring-indigo-300/80 border-indigo-300"
                                                        : "border-slate-200 bg-slate-50/60"
                                                } flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs`}
                                            >
                                                <div className="flex-1 min-w-0 flex items-center gap-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={(e) => {
                                                            e.stopPropagation();
                                                            handleToggleSelect(task.id);
                                                        }}
                                                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600 shrink-0"
                                                        aria-label={`Select ${task.title}`}
                                                    />
                                                    <span
                                                        className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                                                            task.priority ===
                                                            "high"
                                                                ? "bg-rose-500"
                                                                : task.priority ===
                                                                    "medium"
                                                                  ? "bg-amber-500"
                                                                  : "bg-slate-400"
                                                        }`}
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-extrabold text-slate-700 truncate">
                                                                {task.title}
                                                            </span>
                                                            {task.assignedUsers &&
                                                                task.assignedUsers
                                                                    .length > 0 && (
                                                                    <span className="text-[9px] font-bold text-indigo-600 flex items-center gap-1 bg-indigo-50 px-1.5 py-0.5 rounded-md truncate max-w-[120px]">
                                                                        <span className="h-1 w-1 rounded-full bg-indigo-500 shrink-0" />
                                                                        <span className="truncate">
                                                                            {task.assignedUsers.join(
                                                                                ", ",
                                                                            )}
                                                                        </span>
                                                                    </span>
                                                                )}
                                                        </div>
                                                        <div className="text-[9px] font-bold text-slate-400 mt-0.5">
                                                            {t(
                                                                "Due",
                                                                "Termín",
                                                                "Határidő",
                                                            )}
                                                            : {formatTaskDate(task.deadline)}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <button
                                                        onClick={() =>
                                                            handleUnarchiveTask(
                                                                task,
                                                            )
                                                        }
                                                        disabled={!mayArchiveTask(task)}
                                                        title={
                                                            mayArchiveTask(task)
                                                                ? undefined
                                                                : archiveDeniedHint()
                                                        }
                                                        className="px-2.5 py-1.5 border border-indigo-200 hover:bg-indigo-50 text-indigo-600 rounded-lg font-black text-[9px] uppercase tracking-wider shadow-sm transition-all active:scale-95 flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100"
                                                    >
                                                        <RotateCcw className="h-3 w-3 stroke-[2.5]" />
                                                        {t(
                                                            "Unarchive",
                                                            "Zrušiť archiváciu",
                                                            "Archiválás visszavonása",
                                                        )}
                                                    </button>
                                                    {mayDeleteTask(task) && (
                                                        <button
                                                            onClick={() =>
                                                                handleDeleteTask(task)
                                                            }
                                                            title={t(
                                                                "Delete permanently",
                                                                "Natrvalo odstrániť",
                                                                "Végleges törlés",
                                                            )}
                                                            className="px-2 py-1.5 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-lg font-black text-[9px] uppercase tracking-wider shadow-sm transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                                                        >
                                                            <Trash2 className="h-3 w-3 stroke-[2.5]" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            ) : viewMode === "global" ? (
                renderGlobalTasksView()
            ) : calendarScope === "hide" ? (
                <div className="flex-1 min-h-0 overflow-y-auto">
                    {renderMyTaskListColumn(true)}
                </div>
            ) : (
                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* LEFT COLUMN: TASK LISTS */}
                    {renderMyTaskListColumn(false)}

                    {/* RIGHT COLUMN: CALENDAR OR TIMELINE VIEW */}
                    {calendarScope === "timeline" ? (
                        <div className="flex flex-col lg:h-full h-auto min-h-[560px] lg:min-h-0 lg:overflow-hidden overflow-visible">
                            {renderTimelineView()}
                        </div>
                    ) : (
                        <div className="flex flex-col lg:h-full h-auto bg-white rounded-3xl border border-slate-200 shadow-[0_4px_24px_rgba(0,0,0,0.02)] lg:overflow-hidden overflow-visible">
                            {renderCalendarPanel({
                                anchor: currentDate,
                                scope: calendarScope,
                                selectedDay,
                                onSelectDay: setSelectedDay,
                                tasksForDate: myTasksForDate,
                                renderDayItem: renderTaskCard,
                                emptyDayLabel: t(
                                    "No tasks scheduled.",
                                    "Žiadne úlohy.",
                                    "Nincsenek feladatok.",
                                ),
                                onAddTask: (dateStr) => {
                                    if (!taskAccess.create) return;
                                    resetNewTaskForm(dateStr);
                                    setIsAddDrawerOpen(true);
                                },
                            })}
                        </div>
                    )}
                </div>
            )}

            {editingTask && (
                <TaskEditDrawer
                    key={editingTask.id}
                    task={editingTask}
                    leads={leads}
                    projects={projects}
                    users={users}
                    taskStates={taskStates}
                    systemLanguage={systemLanguage}
                    currentUserName={currentUser?.name || defaultUserName}
                    mailConfigured={mailConfigured}
                    canEdit={mayEditTask(editingTask)}
                    canArchive={mayArchiveTask(editingTask)}
                    onSave={(next) => {
                        if (!mayEditTask(next)) return;
                        setTasks((prev) =>
                            prev.map((tk) => (tk.id === next.id ? next : tk)),
                        );
                    }}
                    onToggleArchive={(next) =>
                        next.archived
                            ? handleUnarchiveTask(next)
                            : handleArchiveTask(next)
                    }
                    onClose={() => setEditingTask(null)}
                />
            )}
            {renderBulkActionToolbar()}
        </div>
    );
};
