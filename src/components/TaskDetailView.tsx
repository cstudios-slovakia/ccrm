import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive as ArchiveIcon,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckSquare,
  Copy,
  FolderKanban,
  Hash,
  Lock,
  RotateCcw,
  Save,
  Ticket as TicketIcon,
  Timer,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import type { Lead, Project, Task, TaskFile, Ticket, UserProfile } from "../types";
import type { Language } from "../utils/translations";
import { taskPriorityLabel, taskStateLabel, type Translate } from "../utils/taskLabels";
import { taskCategoryOptions } from "../utils/taskCategory";
import { projectDisplayName } from "../utils/projects";
import { isClientRecord, recordHref } from "../utils/clientRecord";
import { staleLeadIdsForTasks } from "../utils/taskLeadPicker";
import { isDoneTaskState, localStampStr } from "../utils/projectTasks";
import {
  canArchiveTask,
  canDeleteTask,
  canEditTask,
  canViewTask,
  isTaskCreatedBy,
  type TaskAccess,
} from "../utils/taskSelectors";
import { archiveTasksWithUndo, deleteTasksWithUndo } from "../utils/taskActions";
import { clampDeadline, deadlineChange, minDeadlineFor, taskCreatedDate } from "../utils/taskDeadline";
import { CONCLUSION_MAX, cleanConclusion, canUntickConclusion, needsConclusionToFinish } from "../utils/taskConclusion";
import { entityAccentStyle } from "../utils/entityAccent";
import { isClickUpTask } from "../utils/clickupTasks";
import {
  blockNotesToPlainText,
  parseNotesToBlocks,
  removeTagFromDescription,
  serializeTaskDescription,
} from "../utils/blockNotes";
import { uploadTaskFile } from "../utils/taskFilesApi";
import { useTaskSettings } from "../hooks/useTaskSettings";
import { BlockEditor } from "./BlockEditor";
import { extractTagsFromText, type MentionEntity } from "./TaskPillText";
import { TaskTagMentionInput } from "./TaskTagMentionInput";
import { TaskConclusionToggle } from "./TaskConclusionToggle";
import { DeadlinePostponedBadge, QuickDeadlineChips, formatDeadlineDate } from "./TaskDeadlineExtras";
import { TaskEmailReminderField } from "./TaskEmailReminderField";
import { DeadlineTimePicker, taskProjectOptions } from "./TaskEditDrawer";
import { TaskWhatsAppMarks } from "./WhatsAppChip";
import { ClickUpTaskBadge } from "./projects/ClickUpTaskBadge";
import { AgencyWorkerSelect } from "./agency/AgencyWorkerSelect";
import { CustomSelect, type DropdownOption } from "./ui/CustomSelect";
import { ClientSelect } from "./ui/ClientSelect";
import { HoldToConfirmButton } from "./ui/HoldToConfirm";
import { TaskAddTimeLink, TaskTimeControls } from "./timeTracking/TaskTimeControls";
import { TaskTimeBreakdown } from "./timeTracking/TaskTimeBreakdown";
import { TaskActivityPanel } from "./tasks/TaskActivityPanel";
import { TaskDescriptionFullscreenModal } from "./tasks/TaskDescriptionFullscreenModal";
import { TaskFilePreviewModal } from "./tasks/TaskFilePreviewModal";

interface TaskDetailViewProps {
  taskId: string;
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  leads: Lead[];
  projects: Project[];
  tickets: Ticket[];
  users: UserProfile[];
  taskStates: string[];
  taskStateColors?: Record<string, string>;
  systemLanguage: Language;
  currentUser?: UserProfile;
  taskAccess: TaskAccess;
  mailConfigured?: boolean;
  agencyEnabled?: boolean;
  leadStageGroups?: Record<string, string>;
  leadStateParents?: Record<string, string>;
  onBackToTasks: () => void;
}

export const TaskDetailView: React.FC<TaskDetailViewProps> = ({
  taskId,
  tasks,
  setTasks,
  leads,
  projects,
  tickets,
  users,
  taskStates,
  taskStateColors = {},
  systemLanguage,
  currentUser,
  taskAccess,
  mailConfigured,
  agencyEnabled = false,
  leadStageGroups,
  leadStateParents,
  onBackToTasks,
}) => {
  const t: Translate = (en, sk, hu) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  const task = useMemo(
    () => tasks.find((tk) => String(tk.id) === String(taskId)),
    [tasks, taskId],
  );

  const currentUserName = currentUser?.name || "";
  const isVisible = Boolean(
    task &&
      taskAccess.view &&
      (canViewTask(task, currentUser, taskAccess.viewAll) || isTaskCreatedBy(task, currentUserName)),
  );

  const [draft, setDraft] = useState<Task | null>(task ?? null);
  const [descVersion, setDescVersion] = useState(0);
  const [filesRefreshKey, setFilesRefreshKey] = useState(0);
  const [insertFileSignal, setInsertFileSignal] = useState<{ nonce: number; file: TaskFile } | null>(null);
  const [fullscreenDescOpen, setFullscreenDescOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<TaskFile | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [conclusionMissing, setConclusionMissing] = useState(false);
  const conclusionRef = useRef<HTMLTextAreaElement>(null);
  const { offerConclusion } = useTaskSettings();

  useEffect(() => {
    setDraft(task ?? null);
    setDescVersion((v) => v + 1);
    setConclusionMissing(false);
  }, [task?.id]);

  // Keep live comment/reaction/file counters synced into the draft even while editing other fields
  useEffect(() => {
    if (!task) return;
    setDraft((prev) =>
      prev && prev.id === task.id
        ? {
            ...prev,
            commentCount: task.commentCount,
            reactions: task.reactions,
            fileCount: task.fileCount,
            archived: task.archived,
          }
        : prev,
    );
  }, [task?.id, task?.commentCount, task?.reactions, task?.fileCount, task?.archived]);

  const effectiveUser = useMemo<Pick<UserProfile, "name" | "role">>(
    () => currentUser ?? users.find((u) => u.name === currentUserName) ?? { name: currentUserName, role: "" },
    [currentUser, users, currentUserName],
  );

  const handleTaskMetaChange = useCallback(
    (id: string, patch: { commentCount?: number; reactions?: Record<string, string[]> | null; fileCount?: number }) => {
      setDraft((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ccrm-task-meta-patch", { detail: { taskId: id, ...patch } }));
      }
    },
    [],
  );

  const isClickUp = task ? isClickUpTask(task) : false;
  const canEdit = Boolean(task && !isClickUp && canEditTask(task, currentUser, taskAccess));
  const canArchive = Boolean(task && !isClickUp && canArchiveTask(task, currentUser));
  const canDelete = Boolean(task && !isClickUp && canDeleteTask(task, currentUser, taskAccess));

  const handleDescriptionFileUpload = useCallback(
    async (file: File): Promise<TaskFile | null> => {
      if (!task || !canEdit) return null;
      try {
        const res = await uploadTaskFile(task.id, file);
        setFilesRefreshKey((k) => k + 1);
        handleTaskMetaChange(task.id, { fileCount: res.fileCount });
        return res.file;
      } catch (err) {
        (window as any).showToast?.(
          err instanceof Error
            ? err.message
            : t("File upload failed.", "Nahrávanie súboru zlyhalo.", "Fájlfeltöltés sikertelen."),
          "error",
        );
        return null;
      }
    },
    [task?.id, canEdit, handleTaskMetaChange],
  );

  const handleInsertFileIntoDescription = useCallback((file: TaskFile) => {
    setInsertFileSignal({ nonce: Date.now() + Math.random(), file });
  }, []);
  const handleInsertFileHandled = useCallback((nonce: number) => {
    setInsertFileSignal((prev) => (prev?.nonce === nonce ? null : prev));
  }, []);

  const mentionEntities: MentionEntity[] = useMemo(() => {
    const list: MentionEntity[] = [];
    users.forEach((u) => {
      list.push({ id: u.name, name: u.name, type: "user", detail: u.role || "Team member" });
    });
    projects.forEach((p) => {
      const name = projectDisplayName(p, leads, t("Untitled project", "Projekt bez názvu", "Névtelen projekt"));
      list.push({ id: p.id, name, type: "project", detail: p.status || "Project" });
    });
    leads.forEach((l) => {
      if (isClientRecord(l)) {
        list.push({ id: l.id, name: l.name, type: "client", detail: l.city || "Client" });
      } else {
        list.push({ id: l.id, name: l.name, type: "lead", detail: l.status || "Lead" });
      }
    });
    return list;
  }, [users, projects, leads, systemLanguage]);

  if (!task || !draft || !isVisible) {
    return (
      <div style={entityAccentStyle("tasks")} data-testid="task-detail-not-found" className="max-w-3xl mx-auto py-16 px-4 text-center space-y-4">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-entity-subtle text-entity-text border border-entity-border flex items-center justify-center">
          <CheckSquare className="h-7 w-7" />
        </div>
        <h1 className="type-page-title text-gray-900">
          {t("Task not found", "Úloha sa nenašla", "A feladat nem található")}
        </h1>
        <p className="text-ui text-gray-500">
          {t(
            "This task may have been deleted or you do not have permission to view it.",
            "Táto úloha mohla byť odstránená alebo na jej zobrazenie nemáte oprávnenie.",
            "Ezt a feladatot törölhették, vagy nincs jogosultsága a megtekintéséhez.",
          )}
        </p>
        <button
          type="button"
          onClick={onBackToTasks}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-entity-solid text-white text-ui font-semibold hover:opacity-90 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t("Back to Tasks", "Späť na úlohy", "Vissza a feladatokhoz")}</span>
        </button>
      </div>
    );
  }

  const update = (patch: Partial<Task>) =>
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));

  const combinedTags = Array.from(
    new Set([
      ...(draft.tags || []),
      ...extractTagsFromText(draft.title),
      ...extractTagsFromText(blockNotesToPlainText(draft.description)),
    ]),
  );

  const canUntick = canUntickConclusion(task, effectiveUser);
  const conclusionToggleDisabled = !canEdit || (!canUntick && Boolean(task.requiresConclusion));
  const finishingWithoutConclusion = needsConclusionToFinish(
    { ...task, requiresConclusion: draft.requiresConclusion, conclusion: draft.conclusion },
    draft.status,
    taskStates,
  );
  const draftIsDone = isDoneTaskState(draft.status, taskStates);
  const showConclusion = Boolean(draft.requiresConclusion) && (draftIsDone || Boolean(draft.conclusion?.trim()));
  const minDeadline = minDeadlineFor(task);
  const draftPostpones = Boolean(draft.deadline && task.deadline && draft.deadline > task.deadline);

  const projectOptions = taskProjectOptions(projects, leads, t);
  if (draft.relatedProjectId && !projects.some((p) => p.id === draft.relatedProjectId)) {
    projectOptions.push({
      value: draft.relatedProjectId,
      label: t("Removed project", "Odstránený projekt", "Törölt projekt"),
    });
  }

  const resolvedTicketId = draft.relatedTicketId ?? task.relatedTicketId ?? "";
  const linkedTicket = resolvedTicketId
    ? tickets.find(
        (tk) =>
          String(tk.id) === String(resolvedTicketId) ||
          (tk.ticketNumber || "").toLowerCase() === resolvedTicketId.toLowerCase(),
      )
    : undefined;
  const ticketOptions: DropdownOption[] = [
    { value: "", label: t("-- None --", "-- Žiadny --", "-- Nincs --") },
    ...tickets.map((tk) => ({
      value: tk.id,
      label: `${tk.ticketNumber} — ${tk.subject || tk.title || ""}`,
    })),
  ];
  const linkedLead = draft.relatedLeadId
    ? leads.find((l) => String(l.id) === String(draft.relatedLeadId))
    : undefined;

  const isDirty = JSON.stringify(draft) !== JSON.stringify(task);

  const handleSave = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canEdit) return;
    if (!draft.title.trim()) {
      (window as any).showToast?.(
        t("Task title is required.", "Názov úlohy je povinný.", "A feladat címe kötelező."),
        "warning",
      );
      return;
    }
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
      !canUntick && task.requiresConclusion ? true : draft.requiresConclusion ? true : undefined;
    const nextTask: Task = {
      ...draft,
      ...deadlineChange(task, draft.deadline),
      requiresConclusion: sanitizedRequiresConclusion,
      conclusion: cleanConclusion(draft.conclusion ?? ""),
      tags: combinedTags,
    };
    setTasks((prev) => prev.map((tk) => (tk.id === nextTask.id ? nextTask : tk)));
    setDraft(nextTask);
    (window as any).showToast?.(
      t("Task saved", "Úloha uložená", "Feladat elmentve"),
      "success",
    );
  };

  const handleAssignEntity = (entity: MentionEntity) => {
    if (entity.type === "user") {
      const currentUsers = draft.assignedUsers || [];
      if (!currentUsers.includes(entity.id)) {
        update({ assignedUsers: [...currentUsers, entity.id], owner: draft.owner || entity.id });
      }
    } else if (entity.type === "project") {
      update({ relatedProjectId: entity.id });
    } else if (entity.type === "client" || entity.type === "lead") {
      update({ relatedLeadId: entity.id });
    }
  };

  const statusColor = taskStateColors[draft.status] || "#64748b";
  const hashHref = `#task-${encodeURIComponent(task.id)}`;

  return (
    <div style={entityAccentStyle("tasks")} data-testid="task-detail-view" className="w-full px-4 sm:px-6 py-4 sm:py-6 space-y-5">
      {/* Top sticky-style bar */}
      <div className="bg-white rounded-2xl border border-gray-200 px-4 sm:px-5 py-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center flex-wrap gap-2.5 min-w-0">
          <button
            type="button"
            data-testid="task-detail-back-btn"
            onClick={onBackToTasks}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-caption font-semibold text-gray-700 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t("Back to Tasks", "Späť na úlohy", "Vissza a feladatokhoz")}</span>
          </button>
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-micro font-bold border border-gray-200 bg-gray-50 text-gray-800"
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
            <span>{taskStateLabel(draft.status, t)}</span>
          </span>
          {draft.archived && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-micro font-bold">
              {t("Archived", "Archivované", "Archivált")}
            </span>
          )}
          {isClickUp && (
            <ClickUpTaskBadge task={task} showListName showLink userLanguage={systemLanguage} />
          )}
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            data-testid="task-detail-copy-link-btn"
            onClick={async () => {
              const fullUrl =
                typeof window !== "undefined"
                  ? `${window.location.origin}${window.location.pathname}${hashHref}`
                  : hashHref;
              try {
                await navigator.clipboard.writeText(fullUrl);
                setCopiedLink(true);
                window.setTimeout(() => setCopiedLink(false), 1800);
              } catch {
                // ignore
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-caption font-semibold text-gray-700 cursor-pointer"
          >
            {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedLink ? t("Copied link", "Odkaz skopírovaný", "Link másolva") : t("Copy link", "Kopírovať odkaz", "Link másolása")}</span>
          </button>

          {canArchive && (
            draft.archived ? (
              <button
                type="button"
                onClick={() => {
                  const next = { ...draft, archived: false };
                  setTasks((prev) => prev.map((tk) => (tk.id === next.id ? next : tk)));
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-caption font-semibold text-gray-700 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{t("Unarchive", "Obnoviť", "Visszaállítás")}</span>
              </button>
            ) : (
              <HoldToConfirmButton
                tone="archive"
                lang={systemLanguage}
                what={draft.title}
                onConfirm={() =>
                  archiveTasksWithUndo({ targets: [task], setTasks, lang: systemLanguage })
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-caption font-semibold text-gray-700"
                icon={<ArchiveIcon className="h-3.5 w-3.5" />}
              >
                {t("Archive", "Archivovať", "Archiválás")}
              </HoldToConfirmButton>
            )
          )}

          {canDelete && (
            <HoldToConfirmButton
              tone="danger"
              lang={systemLanguage}
              what={draft.title}
              onConfirm={() => {
                deleteTasksWithUndo({
                  allTasks: tasks,
                  targets: [task],
                  setTasks,
                  lang: systemLanguage,
                  onApplied: onBackToTasks,
                });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-caption font-semibold text-rose-600"
              icon={<Trash2 className="h-3.5 w-3.5" />}
            >
              {t("Delete", "Odstrániť", "Törlés")}
            </HoldToConfirmButton>
          )}

          {!isClickUp && (
            <button
              type="button"
              data-testid="task-detail-save-btn"
              disabled={!canEdit}
              onClick={() => handleSave()}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-caption font-semibold shadow-2xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isDirty
                  ? "bg-entity-solid text-white hover:opacity-90"
                  : "bg-entity-solid/90 text-white hover:opacity-100"
              }`}
            >
              <Save className="h-3.5 w-3.5" />
              <span>{t("Save Changes", "Uložiť zmeny", "Módosítások mentése")}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main 2-column grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-5 items-start">
        {/* Left column */}
        <form onSubmit={handleSave} className="space-y-5 min-w-0">
          {/* Title & Description Card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="space-y-1.5">
              <label className="type-overline text-gray-500 flex items-center justify-between gap-2">
                <span>{t("Task Title", "Názov úlohy", "Feladat címe")}</span>
                <span className="text-micro font-normal text-entity-text">
                  {t("Use # for tags · @ for assigning", "Použite # pre tagy · @ pre priradenie", "Használjon # jelet címkékhez · @ hozzárendeléshez")}
                </span>
              </label>
              <TaskTagMentionInput
                value={draft.title}
                disabled={!canEdit}
                maxLength={255}
                onChange={(val) => update({ title: val })}
                existingTags={combinedTags}
                onTagAdded={(tag) => {
                  const current = draft.tags || [];
                  if (!current.includes(tag)) update({ tags: [...current, tag] });
                }}
                mentionEntities={mentionEntities}
                onAssignEntity={handleAssignEntity}
                placeholder={t("Task title…", "Názov úlohy…", "Feladat címe…")}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-entity-solid focus:outline-none text-title font-heading font-bold text-gray-900 disabled:bg-gray-50"
                required
              />
            </div>

            {combinedTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {combinedTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md type-overline bg-entity-subtle text-entity-text border border-entity-border"
                  >
                    <Hash className="h-2.5 w-2.5 opacity-70" />
                    <span>{tag}</span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          const tagRegex = new RegExp(`#${tag}\\b`, "gi");
                          setDescVersion((v) => v + 1);
                          update({
                            tags: (draft.tags || []).filter((tItem) => tItem !== tag),
                            title: draft.title.replace(tagRegex, "").trim(),
                            description: removeTagFromDescription(draft.description, tag),
                          });
                        }}
                        className="hover:text-rose-600 ml-0.5 cursor-pointer"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="type-overline text-gray-500 flex items-center justify-between gap-2">
                <span>{t("Description", "Popis", "Leírás")}</span>
                <span className="text-micro font-normal text-entity-text text-right">
                  {t("Type '/' for blocks & /file · drag-drop or paste files", "Napíšte '/' pre bloky a /file · presuňte alebo vložte súbory", "Írjon '/' jelet a blokkokhoz és /file-hoz")}
                </span>
              </label>
              <div className="rounded-xl border border-gray-200 p-4 sm:pl-14 bg-white min-h-[18rem] focus-within:border-entity-solid focus-within:ring-2 focus-within:ring-entity-ring transition-colors">
                <BlockEditor
                  key={`detail-${draft.id}-${descVersion}`}
                  fillHeight
                  readOnly={!canEdit}
                  initialBlocks={parseNotesToBlocks(draft.description)}
                  onChange={(blocks) => update({ description: serializeTaskDescription(blocks) })}
                  systemLanguage={systemLanguage}
                  exportTitle={draft.title}
                  onUploadFile={canEdit ? handleDescriptionFileUpload : undefined}
                  onPreviewFile={setPreviewFile}
                  insertFileSignal={!fullscreenDescOpen ? insertFileSignal : null}
                  onInsertFileHandled={handleInsertFileHandled}
                  onOpenFullscreen={() => {
                    setInsertFileSignal(null);
                    setFullscreenDescOpen(true);
                  }}
                  placeholder={t(
                    "Write detailed task notes... (type '/' for blocks or /file)",
                    "Napíšte podrobný popis úlohy... (napíšte '/' pre bloky alebo /file)",
                    "Írja be a részletes leírást... ('/' a blokkokhoz vagy /file)",
                  )}
                />
              </div>
            </div>

            {(offerConclusion || draft.requiresConclusion) && (
              <TaskConclusionToggle
                checked={Boolean(draft.requiresConclusion)}
                onChange={(next) => {
                  if (!next && !canUntick && task.requiresConclusion) return;
                  update({ requiresConclusion: next || undefined });
                }}
                t={t}
                disabled={conclusionToggleDisabled}
              />
            )}

            {showConclusion && (
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
                  rows={3}
                  maxLength={CONCLUSION_MAX}
                  value={draft.conclusion ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => {
                    setConclusionMissing(false);
                    update({ conclusion: e.target.value });
                  }}
                  placeholder={t(
                    "A short note or report on how the task was finished…",
                    "Krátka poznámka o tom, ako úloha dopadla…",
                    "Rövid beszámoló a feladat lezárásáról…",
                  )}
                  className={`w-full px-3 py-2 rounded-md border focus:outline-none resize-none disabled:bg-gray-50 text-ui font-medium ${
                    conclusionMissing && finishingWithoutConclusion
                      ? "border-rose-400 focus:border-rose-500"
                      : "border-gray-200 focus:border-entity-solid"
                  }`}
                />
              </div>
            )}
          </div>

          {/* Time Tracking Card */}
          <div style={entityAccentStyle("time_tracking")} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs space-y-3">
            <div className="type-label flex items-center gap-1.5 text-gray-700">
              <Timer className="size-4 shrink-0 text-entity-text" />
              {t("Time tracking", "Evidencia času", "Időkövetés")}
              <TaskAddTimeLink task={draft} projects={projects} leads={leads} />
            </div>
            <TaskTimeControls
              task={draft}
              projects={projects}
              leads={leads}
              onSaveProject={(_id, projectId) => update({ relatedProjectId: projectId })}
            />
            <TaskTimeBreakdown taskId={draft.id} users={users} />
            <label className="grid gap-1">
              <span className="type-overline text-gray-500">{t("Estimate (minutes)", "Odhad (minúty)", "Becslés (perc)")}</span>
              <input
                type="number"
                min={0}
                disabled={!canEdit}
                value={draft.estimateMinutes ?? ""}
                onChange={(e) => update({ estimateMinutes: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
                className="h-10 w-32 rounded-md border border-gray-200 bg-white px-3 text-ui tabular-nums outline-none focus:border-entity-solid disabled:opacity-60"
              />
            </label>
          </div>

          {/* Properties Card */}
          <fieldset disabled={!canEdit} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs space-y-4 text-ui font-bold">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="type-overline text-slate-500">{t("Task Status", "Stav úlohy", "Feladat állapota")}</label>
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

              <div className="space-y-1.5">
                <label className="type-overline text-gray-500">{t("Priority", "Priorita", "Prioritás")}</label>
                <div className="grid grid-cols-3 gap-2 bg-gray-100 p-1 rounded-lg border border-gray-200">
                  {(["low", "medium", "high"] as const).map((prio) => (
                    <button
                      key={prio}
                      type="button"
                      onClick={() => update({ priority: prio })}
                      className={`py-1.5 rounded-md type-overline transition-all ${
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
                <label className="type-overline text-gray-500">{t("Start Date", "Dátum začiatku", "Kezdő dátum")}</label>
                <input
                  type="date"
                  value={draft.startDate || ""}
                  onChange={(e) => update({ startDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-gray-200 focus:border-entity-solid focus:outline-none disabled:bg-gray-50"
                />
              </div>

              <div className="space-y-1">
                <label className="type-overline text-slate-500">{t("Category", "Kategória", "Kategória")}</label>
                <CustomSelect
                  value={draft.category || ""}
                  disabled={!canEdit}
                  onChange={(v) => update({ category: v || null })}
                  options={taskCategoryOptions(t)}
                />
              </div>

              <div className="space-y-1">
                <label className="type-overline text-slate-500">{t("Deadline Date", "Termín", "Határidő")}</label>
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
                <label className="type-overline text-slate-500">{t("Deadline Time", "Čas termínu", "Határidő időpontja")}</label>
                <DeadlineTimePicker
                  value={draft.deadlineTime || ""}
                  onChange={(val) => update({ deadlineTime: val })}
                  t={t}
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <QuickDeadlineChips value={draft.deadline} min={minDeadline} onPick={(date) => update({ deadline: date })} t={t} disabled={!canEdit} />
              <div className="flex flex-wrap items-center gap-1.5">
                <DeadlinePostponedBadge task={task} language={systemLanguage} t={t} />
                {draftPostpones && (
                  <span className="text-micro font-semibold text-amber-600">
                    {t("Saving counts as a postponement", "Uložením sa to započíta ako posunutie termínu", "A mentés halasztásnak számít")}
                  </span>
                )}
              </div>
            </div>

            {task.externalSource === "waai" && (
              <div className="flex flex-wrap items-center gap-1.5">
                <TaskWhatsAppMarks task={task} userLanguage={systemLanguage} />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="type-overline text-slate-500">{t("Assign Project Manager", "Priradiť riešiteľa", "Felelős kijelölése")}</label>
                <CustomSelect
                  value={draft.assignedUsers?.[0] || ""}
                  disabled={!canEdit}
                  onChange={(v) => update({ assignedUsers: v ? [v] : [], owner: v })}
                  options={[
                    { value: "", label: t("-- Unassigned --", "-- Nepriradený --", "-- Kijelöletlen --") },
                    ...users.map((u) => ({ value: u.name, label: `${u.name} (${u.role})` })),
                  ]}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="type-overline text-slate-500 flex items-center gap-1">
                    <FolderKanban className="h-3 w-3" />
                    {t("Project", "Projekt", "Projekt")}
                  </label>
                  {draft.relatedProjectId && (
                    <a
                      href={`#project-${encodeURIComponent(draft.relatedProjectId)}`}
                      className="type-overline text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                    >
                      {t("Open project", "Otvoriť projekt", "Projekt megnyitása")}
                      <ArrowUpRight className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <CustomSelect
                  searchable
                  value={draft.relatedProjectId || ""}
                  disabled={!canEdit}
                  onChange={(v) => update({ relatedProjectId: v || undefined })}
                  options={projectOptions}
                />
              </div>

              {agencyEnabled && (
                <div className="space-y-1">
                  <label className="type-overline text-slate-500 flex items-center gap-1">
                    <UserCheck className="h-3 w-3 text-emerald-600" />
                    {t("Rented Employee", "Prenajatý zamestnanec", "Kölcsönzött munkavállaló")}
                  </label>
                  <AgencyWorkerSelect
                    value={draft.relatedAgencyWorkerId || ""}
                    onChange={(v) => update({ relatedAgencyWorkerId: v || undefined })}
                    lang={systemLanguage}
                    disabled={!canEdit}
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
                        className="type-overline text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                      >
                        {t("Open ticket", "Otvoriť tiket", "Jegy megnyitása")}
                        <ArrowUpRight className="h-3 w-3" />
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
                  {linkedLead && (
                    <a href={recordHref(linkedLead)} className="type-overline text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5">
                      {isClientRecord(linkedLead)
                        ? t("Open client", "Otvoriť klienta", "Ügyfél megnyitása")
                        : t("Open lead", "Otvoriť lead", "Lead megnyitása")}
                      <ArrowUpRight className="h-3 w-3" />
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
                    setDraft((prev) =>
                      prev ? { ...prev, relatedLeadId: leadId, isLocking: leadId ? prev.isLocking : false } : prev,
                    );
                  }}
                  showCity={false}
                  showKind
                  addKind="lead"
                  noneLabel={t("-- None --", "-- Žiadny --", "-- Nincs --")}
                />
              </div>
            </div>

            {draft.relatedLeadId && (
              <div style={entityAccentStyle("leads")} className="p-3 rounded-lg bg-entity-subtle border border-entity-border flex items-center justify-between">
                <span className="type-overline text-entity-text flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  {t("Block Pipeline Stage", "Zablokovať fázu pipeline", "Folyamat szakasz zárolása")}
                </span>
                <input
                  type="checkbox"
                  checked={draft.isLocking || false}
                  onChange={(e) => update({ isLocking: e.target.checked })}
                  className="h-4 w-4 cursor-pointer accent-entity-solid"
                />
              </div>
            )}

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

            {taskCreatedDate(task) && (
              <p className="type-meta font-medium text-gray-400">
                {t("Created on", "Vytvorené", "Létrehozva")}{" "}
                <span className="font-semibold text-gray-500">
                  {formatDeadlineDate(taskCreatedDate(task), systemLanguage)}
                </span>
                {task.createdBy ? <> · <span className="font-semibold text-gray-500">{task.createdBy}</span></> : null}
              </p>
            )}
          </fieldset>
        </form>

        {/* Right sticky column: Activity, Chat, History & Files */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-2xs xl:sticky xl:top-4 min-h-96 max-h-[calc(100vh-8rem)] flex flex-col">
          <TaskActivityPanel
            task={draft}
            users={users}
            currentUserName={currentUserName}
            currentUserRole={effectiveUser.role}
            systemLanguage={systemLanguage}
            taskStates={taskStates}
            taskStateColors={taskStateColors}
            mentionEntities={mentionEntities}
            onTaskMetaChange={handleTaskMetaChange}
            canEdit={canEdit}
            filesRefreshKey={filesRefreshKey}
            onInsertFileIntoDescription={canEdit ? handleInsertFileIntoDescription : undefined}
            onPreviewFile={setPreviewFile}
            hideCollapseButton
          />
        </div>
      </div>

      <TaskDescriptionFullscreenModal
        open={fullscreenDescOpen}
        title={draft.title}
        taskId={task.id}
        description={draft.description}
        systemLanguage={systemLanguage}
        currentUserName={currentUserName}
        currentUserRole={effectiveUser.role}
        canEdit={canEdit}
        filesRefreshKey={filesRefreshKey}
        insertFileSignal={fullscreenDescOpen ? insertFileSignal : null}
        onInsertFileHandled={handleInsertFileHandled}
        onChangeDescription={(blocks) => update({ description: serializeTaskDescription(blocks) })}
        onUploadFile={canEdit ? handleDescriptionFileUpload : undefined}
        onPreviewFile={setPreviewFile}
        onInsertIntoDescription={canEdit ? handleInsertFileIntoDescription : undefined}
        onFilesChanged={({ fileCount }) => handleTaskMetaChange(task.id, { fileCount })}
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
    </div>
  );
};
