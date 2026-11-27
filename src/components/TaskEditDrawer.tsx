import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
    Archive as ArchiveIcon,
    ArrowUpRight,
    Check,
    CheckSquare,
    Copy,
    Repeat,
    FolderKanban,
    Hash,
    Lock,
    Maximize2,
    MessageSquare,
    PanelRightOpen,
    RotateCcw,
    Ticket as TicketIcon,
    Timer,
    Trash2,
    UserCheck,
    X,
} from "lucide-react";
import { useUserPref } from "../utils/userPrefs";
import { TaskActivityPanel } from "./tasks/TaskActivityPanel";
import { TaskDescriptionFullscreenModal } from "./tasks/TaskDescriptionFullscreenModal";
import { TaskFilePreviewModal } from "./tasks/TaskFilePreviewModal";
import { uploadTaskFile } from "../utils/taskFilesApi";
import type { Lead, Project, Task, TaskFile, Ticket, UserProfile, RecurringTaskTemplate, TaskRecurrence } from "../types";
import { AgencyWorkerSelect } from "./agency/AgencyWorkerSelect";
import { TaskRecurrenceFields, createDefaultRecurrence } from "./TaskRecurrenceFields";
import { RecurringOccurrenceDeleteDialog, type OccurrenceDeleteChoice } from "./RecurringOccurrenceDeleteDialog";
import { describeRecurrence } from "../utils/recurringTasks";
import type { Language } from "../utils/translations";
import { CustomSelect, type DropdownOption } from "./ui/CustomSelect";
import { ClientSelect } from "./ui/ClientSelect";
import { TaskEmailReminderField } from "./TaskEmailReminderField";
import { TaskAddTimeLink, TaskTimeControls } from "./timeTracking/TaskTimeControls";
import { TaskTimeBreakdown } from "./timeTracking/TaskTimeBreakdown";
import { projectDisplayName } from "../utils/projects";
import { taskCategoryOptions } from "../utils/taskCategory";
import { isClientRecord, recordHref } from "../utils/clientRecord";
import { staleLeadIdsForTasks } from "../utils/taskLeadPicker";
import { isDoneTaskState, localStampStr } from "../utils/projectTasks";
import { taskPriorityLabel, taskStateLabel, type Translate } from "../utils/taskLabels";
import { TaskTagMentionInput } from "./TaskTagMentionInput";
import { TaskConclusionToggle } from "./TaskConclusionToggle";
import { useTaskSettings } from "../hooks/useTaskSettings";
import { CONCLUSION_MAX, cleanConclusion, needsConclusionToFinish, canUntickConclusion } from "../utils/taskConclusion";
import { HoldToConfirmButton } from "./ui/HoldToConfirm";
import { extractTagsFromText, type MentionEntity } from "./TaskPillText";
import { BlockEditor } from "./BlockEditor";
import {
    blockNotesToPlainText,
    parseNotesToBlocks,
    removeTagFromDescription,
    serializeTaskDescription,
} from "../utils/blockNotes";
import { TaskWhatsAppMarks } from "./WhatsAppChip";
import { ClickUpTaskBadge } from "./projects/ClickUpTaskBadge";
import { isClickUpTask } from "../utils/clickupTasks";
import { DeadlinePostponedBadge, QuickDeadlineChips, formatDeadlineDate } from "./TaskDeadlineExtras";
import { clampDeadline, deadlineChange, minDeadlineFor, taskCreatedDate } from "../utils/taskDeadline";
import { entityAccentStyle } from "../utils/entityAccent";

// Named preset deadline times offered in the picker. "End of day (23:59)" was removed
// in favour of a "Custom" option that lets the user type any specific time.
// Kept in step with GATE_DEADLINE_TIME_PRESETS in LeadsDatagrid so the task drawer
// and the pipeline-gate quick-add offer the same choices.
const DEADLINE_TIME_PRESETS = ["09:00", "10:00", "12:00", "14:00", "16:00", "17:00", "19:00"];

// Deadline-time picker shared by the Add and Edit task drawers. Offers the named
// presets plus a "Custom" option that reveals a free time input. Defined at module
// scope (stable identity) so its internal state survives parent re-renders and the
// custom <input> keeps focus while typing.
export const DeadlineTimePicker: React.FC<{
    value: string;
    onChange: (val: string) => void;
    t: Translate;
    disabled?: boolean;
}> = ({ value, onChange, t, disabled = false }) => {
    const currentValue = value || "";
    // Tasks stored before deadline times existed (and the demo seed) have no time at
    // all. That empty value matches no <option>, and React then silently marks the
    // FIRST option as selected — the picker showed "Morning (10:00)" while the task
    // still had no time, so re-picking 10:00 fired no change event and the card kept
    // rendering the 23:59 fallback. An explicit placeholder option keeps the empty
    // state addressable so any real choice registers as a change.
    const isUnset = currentValue === "";
    const isPreset = DEADLINE_TIME_PRESETS.includes(currentValue);
    // Custom mode is active when the value isn't a named preset (e.g. a legacy 23:59
    // or a hand-typed time) or once the user explicitly opens the custom input.
    const [customOpen, setCustomOpen] = useState(!isPreset && !isUnset);
    const showCustom = customOpen || (!isPreset && !isUnset);

    const presetLabel = (p: string) => {
        switch (p) {
            case "09:00":
                return t("Early morning (9:00)", "Skoro ráno (9:00)", "Kora reggel (9:00)");
            case "10:00":
                return t("Morning (10:00)", "Ráno (10:00)", "Reggel (10:00)");
            case "12:00":
                return t("Noon (12:00)", "Poludnie (12:00)", "Dél (12:00)");
            case "14:00":
                return t("Early afternoon (14:00)", "Skoré popoludnie (14:00)", "Kora délután (14:00)");
            case "16:00":
                return t("Afternoon (16:00)", "Popoludnie (16:00)", "Délután (16:00)");
            case "17:00":
                return t("End of workday (17:00)", "Koniec pracovného dňa (17:00)", "Munkanap vége (17:00)");
            case "19:00":
                return t("Evening (19:00)", "Večer (19:00)", "Este (19:00)");
            default:
                return p;
        }
    };

    return (
        <div className="space-y-1.5">
            <CustomSelect
                value={showCustom ? "custom" : currentValue}
                disabled={disabled}
                onChange={(v) => {
                    if (v === "custom") {
                        setCustomOpen(true);
                        if (!currentValue) onChange("12:00");
                    } else {
                        setCustomOpen(false);
                        onChange(v);
                    }
                }}
                options={[
                    ...(isUnset && !showCustom
                        ? [
                              {
                                  value: "",
                                  label: t(
                                      "Not set — end of day (23:59)",
                                      "Nenastavené — koniec dňa (23:59)",
                                      "Nincs megadva — nap vége (23:59)",
                                  ),
                              },
                          ]
                        : []),
                    ...DEADLINE_TIME_PRESETS.map((p) => ({ value: p, label: presetLabel(p) })),
                    { value: "custom", label: t("Custom…", "Vlastný čas…", "Egyéni időpont…") },
                ]}
            />
            {showCustom && (
                <input
                    type="time"
                    value={currentValue}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-gray-200 focus:border-entity-solid focus:outline-none bg-white font-semibold disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"
                />
            )}
        </div>
    );
};

/** The options of a task's "Project" picker: none, then every project by its display name. */
export const taskProjectOptions = (
    projects: Project[],
    leads: Lead[],
    t: Translate,
): DropdownOption[] => [
    { value: "", label: t("-- None --", "-- Žiadny --", "-- Nincs --") },
    ...projects.map((p) => ({
        value: p.id,
        label: projectDisplayName(p, leads, t("Untitled project", "Projekt bez názvu", "Névtelen projekt")),
    })),
];

// Matches the slide-out-right animation, so the drawer unmounts once it is off screen.
const CLOSE_ANIMATION_MS = 350;

interface TaskEditDrawerProps {
    /** The task as it is stored; the drawer edits its own copy until Save. */
    task: Task | RecurringTaskTemplate;
    isTemplate?: boolean;
    recurringTemplates?: RecurringTaskTemplate[];
    leads: Lead[];
    projects?: Project[];
    tickets?: Ticket[];
    users: UserProfile[];
    taskStates: string[];
    /** Colour of each state from the task-state settings, keyed by state name; paints the status dropdown. */
    taskStateColors?: Record<string, string>;
    systemLanguage: Language;
    /** Recorded as `completedBy` when the status is moved to a done state here. */
    currentUserName: string;
    /** The signed-in user, for permission checks such as unticking conclusion requirement. */
    currentUser?: UserProfile;
    /** Off, the drawer still opens but every field is read-only. */
    canEdit: boolean;
    canArchive?: boolean;
    canDelete?: boolean;
    /** False when no outgoing mail server is set up; the e-mail reminder then warns. */
    mailConfigured?: boolean;
    /** True when the opt-in Agency & Workforce Leasing module is enabled. */
    agencyEnabled?: boolean;
    existingTags?: string[];
    /** Lead-state settings, to keep closed leads out of the lead / client picker. */
    leadStageGroups?: Record<string, string>;
    leadStateParents?: Record<string, string>;
    onTagClick?: (tag: string) => void;
    onSave: (task: Task) => void;
    onSaveTemplate?: (template: RecurringTaskTemplate) => void;
    onConvertToRecurring?: (task: Task, recurrence: TaskRecurrence) => void;
    onEditSeries?: (templateId: string) => void;
    onDeleteOccurrence?: (task: Task, choice: OccurrenceDeleteChoice) => void;
    onToggleArchive?: (task: Task) => void;
    /** Resolves true once the task is really gone; the drawer only closes then. */
    onDelete?: (task: Task) => Promise<boolean>;
    /** Called when task comment count, reaction counts, or file count change in the activity/files panel. */
    onTaskMetaPatch?: (taskId: string, patch: { commentCount?: number; reactions?: Record<string, string[]> | null; fileCount?: number }) => void;
    /** Force the Activity & Chat pane open initially (e.g. clicking a board comment badge). */
    initialChatOpen?: boolean;
    /** Called after the closing animation has played. */
    onClose: () => void;
}

/**
 * The Edit Task drawer. Shared by the Tasks board and a project's Tasks tab, so
 * a task has the same fields and rules wherever it is opened. Mount it with
 * `key={task.id}` so switching tasks starts from a fresh copy.
 */
export const TaskEditDrawer: React.FC<TaskEditDrawerProps> = ({
    task,
    leads,
    projects = [],
    tickets = [],
    users,
    taskStates,
    taskStateColors = {},
    systemLanguage,
    currentUserName,
    currentUser,
    canEdit: canEditProp,
    canArchive: canArchiveProp = false,
    canDelete: canDeleteProp = false,
    mailConfigured,
    agencyEnabled = false,
    existingTags = [],
    leadStageGroups,
    leadStateParents,
    isTemplate: isTemplateProp = false,
    recurringTemplates,
    onTagClick,
    onSave,
    onSaveTemplate,
    onConvertToRecurring,
    onEditSeries,
    onDeleteOccurrence,
    onToggleArchive,
    onDelete,
    onTaskMetaPatch,
    initialChatOpen,
    onClose,
}) => {
    const t: Translate = (en, sk, hu) =>
        systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;
    const isTemplate = isTemplateProp || Boolean((task as any).recurrence);
    const isClickUp = !isTemplate && isClickUpTask(task as Task);
    const canEdit = canEditProp && !isClickUp;
    const canArchive = canArchiveProp && !isClickUp;
    const canDelete = canDeleteProp && !isClickUp;
    const [draft, setDraft] = useState<Task>(task as Task);
    const [chatExpandedPref, setChatExpandedPref] = useUserPref("taskDrawerChatExpanded");
    const showChatPane = !isTemplate && Boolean(draft.id);
    const [chatOpen, setChatOpen] = useState<boolean>(() => !isTemplate && Boolean(initialChatOpen ?? chatExpandedPref));
    const [mobileTab, setMobileTab] = useState<"details" | "activity">(() => (initialChatOpen ? "activity" : "details"));
    const [filesRefreshKey, setFilesRefreshKey] = useState(0);
    const [insertFileSignal, setInsertFileSignal] = useState<{ nonce: number; file: TaskFile } | null>(null);
    const [fullscreenDescOpen, setFullscreenDescOpen] = useState(false);
    const [previewFile, setPreviewFile] = useState<TaskFile | null>(null);
    const [copiedLink, setCopiedLink] = useState(false);
    const handleTaskMetaChange = useCallback(
        (taskId: string, patch: { commentCount?: number; reactions?: Record<string, string[]> | null; fileCount?: number }) => {
            setDraft((prev) => (prev.id === taskId ? { ...prev, ...patch } : prev));
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("ccrm-task-meta-patch", { detail: { taskId, ...patch } }));
            }
            onTaskMetaPatch?.(taskId, patch);
        },
        [onTaskMetaPatch],
    );
    const handleDescriptionFileUpload = useCallback(
        async (file: File): Promise<TaskFile | null> => {
            if (!draft.id || isTemplate || !canEdit) return null;
            try {
                const res = await uploadTaskFile(draft.id, file);
                setFilesRefreshKey((k) => k + 1);
                handleTaskMetaChange(draft.id, { fileCount: res.fileCount });
                return res.file;
            } catch (err) {
                (window as any).showToast?.(
                    err instanceof Error ? err.message : t("File upload failed.", "Nahrávanie súboru zlyhalo.", "Fájlfeltöltés sikertelen."),
                    "error",
                );
                return null;
            }
        },
        [draft.id, isTemplate, canEdit, handleTaskMetaChange],
    );
    const handleInsertFileIntoDescription = useCallback((file: TaskFile) => {
        setInsertFileSignal({ nonce: Date.now() + Math.random(), file });
    }, []);
    const handleInsertFileHandled = useCallback((nonce: number) => {
        setInsertFileSignal((prev) => (prev?.nonce === nonce ? null : prev));
    }, []);
    const [descVersion, setDescVersion] = useState(0);
    const [templateRecurrence, setTemplateRecurrence] = useState<TaskRecurrence>(() =>
        (task as any).recurrence ? (task as any).recurrence : createDefaultRecurrence((task as Task).deadline)
    );
    const [makeRepeating, setMakeRepeating] = useState(false);
    const [occurrenceDeleteDialogOpen, setOccurrenceDeleteDialogOpen] = useState(false);
    const recurringSeriesDescription = useMemo(() => {
        if (isTemplate || !(task as Task).recurringSourceId || !recurringTemplates) return undefined;
        const found = recurringTemplates.find((r) => r.id === (task as Task).recurringSourceId);
        return found ? describeRecurrence(found.recurrence, systemLanguage) : undefined;
    }, [isTemplate, task, recurringTemplates, systemLanguage]);
    const { offerConclusion } = useTaskSettings();
    const effectiveUser = useMemo<Pick<UserProfile, "name" | "role">>(
        () => currentUser ?? users.find((u) => u.name === currentUserName) ?? { name: currentUserName, role: "" },
        [currentUser, users, currentUserName],
    );
    const canUntick = canUntickConclusion(task, effectiveUser);
    const conclusionToggleDisabled = !canEdit || (!canUntick && Boolean(task.requiresConclusion));
    const conclusionDisabledHint = !canUntick && Boolean(task.requiresConclusion)
        ? t(
              "Only the task's creator or an Admin can remove the conclusion requirement.",
              "Požiadavku na záver môže zrušiť iba tvorca úlohy alebo administrátor.",
              "A záró összegzés követelményét csak a feladat létrehozója vagy egy adminisztrátor távolíthatja el.",
          )
        : undefined;
    // Set once a save was refused for lack of a conclusion, so the box stays
    // marked until it is filled in.
    const [conclusionMissing, setConclusionMissing] = useState(false);
    const conclusionRef = useRef<HTMLTextAreaElement>(null);
    const [isClosing, setIsClosing] = useState(false);
    const closeTimer = useRef<number | null>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(
        () => () => {
            if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
        },
        [],
    );

    const requestClose = () => {
        if (closeTimer.current !== null) return;
        setIsClosing(true);
        closeTimer.current = window.setTimeout(() => onCloseRef.current(), CLOSE_ANIMATION_MS);
    };

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.defaultPrevented) return;
            if (e.key === "Escape" && !occurrenceDeleteDialogOpen && !fullscreenDescOpen && !previewFile) {
                e.stopPropagation();
                requestClose();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [occurrenceDeleteDialogOpen, fullscreenDescOpen, previewFile]);

    const update = (patch: Partial<Task>) => setDraft((prev) => ({ ...prev, ...patch }));

    const mentionEntities: MentionEntity[] = useMemo(() => {
        const list: MentionEntity[] = [];

        // Users (Team members)
        users.forEach((u) => {
            list.push({
                id: u.name,
                name: u.name,
                type: "user",
                detail: u.role || "Team member",
            });
        });

        // Projects
        (projects || []).forEach((p) => {
            const name = projectDisplayName(p, leads, t("Untitled project", "Projekt bez názvu", "Névtelen projekt"));
            list.push({
                id: p.id,
                name,
                type: "project",
                detail: p.status || "Project",
            });
        });

        // Clients and Leads
        leads.forEach((l) => {
            if (isClientRecord(l)) {
                list.push({
                    id: l.id,
                    name: l.name,
                    type: "client",
                    detail: l.city || "Client",
                });
            } else {
                list.push({
                    id: l.id,
                    name: l.name,
                    type: "lead",
                    detail: l.status || "Lead",
                });
            }
        });

        return list;
    }, [users, projects, leads, t]);

    const combinedTags = useMemo(() => {
        const fromTitle = extractTagsFromText(draft.title);
        const fromDesc = extractTagsFromText(blockNotesToPlainText(draft.description));
        const explicit = draft.tags || [];
        return Array.from(new Set([...explicit, ...fromTitle, ...fromDesc]));
    }, [draft.title, draft.description, draft.tags]);

    const handleAssignEntity = (entity: MentionEntity) => {
        if (entity.type === "user") {
            const currentUsers = draft.assignedUsers || [];
            if (!currentUsers.includes(entity.id)) {
                update({
                    assignedUsers: [...currentUsers, entity.id],
                    owner: draft.owner || entity.id,
                });
            }
        } else if (entity.type === "project") {
            update({ relatedProjectId: entity.id });
        } else if (entity.type === "client" || entity.type === "lead") {
            update({ relatedLeadId: entity.id });
        }
    };

    // A task can point at a project the viewer's list no longer has (deleted in
    // another session); keep it pickable rather than silently showing "None".
    const projectOptions = taskProjectOptions(projects, leads, t);
    if (draft.relatedProjectId && !projects.some((p) => p.id === draft.relatedProjectId)) {
        projectOptions.push({
            value: draft.relatedProjectId,
            label: t("Removed project", "Odstránený projekt", "Törölt projekt"),
        });
    }

    // Does saving this draft finish a task that still lacks its conclusion?
    // Judged against the stored task, so only a real move to a done state counts.
    const finishingWithoutConclusion = !isTemplate && needsConclusionToFinish(
        { ...(task as Task), requiresConclusion: draft.requiresConclusion, conclusion: draft.conclusion },
        draft.status,
        taskStates,
    );
    const draftIsDone = isDoneTaskState(draft.status, taskStates);
    // A deadline cannot lie before the day the task was created (a series template has no deadline of its own).
    const storedTask = isTemplate ? null : (task as Task);
    const minDeadline = storedTask ? minDeadlineFor(storedTask) : "";
    // The postponement counters follow the stored deadline, so several edits before one Save count once.
    const withDeadlineHistory = (next: Task): Task => (storedTask ? { ...next, ...deadlineChange(storedTask, next.deadline) } : next);
    const draftPostpones = Boolean(storedTask && draft.deadline && storedTask.deadline && draft.deadline > storedTask.deadline);
    // The conclusion box shows once it matters: the task asks for one and is
    // being (or has been) finished, or it already holds text.
    const showConclusion = Boolean(draft.requiresConclusion) && (draftIsDone || Boolean(draft.conclusion?.trim()));

    const linkedLead = task.relatedLeadId
        ? leads.find((l) => String(l.id) === String(task.relatedLeadId))
        : undefined;

    const resolvedTicketId = useMemo(() => {
        if (draft.relatedTicketId !== undefined) return draft.relatedTicketId || "";
        if (task.relatedTicketId) return task.relatedTicketId;
        const byLink = tickets.find((tk) =>
            (tk.taskLinks || []).some((l) => String(l.taskId) === String(task.id)),
        );
        if (byLink) return byLink.id;
        const m = (task.title || "").match(/\[(TCK-[A-Za-z0-9_-]+)\]/i);
        if (m) {
            const num = m[1].toUpperCase();
            const byNum = tickets.find(
                (tk) => (tk.ticketNumber || "").toUpperCase() === num,
            );
            return byNum ? byNum.id : num;
        }
        return "";
    }, [draft.relatedTicketId, task.relatedTicketId, task.id, task.title, tickets]);

    const linkedTicket = useMemo(() => {
        if (!resolvedTicketId) return undefined;
        const lower = resolvedTicketId.toLowerCase();
        return tickets.find(
            (tk) =>
                String(tk.id) === String(resolvedTicketId) ||
                (tk.ticketNumber || "").toLowerCase() === lower,
        );
    }, [resolvedTicketId, tickets]);

    const ticketOptions: DropdownOption[] = useMemo(() => {
        const opts: DropdownOption[] = [
            { value: "", label: t("-- None --", "-- Žiadny --", "-- Nincs --") },
            ...tickets.map((tk) => ({
                value: tk.id,
                label: `${tk.ticketNumber} — ${tk.subject || tk.title || ""}`,
            })),
        ];
        if (
            resolvedTicketId &&
            !opts.some((o) => o.value === resolvedTicketId)
        ) {
            opts.push({
                value: resolvedTicketId,
                label: linkedTicket
                    ? `${linkedTicket.ticketNumber} — ${linkedTicket.subject || ""}`
                    : resolvedTicketId,
            });
        }
        return opts;
    }, [tickets, resolvedTicketId, linkedTicket, t]);

    if (typeof document === "undefined") return null;

    return createPortal(
        <div style={entityAccentStyle("tasks")} className="fixed inset-0 z-[100000] flex justify-end">
            <div
                onClick={requestClose}
                className={`absolute inset-0 bg-slate-900/40 backdrop-blur-sm ${isClosing ? "animate-fade-out" : "animate-fade-in"}`}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={draft.title || t("Task", "Úloha", "Feladat")}
                className={`relative w-full ${showChatPane && chatOpen ? "max-w-xl lg:max-w-5xl" : "max-w-xl"} bg-white border-l border-gray-200 shadow-lg h-full flex flex-col lg:flex-row overflow-hidden transition-[max-width] duration-200 ${isClosing ? "animate-slide-out-right" : "animate-slide-in-right"}`}
            >
                <div className="flex-1 min-w-0 flex flex-col min-h-0 h-full">
                <div className="px-6 pt-6 pb-4 border-b border-gray-200 space-y-2 shrink-0">
                    <div className="flex items-center justify-between gap-2">
                        <span className="type-overline text-entity-text bg-entity-subtle border border-entity-border px-2 py-0.5 rounded-md flex items-center gap-1.5">
                            {isTemplate ? (
                                <>
                                    <Repeat className="h-3.5 w-3.5 text-entity-text" />
                                    {canEdit
                                        ? t("Edit Recurring Task", "Upraviť opakovanú úlohu", "Ismétlődő feladat szerkesztése")
                                        : t("View Recurring Task", "Zobraziť opakovanú úlohu", "Ismétlődő feladat megtekintése")}
                                </>
                            ) : (
                                <>
                                    <CheckSquare className="h-3.5 w-3.5 text-entity-text" />
                                    {canEdit
                                        ? t("Edit Task", "Upraviť úlohu", "Feladat szerkesztése")
                                        : t("View Task", "Zobraziť úlohu", "Feladat megtekintése")}
                                </>
                            )}
                        </span>
                        <div className="flex items-center gap-1.5">
                            {!isTemplate && Boolean(draft.id) && (
                                <>
                                    <button
                                        type="button"
                                        data-testid="task-drawer-copy-link-btn"
                                        onClick={async () => {
                                            const hash = `#task-${encodeURIComponent(draft.id)}`;
                                            const fullUrl =
                                                typeof window !== "undefined"
                                                    ? `${window.location.origin}${window.location.pathname}${hash}`
                                                    : hash;
                                            try {
                                                await navigator.clipboard.writeText(fullUrl);
                                                setCopiedLink(true);
                                                window.setTimeout(() => setCopiedLink(false), 1800);
                                            } catch {
                                                // ignore clipboard error
                                            }
                                        }}
                                        title={t("Copy link to task", "Kopírovať odkaz na úlohu", "Feladat linkjének másolása")}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 text-micro font-bold transition-colors cursor-pointer"
                                    >
                                        {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                                        <span className="hidden sm:inline">
                                            {copiedLink ? t("Copied", "Skopírované", "Másolva") : t("Copy link", "Odkaz", "Link")}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        data-testid="task-drawer-open-page-btn"
                                        onClick={() => {
                                            if (
                                                !isTemplate &&
                                                canEdit &&
                                                draft.title.trim() &&
                                                !finishingWithoutConclusion &&
                                                JSON.stringify(draft) !== JSON.stringify(task)
                                            ) {
                                                const sanitizedRequiresConclusion =
                                                    (!canUntick && task.requiresConclusion)
                                                        ? true
                                                        : (draft.requiresConclusion ? true : undefined);
                                                onSave(withDeadlineHistory({
                                                    ...draft,
                                                    requiresConclusion: sanitizedRequiresConclusion,
                                                    conclusion: cleanConclusion(draft.conclusion ?? ""),
                                                    tags: combinedTags,
                                                }));
                                            }
                                            if (typeof window !== "undefined") {
                                                window.location.hash = `task-${encodeURIComponent(draft.id)}`;
                                            }
                                            requestClose();
                                        }}
                                        title={t("Open full page view", "Otvoriť celú stránku úlohy", "Megnyitás teljes oldalon")}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 text-micro font-bold transition-colors cursor-pointer"
                                    >
                                        <Maximize2 className="h-3.5 w-3.5" />
                                        <span className="hidden sm:inline">
                                            {t("Full page", "Celá stránka", "Teljes oldal")}
                                        </span>
                                    </button>
                                </>
                            )}
                            {showChatPane && (
                                <button
                                    type="button"
                                    data-testid="task-drawer-chat-toggle"
                                    onClick={() => {
                                        const next = !chatOpen;
                                        setChatOpen(next);
                                        setChatExpandedPref(next);
                                    }}
                                    title={chatOpen ? t("Hide Activity & Chat", "Skryť aktivitu a chat", "Aktivitás és csevegés elrejtése") : t("Show Activity & Chat", "Zobraziť aktivitu a chat", "Aktivitás és csevegés megjelenítése")}
                                    className={`hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-micro font-bold transition-colors cursor-pointer ${
                                        chatOpen
                                            ? "bg-entity-subtle border-entity-border text-entity-text"
                                            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                                    }`}
                                >
                                    {chatOpen ? <MessageSquare className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
                                    <span>{t("Activity & Chat", "Aktivita a chat", "Aktivitás és csevegés")}</span>
                                    {(draft.commentCount ?? 0) > 0 && (
                                        <span className="px-1.5 py-0.5 rounded-full bg-entity-solid text-white tabular-nums">
                                            {draft.commentCount}
                                        </span>
                                    )}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={requestClose}
                                aria-label={t("Close", "Zavrieť", "Bezárás")}
                                title={t("Close", "Zavrieť", "Bezárás")}
                                className="p-1 hover:bg-gray-100 active:scale-95 rounded-md text-gray-400 hover:text-gray-600 transition-all cursor-pointer"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                    <h1 className="type-page-title text-gray-900 leading-snug break-words">
                        {draft.title || t("Untitled Task", "Úloha bez názvu", "Névtelen feladat")}
                    </h1>
                    {showChatPane && (
                        <div className="lg:hidden grid grid-cols-2 gap-1 bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                            <button
                                type="button"
                                onClick={() => setMobileTab("details")}
                                className={`py-1.5 rounded-md text-micro font-bold transition-all cursor-pointer ${
                                    mobileTab === "details" ? "bg-white text-gray-900 shadow-2xs" : "text-gray-500"
                                }`}
                            >
                                {t("Details", "Detaily", "Részletek")}
                            </button>
                            <button
                                type="button"
                                onClick={() => setMobileTab("activity")}
                                className={`py-1.5 rounded-md text-micro font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                    mobileTab === "activity" ? "bg-white text-entity-text shadow-2xs" : "text-gray-500"
                                }`}
                            >
                                <span>{t("Activity & Chat", "Aktivita a chat", "Aktivitás")}</span>
                                {(draft.commentCount ?? 0) > 0 && (
                                    <span className="px-1.5 rounded-full bg-entity-subtle text-entity-text tabular-nums">
                                        {draft.commentCount}
                                    </span>
                                )}
                            </button>
                        </div>
                    )}
                </div>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!canEdit) return;
                        if (finishingWithoutConclusion) {
                            setConclusionMissing(true);
                            conclusionRef.current?.focus();
                            (window as any).showToast?.(
                                t(
                                    "Write the conclusion before completing this task.",
                                    "Pred dokončením úlohy napíšte záver.",
                                    "A feladat befejezése előtt írja meg az összegzést.",
                                ),
                                "warning",
                            );
                            return;
                        }
                        const sanitizedRequiresConclusion =
                            (!canUntick && task.requiresConclusion)
                                ? true
                                : (draft.requiresConclusion ? true : undefined);
                        if (isTemplate && onSaveTemplate) {
                            onSaveTemplate({
                                ...(task as RecurringTaskTemplate),
                                ...draft,
                                tags: combinedTags,
                                recurrence: templateRecurrence,
                            });
                            requestClose();
                            return;
                        }
                        if (makeRepeating && onConvertToRecurring) {
                            onConvertToRecurring(
                                {
                                    ...draft,
                                    requiresConclusion: sanitizedRequiresConclusion,
                                    conclusion: cleanConclusion(draft.conclusion ?? ""),
                                    tags: combinedTags,
                                },
                                templateRecurrence,
                            );
                            requestClose();
                            return;
                        }
                        onSave(withDeadlineHistory({
                            ...draft,
                            requiresConclusion: sanitizedRequiresConclusion,
                            conclusion: cleanConclusion(draft.conclusion ?? ""),
                            tags: combinedTags,
                        }));
                        requestClose();
                    }}
                    className={`flex-1 min-h-0 flex-col ${showChatPane && mobileTab === "activity" ? "hidden lg:flex" : "flex"}`}
                >
                    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-ui font-bold">
                        {isClickUp && (
                            <div
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-2.5 text-caption font-medium text-violet-900"
                                data-testid="task-drawer-clickup-banner"
                            >
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <ClickUpTaskBadge task={task as Task} showListName showLink={false} userLanguage={systemLanguage} />
                                    <span>
                                        {t(
                                            "Mirrored from ClickUp (read-only). Edit details in ClickUp; track hours below.",
                                            "Zrkadlené z ClickUpu (iba na čítanie). Detaily upravte v ClickUpe; čas sledujte nižšie.",
                                            "ClickUpból tükrözve (csak olvasható). A részleteket a ClickUpban szerkessze; az időt alább rögzítheti.",
                                        )}
                                    </span>
                                </div>
                                {(task as Task).externalUrl && (
                                    <a
                                        href={(task as Task).externalUrl || undefined}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 rounded-md border border-violet-300 bg-white px-2.5 py-1 text-micro font-bold text-violet-700 hover:bg-violet-50 transition-colors shrink-0"
                                    >
                                        <ArrowUpRight className="h-3.5 w-3.5" />
                                        {t("Open in ClickUp", "Otvoriť v ClickUpe", "Megnyitás ClickUpban")}
                                    </a>
                                )}
                            </div>
                        )}
                        {!isTemplate && Boolean((task as Task).recurringSourceId) && (
                            <div className="p-3 bg-entity-subtle border border-entity-border rounded-lg flex items-center justify-between text-caption font-semibold text-entity-text">
                                <div className="flex items-center gap-2">
                                    <Repeat className="h-4 w-4 text-entity-text shrink-0" />
                                    <span>
                                        {recurringSeriesDescription || t("Part of a recurring series", "Súčasť opakovanej série", "Egy ismétlődő sorozat része")}
                                    </span>
                                </div>
                                {onEditSeries && (
                                    <button
                                        type="button"
                                        onClick={() => onEditSeries((task as Task).recurringSourceId!)}
                                        className="text-entity-text hover:opacity-80 underline font-bold cursor-pointer shrink-0 ml-3"
                                    >
                                        {t("Edit series", "Upraviť sériu", "Sorozat szerkesztése")}
                                    </button>
                                )}
                            </div>
                        )}
                    <fieldset disabled={!canEdit} className="space-y-5 min-w-0">
                        <div className="space-y-1">
                            <label className="type-overline text-slate-500 flex items-center justify-between">
                                <span>{t("Task Title", "Názov", "Cím")}</span>
                                <span className="text-micro font-normal text-indigo-500">
                                    {t("Use # for tags, @ to assign", "Použite # pre tagy, @ pre priradenie", "Használjon #-et címkékhez, @-ot hozzárendeléshez")}
                                </span>
                            </label>
                            <TaskTagMentionInput
                                value={draft.title}
                                onChange={(val) => update({ title: val })}
                                required
                                maxLength={255}
                                disabled={!canEdit}
                                existingTags={existingTags}
                                onTagAdded={(tag) => {
                                    const current = draft.tags || [];
                                    if (!current.includes(tag)) update({ tags: [...current, tag] });
                                }}
                                mentionEntities={mentionEntities}
                                onAssignEntity={handleAssignEntity}
                                className="w-full px-3 py-2 rounded-md border border-gray-200 focus:border-entity-solid focus:outline-none disabled:bg-gray-50 text-ui font-medium"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="type-overline text-gray-500 flex items-center justify-between gap-2">
                                <span>{t("Description", "Popis", "Leírás")}</span>
                                <span className="text-micro font-normal text-entity-text text-right">
                                    {t("Type '/' for blocks & formatting · # for tags", "Napíšte '/' pre bloky a formátovanie · # pre tagy", "Írjon '/' jelet a blokkokhoz · # a címkékhez")}
                                </span>
                            </label>
                            <div
                                className={`flex flex-col min-h-56 max-h-[28rem] overflow-y-auto rounded-md border border-gray-200 px-2.5 py-1.5 transition-colors font-normal ${
                                    !canEdit
                                        ? "bg-gray-50 cursor-default"
                                        : "bg-white focus-within:border-entity-solid focus-within:ring-2 focus-within:ring-entity-ring cursor-text"
                                }`}
                            >
                                <BlockEditor
                                    key={`${draft.id || "task"}-${descVersion}`}
                                    compact
                                    fillHeight
                                    readOnly={!canEdit}
                                    initialBlocks={parseNotesToBlocks(draft.description)}
                                    onChange={(blocks) => update({ description: serializeTaskDescription(blocks) })}
                                    systemLanguage={systemLanguage}
                                    exportTitle={draft.title}
                                    onUploadFile={canEdit && !isTemplate && draft.id ? handleDescriptionFileUpload : undefined}
                                    onPreviewFile={setPreviewFile}
                                    insertFileSignal={!fullscreenDescOpen ? insertFileSignal : null}
                                    onInsertFileHandled={handleInsertFileHandled}
                                    onOpenFullscreen={() => {
                                        setInsertFileSignal(null);
                                        setFullscreenDescOpen(true);
                                    }}
                                    placeholder={t(
                                        "Write task description... (type '/' for blocks, headings, checklists)",
                                        "Napíšte popis úlohy... (napíšte '/' pre bloky, nadpisy, zoznam úloh)",
                                        "Írja be a feladat leírását... (írjon '/' jelet a blokkokhoz, címsorokhoz)",
                                    )}
                                />
                            </div>
                        </div>

                        {/* Offered while the setting is on; a task that already carries
                            the flag keeps showing it, so it can still be switched off. */}
                        {(offerConclusion || draft.requiresConclusion) && (
                            <TaskConclusionToggle
                                checked={Boolean(draft.requiresConclusion)}
                                onChange={(next) => {
                                    if (!next && !canUntick && task.requiresConclusion) return;
                                    update({ requiresConclusion: next || undefined });
                                }}
                                t={t}
                                disabled={conclusionToggleDisabled}
                                disabledHint={conclusionDisabledHint}
                            />
                        )}

                        {combinedTags.length > 0 && (
                            <div className="space-y-1 pt-0.5">
                                <label className="type-overline text-gray-400 block">
                                    {t("Active Tags", "Aktívne tagy", "Aktív címkék")}
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {combinedTags.map((tag) => (
                                        <span
                                            key={tag}
                                            onClick={() => {
                                                if (onTagClick) {
                                                    requestClose();
                                                    onTagClick(tag);
                                                }
                                            }}
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md type-overline bg-entity-subtle text-entity-text border border-entity-border shadow-2xs ${
                                                onTagClick ? "cursor-pointer hover:opacity-90" : ""
                                            }`}
                                            title={onTagClick ? `Filter archive by #${tag}` : undefined}
                                        >
                                            <Hash className="h-2.5 w-2.5 opacity-70" />
                                            <span>{tag}</span>
                                            {canEdit && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const nextTags = (draft.tags || []).filter((t) => t !== tag);
                                                        const tagRegex = new RegExp(`#${tag}\\b`, "gi");
                                                        const nextTitle = draft.title.replace(tagRegex, "").trim();
                                                        const nextDesc = removeTagFromDescription(draft.description, tag);
                                                        setDescVersion((v) => v + 1);
                                                        update({
                                                            tags: nextTags,
                                                            title: nextTitle,
                                                            description: nextDesc,
                                                        });
                                                    }}
                                                    className="hover:text-rose-600 ml-0.5 p-0.5 rounded transition-colors"
                                                >
                                                    <X className="h-2.5 w-2.5" />
                                                </button>
                                            )}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="space-y-1">
                            <label className="type-overline text-gray-500">
                                {t("Start Date", "Dátum začiatku", "Kezdő dátum")}
                            </label>
                            <input
                                type="date"
                                value={draft.startDate || ""}
                                onChange={(e) => update({ startDate: e.target.value })}
                                className="w-full px-3 py-2 rounded-md border border-gray-200 focus:border-entity-solid focus:outline-none disabled:bg-gray-50"
                            />
                        </div>

                        {!isTemplate && !(task as Task).recurringSourceId && (
                            <div className="flex items-center justify-between py-2 border-t border-b border-gray-200">
                                <div className="flex items-center gap-1.5">
                                    <Repeat className="w-3.5 h-3.5 text-entity-text" />
                                    <span className="type-overline text-gray-700 font-semibold">
                                        {t("Make this task repeat", "Nastaviť opakovanie úlohy", "Feladat ismétlődővé tétele")}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={makeRepeating}
                                    aria-label={t("Make this task repeat", "Nastaviť opakovanie úlohy", "Feladat ismétlődővé tétele")}
                                    onClick={() => setMakeRepeating(!makeRepeating)}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                        makeRepeating ? "bg-entity-solid" : "bg-gray-200"
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                            makeRepeating ? "translate-x-4" : "translate-x-0"
                                        }`}
                                    />
                                </button>
                            </div>
                        )}

                        {isTemplate || makeRepeating ? (
                            <div className="space-y-3">
                                <TaskRecurrenceFields
                                    recurrence={templateRecurrence}
                                    onChange={setTemplateRecurrence}
                                    t={t}
                                    language={systemLanguage}
                                />
                                <div className="space-y-1">
                                    <label className="type-overline text-slate-500">
                                        {t("Deadline Time", "Čas termínu", "Határidő időpontja")}
                                    </label>
                                    <DeadlineTimePicker
                                        value={draft.deadlineTime || ""}
                                        onChange={(val) => update({ deadlineTime: val })}
                                        t={t}
                                        disabled={!canEdit}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="type-overline text-slate-500">
                                        {t("Deadline Date", "Termín", "Határidő")}
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        value={draft.deadline}
                                        min={minDeadline || undefined}
                                        onChange={(e) => update({ deadline: clampDeadline(e.target.value, minDeadline) })}
                                        className="w-full px-3 py-2 rounded-md border border-gray-200 focus:border-entity-solid focus:outline-none disabled:bg-gray-50"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="type-overline text-slate-500">
                                        {t("Deadline Time", "Čas termínu", "Határidő időpontja")}
                                    </label>
                                    <DeadlineTimePicker
                                        value={draft.deadlineTime || ""}
                                        onChange={(val) => update({ deadlineTime: val })}
                                        t={t}
                                        disabled={!canEdit}
                                    />
                                </div>
                            </div>
                        )}

                        {!isTemplate && !makeRepeating && (
                            <div className="space-y-1.5 -mt-2.5" data-testid="task-deadline-extras">
                                <QuickDeadlineChips
                                    value={draft.deadline}
                                    min={minDeadline}
                                    onPick={(date) => update({ deadline: date })}
                                    t={t}
                                    disabled={!canEdit}
                                />
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <DeadlinePostponedBadge task={task as Task} language={systemLanguage} t={t} />
                                    {draftPostpones && (
                                        <span className="text-micro font-semibold text-amber-600" data-testid="deadline-will-postpone">
                                            {t(
                                                "Saving counts as a postponement",
                                                "Uložením sa to započíta ako posunutie termínu",
                                                "A mentés halasztásnak számít",
                                            )}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {!isTemplate && (task as Task).externalSource === "waai" && (
                            <div className="flex flex-wrap items-center gap-1.5">
                                <TaskWhatsAppMarks task={task as Task} userLanguage={systemLanguage} />
                            </div>
                        )}

                        {!isTemplate && (
                            <div className="space-y-1">
                                <label className="type-overline text-slate-500">
                                    {t("Task Status", "Stav úlohy", "Feladat állapota")}
                                </label>
                                <CustomSelect
                                value={draft.status}
                                disabled={!canEdit}
                                onChange={(val) => {
                                    const done = isDoneTaskState(val, taskStates);
                                    update({
                                        status: val,
                                        completedBy: done ? currentUserName || undefined : undefined,
                                        completedAt: done ? localStampStr(new Date()) : undefined,
                                    });
                                }}
                                options={taskStates.map((st) => ({ value: st, label: taskStateLabel(st, t), color: taskStateColors[st] || "#64748b" }))}
                            />
                        </div>
                        )}

                        {!isTemplate && showConclusion && (
                            <div className="space-y-1">
                                <label className="type-overline text-slate-500 flex items-center justify-between">
                                    <span>{t("Conclusion", "Záver", "Összegzés")}</span>
                                    {draftIsDone && canEdit && (
                                        <span className="text-micro font-normal text-rose-500">
                                            {t("Required to complete", "Povinné pre dokončenie", "A befejezéshez kötelező")}
                                        </span>
                                    )}
                                </label>
                                <textarea
                                    ref={conclusionRef}
                                    data-testid="task-conclusion-input"
                                    rows={3}
                                    maxLength={CONCLUSION_MAX}
                                    value={draft.conclusion ?? ""}
                                    disabled={!canEdit}
                                    aria-invalid={conclusionMissing && finishingWithoutConclusion}
                                    onChange={(e) => {
                                        setConclusionMissing(false);
                                        update({ conclusion: e.target.value });
                                    }}
                                    placeholder={t(
                                        "A short note or report on how the task was finished…",
                                        "Krátka poznámka alebo správa o tom, ako úloha dopadla…",
                                        "Rövid jegyzet vagy beszámoló arról, hogyan zárult a feladat…",
                                    )}
                                    className={`w-full px-3 py-2 rounded-md border focus:outline-none resize-none disabled:bg-gray-50 text-ui font-medium ${
                                        conclusionMissing && finishingWithoutConclusion
                                            ? "border-rose-400 focus:border-rose-500"
                                            : "border-gray-200 focus:border-entity-solid"
                                    }`}
                                />
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="type-overline text-gray-500">
                                {t("Priority", "Priorita", "Prioritás")}
                            </label>
                            <div className="grid grid-cols-3 gap-2 bg-gray-100 p-1 rounded-lg border border-gray-200">
                                {(["low", "medium", "high"] as const).map((prio) => (
                                    <button
                                        key={prio}
                                        type="button"
                                        onClick={() => update({ priority: prio })}
                                        className={`py-1.5 rounded-md type-overline transition-all disabled:cursor-not-allowed ${
                                            draft.priority === prio
                                                ? prio === "high"
                                                    ? "bg-rose-600 text-white"
                                                    : prio === "medium"
                                                      ? "bg-amber-500 text-white"
                                                      : "bg-gray-600 text-white"
                                                : "bg-white text-gray-500 hover:bg-gray-50"
                                        }`}
                                    >
                                        {taskPriorityLabel(prio, t)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="type-overline text-slate-500">
                                {t("Category", "Kategória", "Kategória")}
                            </label>
                            <CustomSelect
                                value={draft.category || ""}
                                disabled={!canEdit}
                                onChange={(v) => update({ category: v || null })}
                                options={taskCategoryOptions(t)}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="type-overline text-slate-500">
                                {t(
                                    "Assign Project Manager",
                                    "Priradiť projektového manažéra",
                                    "Projektmenedzser kijelölése",
                                )}
                            </label>
                            <CustomSelect
                                value={draft.assignedUsers?.[0] || ""}
                                disabled={!canEdit}
                                onChange={(v) => update({ assignedUsers: v ? [v] : [], owner: v })}
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
                            <label className="type-overline text-slate-500 flex items-center gap-1">
                                <FolderKanban className="h-3 w-3" />
                                {t("Project", "Projekt", "Projekt")}
                            </label>
                            <CustomSelect
                                searchable
                                value={draft.relatedProjectId || ""}
                                disabled={!canEdit}
                                onChange={(v) => update({ relatedProjectId: v || undefined })}
                                options={projectOptions}
                            />
                        </div>

                        {(agencyEnabled || Boolean(draft.relatedAgencyWorkerId)) && (
                            <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="type-overline text-slate-500 flex items-center gap-1">
                                        <UserCheck className="h-3 w-3 text-teal-600" />
                                        {t("Agency Worker / Rented Employee", "Agentúrny pracovník", "Kölcsönzött dolgozó")}
                                    </label>
                                    {draft.relatedAgencyWorkerId && draft.relatedAgencyWorkerId === (task as Task).relatedAgencyWorkerId && (
                                        <a
                                            href={`#agency/worker/${encodeURIComponent(draft.relatedAgencyWorkerId)}`}
                                            data-testid="task-drawer-agency-worker-link"
                                            className="group/worker type-overline text-teal-600 hover:text-teal-800 flex items-center gap-0.5 rounded focus-visible:outline-2 focus-visible:outline-offset-2 transition-colors"
                                        >
                                            {t("Open worker", "Otvoriť pracovníka", "Dolgozó megnyitása")}
                                            <ArrowUpRight className="h-3 w-3 transition-transform group-hover/worker:translate-x-px group-hover/worker:-translate-y-px" />
                                        </a>
                                    )}
                                </div>
                                <AgencyWorkerSelect
                                    value={draft.relatedAgencyWorkerId || ""}
                                    onChange={(v) =>
                                        update({
                                            relatedAgencyWorkerId: isTemplate ? (v || null) : (v || undefined),
                                        })
                                    }
                                    lang={systemLanguage}
                                    disabled={!canEdit}
                                    testId="task-drawer-agency-worker"
                                />
                            </div>
                        )}

                        {(tickets.length > 0 || resolvedTicketId) && (
                            <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="type-overline text-slate-500 flex items-center gap-1">
                                        <TicketIcon className="h-3 w-3 text-indigo-600" />
                                        {t("Support Ticket", "Podporný tiket", "Támogatási jegy")}
                                    </label>
                                    {resolvedTicketId && (
                                        <a
                                            href={`#tickets/${encodeURIComponent(linkedTicket?.id || resolvedTicketId)}`}
                                            data-testid="task-drawer-ticket-link"
                                            className="group/ticket type-overline text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 rounded focus-visible:outline-2 focus-visible:outline-offset-2 transition-colors"
                                        >
                                            {t("Open ticket", "Otvoriť tiket", "Jegy megnyitása")}
                                            {linkedTicket?.ticketNumber ? ` (${linkedTicket.ticketNumber})` : ""}
                                            <ArrowUpRight className="h-3 w-3 transition-transform group-hover/ticket:translate-x-px group-hover/ticket:-translate-y-px" />
                                        </a>
                                    )}
                                </div>
                                <CustomSelect
                                    searchable
                                    value={resolvedTicketId}
                                    disabled={!canEdit}
                                    onChange={(v) => update({ relatedTicketId: v || undefined })}
                                    options={ticketOptions}
                                />
                            </div>
                        )}

                        <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                                <label className="type-overline text-slate-500">
                                    {t("Link to Lead / Client", "Prepojiť s leadom / klientom", "Összekapcsolás leaddel / ügyféllel")}
                                </label>
                                {/* Straight to the linked lead, instead of hunting for
                                    it in the pipeline. Leaving the page drops unsaved
                                    edits, so it only shows once the link is saved. */}
                                {linkedLead && draft.relatedLeadId === task.relatedLeadId && (
                                    <a
                                        href={recordHref(linkedLead)}
                                        data-testid="task-drawer-lead-link"
                                        className="group/lead type-overline text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 rounded focus-visible:outline-2 focus-visible:outline-offset-2 transition-colors"
                                    >
                                        {isClientRecord(linkedLead)
                                            ? t("Open client", "Otvoriť klienta", "Ügyfél megnyitása")
                                            : t("Open lead", "Otvoriť lead", "Lead megnyitása")}
                                        <ArrowUpRight className="h-3 w-3 transition-transform group-hover/lead:translate-x-px group-hover/lead:-translate-y-px" />
                                    </a>
                                )}
                            </div>
                            <ClientSelect
                                leads={leads}
                                excludeIds={staleLeadIdsForTasks(
                                    leads,
                                    projects,
                                    leadStageGroups,
                                    leadStateParents,
                                    draft.relatedLeadId || task.relatedLeadId || undefined,
                                )}
                                value={draft.relatedLeadId || ""}
                                disabled={!canEdit}
                                onChange={(v) => {
                                    const leadId = v || undefined;
                                    setDraft((prev) => ({
                                        ...prev,
                                        relatedLeadId: leadId,
                                        isLocking: leadId ? prev.isLocking : false,
                                    }));
                                }}
                                showCity={false}
                                showKind
                                addKind="lead"
                                noneLabel={t("-- None --", "-- Žiadny --", "-- Nincs --")}
                            />
                        </div>

                        {draft.relatedLeadId && (
                            <div style={entityAccentStyle("leads")} className="p-3 rounded-lg bg-entity-subtle border border-entity-border flex items-center justify-between">
                                <span className="type-overline text-entity-text flex items-center gap-1">
                                    <Lock className="h-3 w-3" />{" "}
                                    {t("Block Pipeline Stage", "Zablokovať fázu pipeline", "Folyamat szakasz zárolása")}
                                </span>
                                <input
                                    type="checkbox"
                                    checked={draft.isLocking || false}
                                    onChange={(e) => update({ isLocking: e.target.checked })}
                                    className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed accent-entity-solid"
                                />
                            </div>
                        )}
                    </fieldset>

                        <div style={entityAccentStyle("time_tracking")} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                            <div className="type-label mb-2 flex items-center gap-1.5 text-gray-700">
                                <Timer className="size-4 shrink-0 text-entity-text" />
                                {t("Time tracking", "Evidencia času", "Időkövetés")}
                                {!isTemplate && <TaskAddTimeLink task={draft} projects={projects} leads={leads} />}
                            </div>
                            {!isTemplate && (
                                <>
                                    <TaskTimeControls
                                        task={draft}
                                        projects={projects}
                                        leads={leads}
                                        onSaveProject={(_id, projectId) => update({ relatedProjectId: projectId })}
                                    />
                                    <TaskTimeBreakdown taskId={draft.id} users={users} />
                                </>
                            )}
                            <label className="mt-3 grid gap-1">
                                <span className="type-overline text-gray-500">{t("Estimate (minutes)", "Odhad (minúty)", "Becslés (perc)")}</span>
                                <input
                                    type="number"
                                    min={0}
                                    disabled={!canEdit}
                                    value={draft.estimateMinutes ?? ""}
                                    onChange={(e) => update({ estimateMinutes: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
                                    className="h-10 w-28 rounded-md border border-gray-200 bg-white px-3 text-ui tabular-nums outline-none focus:border-entity-solid disabled:opacity-60"
                                />
                            </label>
                        </div>

                        {!isClickUp && (
                            <TaskEmailReminderField
                                task={draft}
                                onChange={(emailReminders) => update({ emailReminders })}
                                currentUserName={currentUserName}
                                users={users}
                                systemLanguage={systemLanguage}
                                t={t}
                                disabled={!canEdit}
                                mailConfigured={mailConfigured}
                            />
                        )}

                        {storedTask && taskCreatedDate(storedTask) && (
                            <p className="type-meta font-medium text-gray-400" data-testid="task-created-on">
                                {t("Created on", "Vytvorené", "Létrehozva")}{" "}
                                <span className="font-semibold text-gray-500">
                                    {formatDeadlineDate(taskCreatedDate(storedTask), systemLanguage)}
                                    {/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(storedTask.createdAt ?? "") && `, ${(storedTask.createdAt as string).slice(11, 16)}`}
                                </span>
                                {storedTask.createdBy ? <> · <span className="font-semibold text-gray-500">{storedTask.createdBy}</span></> : null}
                            </p>
                        )}
                    </div>

                    {!isClickUp && (
                    <div className="shrink-0 border-t border-gray-200 bg-gray-50/90 px-6 py-4 space-y-2">
                        <button
                            type="submit"
                            className="w-full py-2.5 bg-entity-solid hover:opacity-90 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 text-white rounded-md font-semibold text-ui shadow-xs transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!canEdit}
                        >
                            {t("Save Changes", "Uložiť zmeny", "Módosítások mentése")}
                        </button>

                        {((draft.id && canArchive && !isTemplate && onToggleArchive) || (draft.id && canDelete && (onDelete || onDeleteOccurrence))) && (
                            <div className="flex items-center gap-2 [&>*]:flex-1">
                                {draft.id && canArchive && !isTemplate && onToggleArchive && (() => {
                                    // Both parents flip only the stored task's flag, so
                                    // edits made in the drawer before archiving were
                                    // dropped without a word. Keep them first.
                                    const toggleArchive = () => {
                                        if (canEdit && draft.title.trim() && !finishingWithoutConclusion && JSON.stringify(draft) !== JSON.stringify(task)) {
                                            onSave(withDeadlineHistory({
                                                ...draft,
                                                requiresConclusion: (!canUntick && task.requiresConclusion)
                                                    ? true
                                                    : (draft.requiresConclusion ? true : undefined),
                                                tags: combinedTags,
                                            }));
                                        }
                                        onToggleArchive(draft);
                                        requestClose();
                                    };
                                    const buttonClass = "w-full py-2 px-2 border border-gray-200 bg-white hover:bg-gray-50 active:scale-[0.98] text-gray-700 rounded-md type-overline flex items-center justify-center gap-1.5 transition-all";
                                    // Unarchiving is a plain click; only archiving needs the hold.
                                    return draft.archived ? (
                                        <button type="button" onClick={toggleArchive} className={`${buttonClass} cursor-pointer`}>
                                            <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                                            {t("Unarchive Task", "Zrušiť archiváciu úlohy", "Feladat archiválásának visszavonása")}
                                        </button>
                                    ) : (
                                        <HoldToConfirmButton
                                            tone="archive"
                                            lang={systemLanguage}
                                            what={draft.title}
                                            onConfirm={toggleArchive}
                                            className={buttonClass}
                                            icon={<ArchiveIcon className="h-3.5 w-3.5 shrink-0" />}
                                        >
                                            {t("Archive Task", "Archivovať úlohu", "Feladat archiválása")}
                                        </HoldToConfirmButton>
                                    );
                                })()}

                                {draft.id && canDelete && !isTemplate && Boolean((task as Task).recurringSourceId) && onDeleteOccurrence ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setOccurrenceDeleteDialogOpen(true)}
                                            className="w-full py-2 px-2 border border-rose-200 bg-white hover:bg-rose-50 active:scale-[0.98] text-rose-600 rounded-md type-overline flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                                        >
                                            <Trash2 className="h-3.5 w-3.5 shrink-0" />
                                            {t("Delete Task", "Odstrániť úlohu", "Feladat törlése")}
                                        </button>
                                        <RecurringOccurrenceDeleteDialog
                                            task={occurrenceDeleteDialogOpen ? (task as Task) : null}
                                            onChoice={(c) => {
                                                setOccurrenceDeleteDialogOpen(false);
                                                if (c !== "cancel") {
                                                    onDeleteOccurrence(task as Task, c);
                                                    requestClose();
                                                }
                                            }}
                                            t={t}
                                        />
                                    </>
                                ) : draft.id && canDelete && onDelete && (
                                    <HoldToConfirmButton
                                        tone="danger"
                                        lang={systemLanguage}
                                        what={draft.title}
                                        onConfirm={async () => {
                                            const deleted = await onDelete(draft);
                                            if (deleted) requestClose();
                                        }}
                                        className="w-full py-2 px-2 border border-rose-200 bg-white hover:bg-rose-50 active:scale-[0.98] text-rose-600 rounded-md type-overline flex items-center justify-center gap-1.5 transition-all"
                                        icon={<Trash2 className="h-3.5 w-3.5 shrink-0" />}
                                    >
                                        {t("Delete Task", "Odstrániť úlohu", "Feladat törlése")}
                                    </HoldToConfirmButton>
                                )}
                            </div>
                        )}
                    </div>
                    )}
                </form>
                </div>
                {showChatPane && (chatOpen || mobileTab === "activity") && (
                    <div
                        className={`w-full lg:w-96 xl:w-105 min-h-0 flex-1 lg:flex-none lg:h-full lg:border-l border-gray-200 flex-col ${
                            mobileTab === "activity" ? "flex" : "hidden"
                        } ${chatOpen ? "lg:flex" : "lg:hidden"}`}
                    >
                        <TaskActivityPanel
                            task={draft}
                            users={users}
                            currentUserName={currentUserName}
                            currentUserRole={effectiveUser.role}
                            systemLanguage={systemLanguage}
                            taskStates={taskStates}
                            taskStateColors={taskStateColors}
                            mentionEntities={mentionEntities}
                            onTagClick={onTagClick}
                            onTaskMetaChange={handleTaskMetaChange}
                            canEdit={canEdit && !isTemplate}
                            filesRefreshKey={filesRefreshKey}
                            onInsertFileIntoDescription={canEdit && !isTemplate ? handleInsertFileIntoDescription : undefined}
                            onPreviewFile={setPreviewFile}
                            onCollapse={() => {
                                setChatOpen(false);
                                setChatExpandedPref(false);
                            }}
                        />
                    </div>
                )}
            </div>
            <TaskDescriptionFullscreenModal
                open={fullscreenDescOpen}
                title={draft.title}
                taskId={isTemplate ? "" : draft.id}
                description={draft.description}
                systemLanguage={systemLanguage}
                currentUserName={currentUserName}
                currentUserRole={effectiveUser.role}
                canEdit={canEdit}
                filesRefreshKey={filesRefreshKey}
                insertFileSignal={fullscreenDescOpen ? insertFileSignal : null}
                onInsertFileHandled={handleInsertFileHandled}
                onChangeDescription={(blocks) => update({ description: serializeTaskDescription(blocks) })}
                onUploadFile={canEdit && !isTemplate && draft.id ? handleDescriptionFileUpload : undefined}
                onPreviewFile={setPreviewFile}
                onInsertIntoDescription={canEdit && !isTemplate ? handleInsertFileIntoDescription : undefined}
                onFilesChanged={({ fileCount }) => {
                    if (draft.id && !isTemplate) {
                        handleTaskMetaChange(draft.id, { fileCount });
                    }
                }}
                onClose={() => {
                    setFullscreenDescOpen(false);
                    setDescVersion((v) => v + 1);
                }}
            />
            <TaskFilePreviewModal
                file={previewFile}
                systemLanguage={systemLanguage}
                onClose={() => setPreviewFile(null)}
            />
        </div>,
        document.body,
    );
};
