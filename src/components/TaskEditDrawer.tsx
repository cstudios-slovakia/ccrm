import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    Archive as ArchiveIcon,
    CheckSquare,
    FolderKanban,
    Lock,
    RotateCcw,
    Trash2,
    X,
} from "lucide-react";
import type { Lead, Project, Task, UserProfile } from "../types";
import type { Language } from "../utils/translations";
import { CustomSelect, type DropdownOption } from "./ui/CustomSelect";
import { ClientSelect } from "./ui/ClientSelect";
import { projectDisplayName } from "../utils/projects";
import { isDoneTaskState, localStampStr } from "../utils/projectTasks";
import { taskPriorityLabel, taskStateLabel, type Translate } from "../utils/taskLabels";

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
                    className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-indigo-600 focus:outline-none bg-white font-bold disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
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
    task: Task;
    leads: Lead[];
    projects?: Project[];
    users: UserProfile[];
    taskStates: string[];
    systemLanguage: Language;
    /** Recorded as `completedBy` when the status is moved to a done state here. */
    currentUserName: string;
    /** Off, the drawer still opens but every field is read-only. */
    canEdit: boolean;
    canArchive?: boolean;
    canDelete?: boolean;
    onSave: (task: Task) => void;
    onToggleArchive?: (task: Task) => void;
    /** Resolves true once the task is really gone; the drawer only closes then. */
    onDelete?: (task: Task) => Promise<boolean>;
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
    users,
    taskStates,
    systemLanguage,
    currentUserName,
    canEdit,
    canArchive = false,
    canDelete = false,
    onSave,
    onToggleArchive,
    onDelete,
    onClose,
}) => {
    const t: Translate = (en, sk, hu) =>
        systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;
    const [draft, setDraft] = useState<Task>(task);
    const [isClosing, setIsClosing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
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

    const update = (patch: Partial<Task>) => setDraft((prev) => ({ ...prev, ...patch }));

    // A task can point at a project the viewer's list no longer has (deleted in
    // another session); keep it pickable rather than silently showing "None".
    const projectOptions = taskProjectOptions(projects, leads, t);
    if (draft.relatedProjectId && !projects.some((p) => p.id === draft.relatedProjectId)) {
        projectOptions.push({
            value: draft.relatedProjectId,
            label: t("Removed project", "Odstránený projekt", "Törölt projekt"),
        });
    }

    if (typeof document === "undefined") return null;

    return createPortal(
        <div className="fixed inset-0 z-[100000] flex justify-end">
            <div
                onClick={requestClose}
                className={`absolute inset-0 bg-slate-900/40 backdrop-blur-sm ${isClosing ? "animate-fade-out" : "animate-fade-in"}`}
            />
            <div
                className={`relative w-full max-w-md bg-white shadow-2xl h-full flex flex-col p-6 overflow-y-auto ${isClosing ? "animate-slide-out-right" : "animate-slide-in-right"}`}
            >
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <CheckSquare className="h-5 w-5 text-indigo-600" />
                        {canEdit
                            ? t("Edit Task", "Upraviť úlohu", "Feladat szerkesztése")
                            : t("View Task", "Zobraziť úlohu", "Feladat megtekintése")}
                    </h2>
                    <button
                        type="button"
                        onClick={requestClose}
                        className="p-1 hover:bg-slate-100 active:scale-95 rounded-lg text-slate-400 transition-all cursor-pointer"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!canEdit) return;
                        onSave(draft);
                        requestClose();
                    }}
                    className="flex-1 py-5 space-y-5 text-xs font-bold"
                >
                    <fieldset disabled={!canEdit} className="space-y-5 min-w-0">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase">
                                {t("Task Title", "Názov", "Cím")}
                            </label>
                            <input
                                type="text"
                                required
                                maxLength={255}
                                value={draft.title}
                                onChange={(e) => update({ title: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-indigo-600 focus:outline-none disabled:bg-slate-50"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase">
                                {t("Description", "Popis", "Leírás")}
                            </label>
                            <textarea
                                rows={3}
                                value={draft.description}
                                onChange={(e) => update({ description: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-indigo-600 focus:outline-none resize-none disabled:bg-slate-50"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase">
                                {t("Start Date", "Dátum začiatku", "Kezdő dátum")}
                            </label>
                            <input
                                type="date"
                                value={draft.startDate || ""}
                                onChange={(e) => update({ startDate: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-indigo-600 focus:outline-none disabled:bg-slate-50"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase">
                                    {t("Deadline Date", "Termín", "Határidő")}
                                </label>
                                <input
                                    type="date"
                                    required
                                    value={draft.deadline}
                                    onChange={(e) => update({ deadline: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-indigo-600 focus:outline-none disabled:bg-slate-50"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase">
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

                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase">
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
                                options={taskStates.map((st) => ({ value: st, label: taskStateLabel(st, t) }))}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">
                                {t("Priority", "Priorita", "Prioritás")}
                            </label>
                            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-1.5 rounded-xl border-2 border-slate-200">
                                {(["low", "medium", "high"] as const).map((prio) => (
                                    <button
                                        key={prio}
                                        type="button"
                                        onClick={() => update({ priority: prio })}
                                        className={`py-2 rounded-lg font-black text-[9px] uppercase transition-all disabled:cursor-not-allowed ${
                                            draft.priority === prio
                                                ? prio === "high"
                                                    ? "bg-rose-600 text-white"
                                                    : prio === "medium"
                                                      ? "bg-amber-500 text-white"
                                                      : "bg-slate-600 text-white"
                                                : "bg-white text-slate-500 hover:bg-slate-100"
                                        }`}
                                    >
                                        {taskPriorityLabel(prio, t)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase">
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
                            <label className="text-[9px] font-black text-slate-500 uppercase flex items-center gap-1">
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

                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase">
                                {t("Link to Lead/Client", "Prepojiť so záujemcom", "Összekapcsolás ügyféllel")}
                            </label>
                            <ClientSelect
                                leads={leads}
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
                                addKind="lead"
                                noneLabel={t("-- None --", "-- Žiadny --", "-- Nincs --")}
                            />
                        </div>

                        {draft.relatedLeadId && (
                            <div className="p-3 rounded-xl bg-violet-50/50 border border-violet-100 flex items-center justify-between">
                                <span className="text-[10px] font-black text-violet-700 uppercase flex items-center gap-1">
                                    <Lock className="h-3 w-3" />{" "}
                                    {t("Block Pipeline Stage", "Zablokovať fázu pipeline", "Folyamat szakasz zárolása")}
                                </span>
                                <input
                                    type="checkbox"
                                    checked={draft.isLocking || false}
                                    onChange={(e) => update({ isLocking: e.target.checked })}
                                    className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
                                />
                            </div>
                        )}
                    </fieldset>

                    <button
                        type="submit"
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-indigo-600/20 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!canEdit}
                    >
                        {t("Save Changes", "Uložiť zmeny", "Módosítások mentése")}
                    </button>

                    {draft.id && canArchive && onToggleArchive && (
                        <button
                            type="button"
                            onClick={() => {
                                onToggleArchive(draft);
                                requestClose();
                            }}
                            className="w-full py-2.5 border-2 border-slate-200 hover:bg-slate-50 active:scale-[0.98] text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                        >
                            {draft.archived ? (
                                <>
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    {t("Unarchive Task", "Zrušiť archiváciu úlohy", "Feladat archiválásának visszavonása")}
                                </>
                            ) : (
                                <>
                                    <ArchiveIcon className="h-3.5 w-3.5" />
                                    {t("Archive Task", "Archivovať úlohu", "Feladat archiválása")}
                                </>
                            )}
                        </button>
                    )}

                    {draft.id && canDelete && onDelete && (
                        <button
                            type="button"
                            disabled={isDeleting}
                            onClick={async () => {
                                setIsDeleting(true);
                                const deleted = await onDelete(draft);
                                setIsDeleting(false);
                                if (deleted) requestClose();
                            }}
                            className="w-full py-2.5 border-2 border-rose-100 hover:bg-rose-50 active:scale-[0.98] text-rose-600 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all disabled:cursor-wait disabled:opacity-60"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t("Delete Task", "Odstrániť úlohu", "Feladat törlése")}
                        </button>
                    )}
                </form>
            </div>
        </div>,
        document.body,
    );
};
