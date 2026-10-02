import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpDown, Flame, FolderKanban, Lock, Minus, Plus, X } from "lucide-react";
import type { Lead, Project, Task, UserProfile } from "../types";
import type { Language } from "../utils/translations";
import { CustomSelect } from "./ui/CustomSelect";
import { ClientSelect } from "./ui/ClientSelect";
import { DeadlineTimePicker, taskProjectOptions } from "./TaskEditDrawer";
import { TaskEmailReminderField } from "./TaskEmailReminderField";
import { TaskTagMentionInput } from "./TaskTagMentionInput";
import { extractTagsFromText, type MentionEntity } from "./TaskPillText";
import { projectDisplayName } from "../utils/projects";
import { staleLeadIdsForTasks } from "../utils/taskLeadPicker";
import { isClientRecord } from "../utils/clientRecord";
import { taskPriorityLabel } from "../utils/taskLabels";

// Task deadlines are plain local dates, so never go through toISOString() (UTC).
const toLocalDateStr = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};

const PRIORITY_ICON = {
    high: Flame,
    medium: ArrowUpDown,
    low: Minus,
} as const;

interface QuickTaskModalProps {
    /** Existing tasks, only to offer their tags in the # picker. */
    tasks: Task[];
    leads: Lead[];
    projects?: Project[];
    users: UserProfile[];
    taskStates: string[];
    systemLanguage: Language;
    /** The person creating the task; also the default assignee. */
    currentUserName: string;
    mailConfigured?: boolean;
    leadStageGroups?: Record<string, string>;
    leadStateParents?: Record<string, string>;
    /** Pre-filled deadline (the calendar's "+" on a day); defaults to today. */
    initialDeadline?: string;
    /** Receives the new tasks (one per title line); persisting them is the caller's job. */
    onCreate: (tasks: Task[]) => void;
    onClose: () => void;
    /** Renders in place (under the button that opened it) instead of floating under the header. */
    inline?: boolean;
}

/**
 * Quick task creation. By default a panel that floats under the header, opened
 * by the header button on any page without navigating. With `inline` it renders
 * in place instead, for the Tasks page's own "Create New Task" button.
 */
export const QuickTaskModal: React.FC<QuickTaskModalProps> = ({
    tasks,
    leads,
    projects = [],
    users,
    taskStates,
    systemLanguage,
    currentUserName,
    mailConfigured,
    leadStageGroups,
    leadStateParents,
    initialDeadline,
    onCreate,
    onClose,
    inline = false,
}) => {
    const t = (en: string, sk: string, hu: string) =>
        systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

    const [title, setTitle] = useState("");
    const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
    const [deadline, setDeadline] = useState(() => initialDeadline || toLocalDateStr(new Date()));
    const [deadlineTime, setDeadlineTime] = useState("16:00");
    const [relatedLeadId, setRelatedLeadId] = useState("");
    const [relatedProjectId, setRelatedProjectId] = useState("");
    const [isLocking, setIsLocking] = useState(false);
    const [emailReminders, setEmailReminders] = useState<Task["emailReminders"]>(undefined);
    const [assignedUser, setAssignedUser] = useState(currentUserName || users[0]?.name || "");

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    const existingTags = useMemo(() => {
        const tagSet = new Set<string>();
        tasks.forEach((tk) => {
            (tk.tags || []).forEach((tag) => tagSet.add(tag));
            extractTagsFromText(tk.title || "").forEach((tag) => tagSet.add(tag));
            extractTagsFromText(tk.description || "").forEach((tag) => tagSet.add(tag));
        });
        return Array.from(tagSet).sort();
    }, [tasks]);

    const mentionEntities: MentionEntity[] = useMemo(() => {
        const list: MentionEntity[] = users.map((u) => ({
            id: u.name,
            name: u.name,
            type: "user",
            detail: u.role || "Team member",
        }));
        projects.forEach((p) => {
            list.push({
                id: p.id,
                name: projectDisplayName(p, leads, t("Untitled project", "Projekt bez názvu", "Névtelen projekt")),
                type: "project",
                detail: p.status || "Project",
            });
        });
        leads.forEach((l) => {
            list.push(
                isClientRecord(l)
                    ? { id: l.id, name: l.name, type: "client", detail: l.city || "Client" }
                    : { id: l.id, name: l.name, type: "lead", detail: l.status || "Lead" },
            );
        });
        return list;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [users, projects, leads, systemLanguage]);

    const createTasks = (e: React.SyntheticEvent, closeAfterCreate: boolean) => {
        e.preventDefault();
        const lines = title
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (lines.length === 0) {
            if (typeof (window as any).showToast === "function") {
                (window as any).showToast(
                    t(
                        "Please enter a task title!",
                        "Prosím zadajte názov úlohy!",
                        "Kérjük, adja meg a feladat címét!",
                    ),
                    "warning",
                );
            }
            return;
        }

        const now = Date.now();
        const created: Task[] = lines.map((line, index) => ({
            id: `task-${now}-${index}-${Math.random().toString(36).slice(2, 7)}`,
            title: line,
            description: "",
            tags: extractTagsFromText(line),
            status: taskStates[0] || "New",
            priority,
            deadline,
            deadlineTime,
            owner: assignedUser,
            createdBy: currentUserName,
            assignedUsers: assignedUser ? [assignedUser] : [],
            relatedLeadId: relatedLeadId || undefined,
            relatedProjectId: relatedProjectId || undefined,
            isLocking: relatedLeadId ? isLocking : false,
            emailReminders,
        }));

        onCreate(created);

        if (typeof (window as any).showToast === "function") {
            (window as any).showToast(
                created.length > 1
                    ? t(
                          `${created.length} tasks created successfully!`,
                          `${created.length} úloh bolo úspešne vytvorených!`,
                          `${created.length} feladat sikeresen létrehozva!`,
                      )
                    : t(
                          "Task created successfully!",
                          "Úloha bola úspešne vytvorená!",
                          "Feladat sikeresen létrehozva!",
                      ),
            );
        }

        if (closeAfterCreate) {
            onClose();
        } else {
            // Keep the popup open for the next task: clear the title and refocus.
            setTitle("");
            setTimeout(() => {
                document.querySelector<HTMLTextAreaElement>("[data-quick-task-form] textarea")?.focus();
            }, 50);
        }
    };

    if (!inline && typeof document === "undefined") return null;

    const panel = (
            <div
                {...(inline
                    ? {
                          className:
                              "w-full bg-white rounded-3xl border-2 border-orange-200/90 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-3 duration-200",
                      }
                    : {
                          role: "dialog",
                          "aria-label": t("Create New Task(s)", "Vytvoriť novú úlohu / úlohy", "Új feladat(ok) létrehozása"),
                          className:
                              "fixed top-22.5 right-2 sm:right-4 md:right-6 z-[100000] w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-2xl max-h-[calc(100vh-6.5rem)] overflow-y-auto bg-white rounded-3xl border border-slate-200/80 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200",
                      })}
            >
                <div className="p-4 bg-gradient-to-r from-orange-50/80 via-white to-orange-50/40 border-b border-orange-100 flex items-center justify-between rounded-t-3xl">
                    <div className="flex items-center gap-2">
                        <span className="p-1.5 rounded-xl bg-[#ff5d00] text-white shadow-sm">
                            <Plus className="h-4 w-4 stroke-[3]" />
                        </span>
                        <div>
                            <h3 className="text-ui font-bold text-slate-800">
                                {t("Create New Task(s)", "Vytvoriť novú úlohu / úlohy", "Új feladat(ok) létrehozása")}
                            </h3>
                            <p className="text-micro font-semibold text-slate-400">
                                {t(
                                    "Shift + Enter for new lines / multiple tasks",
                                    "Shift + Enter pre nový riadok / viac úloh",
                                    "Shift + Enter új sorhoz / több feladathoz",
                                )}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t("Close", "Zavrieť", "Bezárás")}
                        className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <form
                    data-quick-task-form
                    onSubmit={(e) => createTasks(e, true)}
                    className="p-4 space-y-3 text-ui font-bold"
                >
                    <div className="space-y-1">
                        <label className="type-overline text-slate-500 flex items-center justify-between">
                            <span>{t("Task Title(s)", "Názov úlohy / úloh", "Feladat címe(i)")}</span>
                            <span className="text-micro font-normal text-[#ff5d00]">
                                {t("1 line = 1 task", "1 riadok = 1 úloha", "1 sor = 1 feladat")}
                            </span>
                        </label>
                        <TaskTagMentionInput
                            multiline
                            rows={2}
                            autoFocus
                            required
                            value={title}
                            onChange={setTitle}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    createTasks(e, true);
                                }
                            }}
                            existingTags={existingTags}
                            mentionEntities={mentionEntities}
                            onAssignEntity={(entity) => {
                                if (entity.type === "user") {
                                    setAssignedUser(entity.name);
                                } else if (entity.type === "project") {
                                    setRelatedProjectId(entity.id);
                                } else if (entity.type === "client" || entity.type === "lead") {
                                    setRelatedLeadId(entity.id);
                                }
                            }}
                            placeholder={t(
                                "Enter task name... (Shift+Enter for next task, # for tags, @ for mentions)",
                                "Zadajte názov... (Shift+Enter pre ďalšiu úlohu, # pre tagy, @ pre zmienky)",
                                "Adja meg a feladatot... (Shift+Enter új feladathoz, # címkékhez, @ hivatkozáshoz)",
                            )}
                            className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-[#ff5d00] focus:outline-none transition-colors text-ui font-semibold placeholder:text-slate-400 leading-relaxed resize-y min-h-12.5"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div className="space-y-1">
                            <label className="type-overline text-slate-500">
                                {t("Deadline Date", "Termín", "Határidő")}
                            </label>
                            <input
                                type="date"
                                required
                                value={deadline}
                                onChange={(e) => setDeadline(e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-xl border-2 border-slate-200 focus:border-[#ff5d00] focus:outline-none text-ui h-8.5"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="type-overline text-slate-500">
                                {t("Deadline Time", "Čas termínu", "Határidő időpontja")}
                            </label>
                            <DeadlineTimePicker value={deadlineTime} onChange={setDeadlineTime} t={t} />
                        </div>
                        <div className="space-y-1">
                            <label className="type-overline text-slate-500">
                                {t("Priority", "Priorita", "Prioritás")}
                            </label>
                            <div className="grid grid-cols-3 gap-1 bg-slate-50 p-0.5 rounded-xl border border-slate-200 h-8.5 items-center">
                                {(["low", "medium", "high"] as const).map((prio) => {
                                    const Icon = PRIORITY_ICON[prio];
                                    return (
                                        <button
                                            key={prio}
                                            type="button"
                                            onClick={() => setPriority(prio)}
                                            title={taskPriorityLabel(prio, t)}
                                            className={`py-1 rounded-lg type-overline transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                                priority === prio
                                                    ? prio === "high"
                                                        ? "bg-rose-600 text-white shadow-xs"
                                                        : prio === "medium"
                                                          ? "bg-amber-500 text-white shadow-xs"
                                                          : "bg-slate-600 text-white shadow-xs"
                                                    : "bg-white text-slate-500 hover:bg-slate-100"
                                            }`}
                                        >
                                            <Icon className="h-2.5 w-2.5" />
                                            <span className="hidden sm:inline">{taskPriorityLabel(prio, t)}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div className="space-y-1">
                            <label className="type-overline text-slate-500">
                                {t("Assignee", "Priradiť", "Felelős")}
                            </label>
                            <CustomSelect
                                value={assignedUser}
                                onChange={setAssignedUser}
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
                            <label className="type-overline text-slate-500">
                                {t("Link to Lead / Client", "Prepojiť s leadom / klientom", "Összekapcsolás leaddel / ügyféllel")}
                            </label>
                            <ClientSelect
                                leads={leads}
                                excludeIds={staleLeadIdsForTasks(
                                    leads,
                                    projects,
                                    leadStageGroups,
                                    leadStateParents,
                                    relatedLeadId,
                                )}
                                value={relatedLeadId}
                                onChange={(v) => {
                                    setRelatedLeadId(v);
                                    if (!v) setIsLocking(false);
                                }}
                                showCity={false}
                                showKind
                                addKind="lead"
                                noneLabel={t("-- None --", "-- Žiadny --", "-- Nincs --")}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="type-overline text-slate-500 flex items-center gap-1">
                                <FolderKanban className="h-3 w-3" />
                                {t("Project", "Projekt", "Projekt")}
                            </label>
                            <CustomSelect
                                searchable
                                value={relatedProjectId}
                                onChange={setRelatedProjectId}
                                size="sm"
                                options={taskProjectOptions(projects, leads, t)}
                            />
                        </div>
                    </div>

                    {relatedLeadId && (
                        <div className="p-2 rounded-xl bg-violet-50/60 border border-violet-100 flex items-center justify-between">
                            <span className="type-overline text-violet-700 flex items-center gap-1">
                                <Lock className="h-3 w-3" />{" "}
                                {t("Block Pipeline Stage", "Zablokovať fázu pipeline", "Folyamat szakasz zárolása")}
                            </span>
                            <input
                                type="checkbox"
                                checked={isLocking}
                                onChange={(e) => setIsLocking(e.target.checked)}
                                className="h-3.5 w-3.5 cursor-pointer accent-violet-600"
                            />
                        </div>
                    )}

                    <TaskEmailReminderField
                        task={{ deadline, deadlineTime, emailReminders }}
                        onChange={setEmailReminders}
                        currentUserName={currentUserName}
                        users={users}
                        systemLanguage={systemLanguage}
                        t={t}
                        mailConfigured={mailConfigured}
                    />

                    <div className="flex items-center gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-ui transition-colors cursor-pointer shrink-0"
                        >
                            {t("Cancel", "Zrušiť", "Mégse")}
                        </button>
                        <div className="flex-1 flex items-stretch rounded-xl overflow-hidden shadow-lg shadow-orange-500/25 bg-[#ff5d00] transition-all">
                            <button
                                type="submit"
                                className="w-2/3 py-2.5 px-3 bg-[#ff5d00] hover:bg-[#e05200] active:bg-[#c94a00] text-white type-overline flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-center truncate"
                                title={t("Create task & close form", "Vytvoriť úlohu a zatvoriť formulár", "Feladat létrehozása és bezárás")}
                            >
                                {t("Create task", "Vytvoriť úlohu", "Feladat létrehozása")}
                            </button>
                            <div className="w-px bg-white/30 self-stretch my-2 shrink-0" />
                            <button
                                type="button"
                                onClick={(e) => createTasks(e, false)}
                                className="w-1/3 py-2.5 px-3 bg-[#ff5d00] hover:bg-[#e05200] active:bg-[#c94a00] text-white type-overline flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-center truncate"
                                title={t("Create task & add another", "Vytvoriť úlohu a pridať ďalšiu", "Létrehozás és újabb hozzáadása")}
                            >
                                {t("Add another", "Pridať ďalšiu", "Újabb hozzáadása")}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
    );

    if (inline) return panel;

    return createPortal(
        <>
            {/* Transparent catcher below the header: a click outside closes the panel, the header stays usable. */}
            <div
                onClick={onClose}
                className="fixed inset-x-0 bottom-0 top-20 z-[100000]"
                aria-hidden="true"
            />
            {panel}
        </>,
        document.body,
    );
};
