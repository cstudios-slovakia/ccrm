import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Check,
  ChevronUp,
  History,
  ImagePlus,
  Loader2,
  MessageSquare,
  PanelRightClose,
  Pencil,
  Send,
  SmilePlus,
  Trash2,
  X,
} from "lucide-react";
import type {
  Task,
  TaskActivityFilter,
  TaskActivityItem,
  TaskChatImage,
  TaskFile,
  UserProfile,
} from "../../types";
import type { Language } from "../../utils/translations";
import { taskPriorityLabel, taskStateLabel, type Translate } from "../../utils/taskLabels";
import { EmojiPicker } from "../whatsapp/chats/composer/EmojiPicker";
import { TaskPillText, type MentionEntity } from "../TaskPillText";
import { compressTaskChatImage } from "../../utils/taskChatImage";
import { TaskFilesPanel } from "./TaskFilesPanel";
import {
  deleteTaskComment,
  editTaskComment,
  fetchTaskActivities,
  postTaskComment,
  toggleTaskMessageReaction,
  toggleTaskReaction,
  uploadTaskChatImage,
} from "../../utils/taskActivityApi";
import {
  TASK_QUICK_EMOJIS,
  formatActivityTimestamp,
  formatStateChange,
  mergeActivityDelta,
  normalizeReactionRecord,
  prependOlderActivities,
  toggleReactionMap,
} from "../../utils/taskActivityFormat";

interface PendingUpload {
  localId: string;
  previewUrl: string;
  name: string;
  uploading: boolean;
  error?: string;
  image?: TaskChatImage;
}

interface TaskActivityPanelProps {
  task: Pick<Task, "id" | "commentCount" | "reactions" | "fileCount">;
  users: UserProfile[];
  currentUserName: string;
  currentUserRole?: string;
  systemLanguage: Language;
  taskStates: string[];
  taskStateColors?: Record<string, string>;
  mentionEntities?: MentionEntity[];
  onTagClick?: (tag: string) => void;
  onTaskMetaChange?: (
    taskId: string,
    patch: { commentCount?: number; reactions?: Record<string, string[]> | null; fileCount?: number }
  ) => void;
  canEdit?: boolean;
  filesRefreshKey?: number;
  onInsertFileIntoDescription?: (file: TaskFile) => void;
  onPreviewFile?: (file: TaskFile) => void;
  onCollapse?: () => void;
  hideCollapseButton?: boolean;
}

const POLL_INTERVAL_MS = 6000;

export const TaskActivityPanel: React.FC<TaskActivityPanelProps> = ({
  task,
  users,
  currentUserName,
  currentUserRole,
  systemLanguage,
  taskStateColors = {},
  mentionEntities = [],
  onTagClick,
  onTaskMetaChange,
  canEdit = true,
  filesRefreshKey = 0,
  onInsertFileIntoDescription,
  onPreviewFile,
  onCollapse,
  hideCollapseButton = false,
}) => {
  const t: Translate = useCallback(
    (en, sk, hu) => (systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en),
    [systemLanguage]
  );

  const [items, setItems] = useState<TaskActivityItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TaskActivityFilter>("all");
  const [taskReactions, setTaskReactions] = useState<Record<string, string[]>>(() =>
    normalizeReactionRecord(task.reactions)
  );
  const [commentCount, setCommentCount] = useState<number>(Number(task.commentCount ?? 0));
  const [fileCount, setFileCount] = useState<number>(Number(task.fileCount ?? 0));

  useEffect(() => {
    setFileCount(Number(task.fileCount ?? 0));
  }, [task.id, task.fileCount]);

  const [draftBody, setDraftBody] = useState("");
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [taskEmojiPickerOpen, setTaskEmojiPickerOpen] = useState(false);
  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false);
  const [messageEmojiTarget, setMessageEmojiTarget] = useState<number | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [lightboxImage, setLightboxImage] = useState<TaskChatImage | null>(null);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const cursorUpdatedRef = useRef<string>("1970-01-01 00:00:00.000");
  const maxIdRef = useRef<number>(0);
  const pollInFlightRef = useRef(false);
  const streamEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const onTaskMetaChangeRef = useRef(onTaskMetaChange);
  onTaskMetaChangeRef.current = onTaskMetaChange;
  const lastMetaSigRef = useRef<string>(
    JSON.stringify([Number(task.commentCount ?? 0), normalizeReactionRecord(task.reactions)])
  );
  const isAdmin = (currentUserRole || "").toLowerCase() === "admin";

  const notifyMeta = useCallback(
    (nextCount: number, nextRx: Record<string, string[]>) => {
      const cleanRx = normalizeReactionRecord(nextRx);
      const sig = JSON.stringify([nextCount, cleanRx]);
      if (sig === lastMetaSigRef.current) return;
      lastMetaSigRef.current = sig;
      onTaskMetaChangeRef.current?.(task.id, {
        commentCount: nextCount,
        reactions: Object.keys(cleanRx).length > 0 ? cleanRx : null,
      });
    },
    [task.id]
  );

  // Clean up blob object URLs on unmount
  const pendingRef = useRef<PendingUpload[]>([]);
  pendingRef.current = pendingUploads;
  useEffect(
    () => () => {
      pendingRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    },
    []
  );

  // Escape key closes lightbox cleanly without closing parent drawer
  useEffect(() => {
    if (!lightboxImage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setLightboxImage(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [lightboxImage]);

  // Initial load for current task
  useEffect(() => {
    const controller = new AbortController();
    setLoadingInitial(true);
    setLoadError(null);
    maxIdRef.current = 0;
    cursorUpdatedRef.current = "1970-01-01 00:00:00.000";
    lastMetaSigRef.current = JSON.stringify([
      Number(task.commentCount ?? 0),
      normalizeReactionRecord(task.reactions),
    ]);

    fetchTaskActivities(task.id, { limit: 40, signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        setItems(res.items);
        setHasMore(res.hasMore);
        cursorUpdatedRef.current = res.cursorUpdated;
        maxIdRef.current = res.items.reduce((m, it) => Math.max(m, it.id), 0);
        const rx = normalizeReactionRecord(res.taskReactions);
        setTaskReactions(rx);
        setCommentCount(res.commentCount);
        notifyMeta(res.commentCount, rx);
        setTimeout(() => streamEndRef.current?.scrollIntoView({ behavior: "auto" }), 30);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load task activity.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingInitial(false);
      });

    return () => controller.abort();
  }, [task.id, notifyMeta]);

  // Visibility-aware 6s delta poll for live comments, reactions, and state updates
  const runDeltaPoll = useCallback(async () => {
    if (pollInFlightRef.current || document.visibilityState === "hidden") return;
    pollInFlightRef.current = true;
    try {
      const res = await fetchTaskActivities(task.id, {
        afterId: maxIdRef.current,
        sinceUpdated: cursorUpdatedRef.current,
      });
      if (res.items.length > 0) {
        setItems((prev) => mergeActivityDelta(prev, res.items));
        maxIdRef.current = res.items.reduce((m, it) => Math.max(m, it.id), maxIdRef.current);
      }
      if (res.cursorUpdated > cursorUpdatedRef.current) {
        cursorUpdatedRef.current = res.cursorUpdated;
      }
      const rx = normalizeReactionRecord(res.taskReactions);
      setTaskReactions(rx);
      setCommentCount(res.commentCount);
      notifyMeta(res.commentCount, rx);
    } catch {
      // Transient background poll errors stay silent.
    } finally {
      pollInFlightRef.current = false;
    }
  }, [task.id, notifyMeta]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void runDeltaPoll();
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void runDeltaPoll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [runDeltaPoll]);

  const handleLoadOlder = async () => {
    if (loadingOlder || !hasMore || items.length === 0) return;
    const oldestId = items[0].id;
    setLoadingOlder(true);
    try {
      const res = await fetchTaskActivities(task.id, { limit: 40, beforeId: oldestId });
      setItems((prev) => prependOlderActivities(res.items, prev));
      setHasMore(res.hasMore);
    } catch {
      (window as any).showToast?.(t("Could not load older history.", "Nepodarilo sa načítať staršiu históriu.", "Nem sikerült betölteni a korábbi előzményeket."), "error");
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleToggleTaskReaction = async (emoji: string) => {
    setTaskEmojiPickerOpen(false);
    const prevRx = taskReactions;
    const optimistic = toggleReactionMap(prevRx, emoji, currentUserName);
    setTaskReactions(optimistic);
    notifyMeta(commentCount, optimistic);
    try {
      const serverRx = normalizeReactionRecord(await toggleTaskReaction(task.id, emoji));
      setTaskReactions(serverRx);
      notifyMeta(commentCount, serverRx);
    } catch {
      setTaskReactions(prevRx);
      notifyMeta(commentCount, prevRx);
    }
  };

  const handleToggleMessageReaction = async (activityId: number, emoji: string) => {
    setMessageEmojiTarget(null);
    const snapshot = items;
    setItems((prev) =>
      prev.map((it) =>
        it.id === activityId
          ? { ...it, reactions: toggleReactionMap(it.reactions, emoji, currentUserName) }
          : it
      )
    );
    try {
      const serverRx = normalizeReactionRecord(
        await toggleTaskMessageReaction(task.id, activityId, emoji)
      );
      setItems((prev) => prev.map((it) => (it.id === activityId ? { ...it, reactions: serverRx } : it)));
    } catch {
      setItems(snapshot);
    }
  };

  const enqueueImageFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(
      (f) => f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(f.name)
    );
    if (arr.length === 0) return;
    const availableSlots = Math.max(0, 6 - pendingUploads.length);
    const slice = arr.slice(0, availableSlots);
    if (slice.length === 0) {
      (window as any).showToast?.(
        t("Maximum 6 images per message.", "Maximálne 6 obrázkov v jednej správe.", "Legfeljebb 6 kép csatolható egy üzenethez."),
        "warning"
      );
      return;
    }

    for (const rawFile of slice) {
      const localId = `up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const previewUrl = URL.createObjectURL(rawFile);
      setPendingUploads((prev) => [
        ...prev,
        { localId, previewUrl, name: rawFile.name || "screenshot.webp", uploading: true },
      ]);
      try {
        const compressed = await compressTaskChatImage(rawFile);
        const uploaded = await uploadTaskChatImage(task.id, compressed);
        setPendingUploads((prev) =>
          prev.map((p) =>
            p.localId === localId ? { ...p, uploading: false, image: uploaded } : p
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setPendingUploads((prev) =>
          prev.map((p) => (p.localId === localId ? { ...p, uploading: false, error: msg } : p))
        );
      }
    }
  };

  const removePendingUpload = (localId: string) => {
    setPendingUploads((prev) => {
      const target = prev.find((p) => p.localId === localId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.localId !== localId);
    });
  };

  const handleSendComment = async () => {
    const body = draftBody.trim();
    const readyImages = pendingUploads.filter((p) => p.image && !p.error).map((p) => p.image!);
    const stillUploading = pendingUploads.some((p) => p.uploading);
    if (sending || stillUploading || (body === "" && readyImages.length === 0)) return;

    setSending(true);
    try {
      const res = await postTaskComment(task.id, { body, images: readyImages });
      setItems((prev) => mergeActivityDelta(prev, [res.item]));
      maxIdRef.current = Math.max(maxIdRef.current, res.item.id);
      if (res.item.updatedAt > cursorUpdatedRef.current) {
        cursorUpdatedRef.current = res.item.updatedAt;
      }
      setCommentCount(res.commentCount);
      notifyMeta(res.commentCount, taskReactions);
      setDraftBody("");
      setMentionQuery(null);
      pendingUploads.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPendingUploads([]);
      setTimeout(() => streamEndRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    } catch (err) {
      (window as any).showToast?.(
        err instanceof Error ? err.message : t("Failed to send message.", "Nepodarilo sa odoslať správu.", "Az üzenet küldése sikertelen."),
        "error"
      );
    } finally {
      setSending(false);
    }
  };

  const handleSaveCommentEdit = async (activityId: number) => {
    const trimmed = editingBody.trim();
    const item = items.find((x) => x.id === activityId);
    const hasImages = Boolean(item?.meta?.images && item.meta.images.length > 0);
    if (!trimmed && !hasImages) return;
    try {
      const updated = await editTaskComment(task.id, activityId, trimmed);
      setItems((prev) => mergeActivityDelta(prev, [updated]));
      setEditingCommentId(null);
      setEditingBody("");
    } catch (err) {
      (window as any).showToast?.(err instanceof Error ? err.message : "Edit failed", "error");
    }
  };

  const handleDeleteComment = async (activityId: number) => {
    setConfirmDeleteId(null);
    try {
      const res = await deleteTaskComment(task.id, activityId);
      setItems((prev) => prev.filter((it) => it.id !== res.deletedId));
      setCommentCount(res.commentCount);
      notifyMeta(res.commentCount, taskReactions);
    } catch (err) {
      (window as any).showToast?.(err instanceof Error ? err.message : "Delete failed", "error");
    }
  };

  const handleDraftChange = (val: string) => {
    setDraftBody(val);
    const el = composerRef.current;
    const caret = el ? el.selectionStart : val.length;
    const beforeCaret = val.slice(0, caret);
    const match = beforeCaret.match(/(?:^|\s)@([^\s@]{0,25})$/);
    setMentionQuery(match ? match[1] : null);
  };

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return users
      .filter((u) => u.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionQuery, users]);

  const insertMention = (name: string) => {
    const el = composerRef.current;
    const caret = el ? el.selectionStart : draftBody.length;
    const before = draftBody.slice(0, caret);
    const after = draftBody.slice(caret);
    const replaced = before.replace(/@([^\s@]{0,25})$/, `@${name} `);
    setDraftBody(replaced + after);
    setMentionQuery(null);
    setTimeout(() => {
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = replaced.length;
      }
    }, 0);
  };

  const filteredItems = useMemo(() => {
    if (filter === "comments") return items.filter((i) => i.kind === "comment");
    if (filter === "history") return items.filter((i) => i.kind === "state_change");
    return items;
  }, [items, filter]);

  const taskReactionEntries = useMemo(
    () => Object.entries(taskReactions).sort((a, b) => b[1].length - a[1].length),
    [taskReactions]
  );

  const historyCount = useMemo(
    () => items.filter((i) => i.kind === "state_change").length,
    [items]
  );

  const readyToSend =
    !sending &&
    !pendingUploads.some((p) => p.uploading) &&
    (draftBody.trim().length > 0 || pendingUploads.some((p) => Boolean(p.image && !p.error)));

  return (
    <aside
      data-testid="task-activity-panel"
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) {
          void enqueueImageFiles(e.dataTransfer.files);
        }
      }}
      className={`relative flex flex-col h-full min-h-0 bg-slate-50/70 ${
        dragOver ? "ring-2 ring-inset ring-entity bg-entity-subtle/40" : ""
      }`}
    >
      {/* Header: Title + Task-level Reactions + Filter Tabs */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-200 bg-white space-y-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="h-4 w-4 text-entity-text shrink-0" />
            <h2 className="text-ui font-bold text-gray-900 truncate">
              {t("Activity & Chat", "Aktivita a chat", "Aktivitás és csevegés")}
            </h2>
            {commentCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-entity-subtle text-entity-text text-micro font-bold tabular-nums">
                {commentCount}
              </span>
            )}
          </div>
          {!hideCollapseButton && onCollapse && (
            <button
              type="button"
              data-testid="task-activity-collapse-btn"
              onClick={onCollapse}
              title={t("Collapse activity panel", "Zbaliť panel aktivity", "Aktivitás panel bezárása")}
              className="hidden lg:inline-flex p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Task-level quick reactions */}
        <div className="relative flex items-center flex-wrap gap-1">
          {taskReactionEntries.map(([emoji, reactors]) => {
            const mine = reactors.includes(currentUserName);
            return (
              <button
                key={emoji}
                type="button"
                data-testid={`task-reaction-chip-${emoji}`}
                onClick={() => void handleToggleTaskReaction(emoji)}
                title={reactors.join(", ")}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-caption font-semibold transition-all cursor-pointer active:scale-95 ${
                  mine
                    ? "bg-entity-subtle border-entity-border text-entity-text"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span>{emoji}</span>
                <span className="tabular-nums">{reactors.length}</span>
              </button>
            );
          })}

          <div className="inline-flex items-center gap-0.5 bg-gray-100/80 border border-gray-200/80 rounded-full px-1 py-0.5">
            {TASK_QUICK_EMOJIS.slice(0, 4).map((emoji) => (
              <button
                key={emoji}
                type="button"
                data-testid={`task-quick-react-${emoji}`}
                onClick={() => void handleToggleTaskReaction(emoji)}
                title={t("React to task", "Reagovať na úlohu", "Reagálás a feladatra")}
                className="h-6 w-6 rounded-full flex items-center justify-center text-caption hover:bg-white hover:scale-110 transition-all cursor-pointer"
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              data-testid="task-reaction-more-btn"
              onClick={() => setTaskEmojiPickerOpen((v) => !v)}
              title={t("More emojis", "Viac emoji", "További emojik")}
              className="h-6 w-6 rounded-full flex items-center justify-center text-gray-500 hover:bg-white hover:text-gray-800 transition-colors cursor-pointer"
            >
              <SmilePlus className="h-3.5 w-3.5" />
            </button>
          </div>

          {taskEmojiPickerOpen && (
            <div className="absolute top-full left-0 mt-1.5 z-50">
              <EmojiPicker
                onSelect={(emoji) => void handleToggleTaskReaction(emoji)}
                onClose={() => setTaskEmojiPickerOpen(false)}
              />
            </div>
          )}
        </div>

        {/* All | Comments | History | Files Segmented Filter */}
        <div className="grid grid-cols-4 gap-1 bg-gray-100 p-0.5 rounded-lg border border-gray-200">
          {(
            [
              ["all", t("All", "Všetko", "Összes"), items.length],
              ["comments", t("Comments", "Komentáre", "Hozzászólások"), commentCount],
              ["history", t("History", "História", "Előzmények"), historyCount],
              ["files", t("Files", "Súbory", "Fájlok"), fileCount],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              data-testid={`task-activity-filter-${key}`}
              onClick={() => setFilter(key)}
              className={`py-1 px-1.5 rounded-md text-micro font-bold transition-all cursor-pointer flex items-center justify-center gap-0.5 min-w-0 ${
                filter === key
                  ? "bg-white text-gray-900 shadow-2xs"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <span className="truncate">{label}</span>
              {count > 0 && <span className="opacity-65 tabular-nums shrink-0">({count})</span>}
            </button>
          ))}
        </div>
      </div>

      {filter === "files" ? (
        <TaskFilesPanel
          taskId={task.id}
          systemLanguage={systemLanguage}
          currentUserName={currentUserName}
          currentUserRole={currentUserRole}
          canEdit={canEdit}
          refreshKey={filesRefreshKey}
          compact
          onFilesChanged={({ fileCount: nextCount }) => {
            setFileCount(nextCount);
            onTaskMetaChangeRef.current?.(task.id, { fileCount: nextCount });
          }}
          onInsertIntoDescription={onInsertFileIntoDescription}
          onPreviewFile={onPreviewFile}
        />
      ) : (
        <>
      {/* Activity & Chat Stream */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {hasMore && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void handleLoadOlder()}
              disabled={loadingOlder}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-gray-200 bg-white text-micro font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
            >
              {loadingOlder ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3 w-3" />}
              {t("Load older activity", "Načítať staršiu aktivitu", "Korábbi előzmények betöltése")}
            </button>
          </div>
        )}

        {loadingInitial ? (
          <div className="py-10 flex items-center justify-center gap-2 text-caption text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t("Loading activity...", "Načítavam aktivitu...", "Aktivitás betöltése...")}</span>
          </div>
        ) : loadError ? (
          <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-caption text-rose-700">
            {loadError}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-10 text-center space-y-1.5 text-gray-400">
            <History className="h-6 w-6 mx-auto opacity-60" />
            <p className="text-caption font-semibold text-gray-500">
              {t("No activity yet", "Zatiaľ žiadna aktivita", "Még nincs aktivitás")}
            </p>
            <p className="text-micro text-gray-400">
              {t(
                "Send a message, paste an image, or react to start the thread.",
                "Napíšte správu, vložte obrázok alebo pridajte reakciu.",
                "Írjon üzenetet, illesszen be képet vagy reagáljon."
              )}
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            if (item.kind === "state_change") {
              const info = formatStateChange(item, systemLanguage, {
                translateStatus: (st) => taskStateLabel(st, t),
                translatePriority: (p) => taskPriorityLabel(p, t),
              });
              return (
                <div
                  key={item.id}
                  data-testid="task-activity-state-item"
                  className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-white/80 border border-gray-200/70 text-micro text-gray-600"
                >
                  <span className="mt-1 h-2 w-2 rounded-full bg-entity shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate">
                        <strong className="text-gray-900 font-bold">
                          {item.authorName || t("System", "Systém", "Rendszer")}
                        </strong>{" "}
                        {info.label}
                      </span>
                      <span className="text-micro text-gray-400 tabular-nums shrink-0">
                        {formatActivityTimestamp(item.createdAt, systemLanguage)}
                      </span>
                    </div>

                    {info.eventType === "status" && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className="px-1.5 py-0.5 rounded font-bold text-white"
                          style={{ backgroundColor: taskStateColors[info.fromRaw || ""] || "#64748b" }}
                        >
                          {info.fromValue}
                        </span>
                        <ArrowRight className="h-3 w-3 text-gray-400" />
                        <span
                          className="px-1.5 py-0.5 rounded font-bold text-white"
                          style={{ backgroundColor: taskStateColors[info.toRaw || ""] || "#4f46e5" }}
                        >
                          {info.toValue}
                        </span>
                      </div>
                    )}

                    {(info.eventType === "priority" || info.eventType === "deadline") && (
                      <div className="flex items-center gap-1.5 flex-wrap font-semibold">
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 line-through">
                          {info.fromValue}
                        </span>
                        <ArrowRight className="h-3 w-3 text-gray-400" />
                        <span
                          className={`px-1.5 py-0.5 rounded ${
                            info.postponed
                              ? "bg-amber-100 text-amber-800"
                              : "bg-entity-subtle text-entity-text"
                          }`}
                        >
                          {info.toValue}
                        </span>
                      </div>
                    )}

                    {info.eventType === "assignees" && (
                      <div className="flex items-center gap-1 flex-wrap font-semibold">
                        {(info.addedUsers || []).map((u) => (
                          <span key={`add-${u}`} className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            +{u}
                          </span>
                        ))}
                        {(info.removedUsers || []).map((u) => (
                          <span key={`rem-${u}`} className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                            -{u}
                          </span>
                        ))}
                      </div>
                    )}

                    {info.singleText && (
                      <p className="text-caption text-gray-700 bg-emerald-50/70 border border-emerald-200/70 rounded px-2 py-1 italic">
                        "{info.singleText}"
                      </p>
                    )}
                  </div>
                </div>
              );
            }

            // Comment bubble
            const images = Array.isArray(item.meta?.images) ? item.meta!.images! : [];
            const msgReactions = Object.entries(normalizeReactionRecord(item.reactions));
            const canManage = isAdmin || item.authorName === currentUserName;
            const isEditing = editingCommentId === item.id;
            const initial = (item.authorName || "?").charAt(0).toUpperCase();

            return (
              <div
                key={item.id}
                data-testid="task-activity-comment-item"
                className="group relative bg-white rounded-xl border border-gray-200 p-3 shadow-2xs space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-6 w-6 rounded-full bg-entity-subtle text-entity-text border border-entity-border text-micro font-bold flex items-center justify-center shrink-0">
                      {initial}
                    </span>
                    <span className="text-caption font-bold text-gray-900 truncate">
                      {item.authorName}
                    </span>
                    <span className="text-micro text-gray-400 tabular-nums shrink-0">
                      {formatActivityTimestamp(item.createdAt, systemLanguage)}
                    </span>
                    {item.meta?.editedAt && (
                      <span className="text-micro text-gray-400 italic">
                        {t("(edited)", "(upravené)", "(szerkesztve)")}
                      </span>
                    )}
                  </div>

                  {/* Quick hover actions */}
                  <div className="flex items-center gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    {TASK_QUICK_EMOJIS.slice(0, 3).map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => void handleToggleMessageReaction(item.id, em)}
                        className="h-6 w-6 rounded hover:bg-gray-100 text-caption flex items-center justify-center cursor-pointer"
                        title={em}
                      >
                        {em}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setMessageEmojiTarget((prev) => (prev === item.id ? null : item.id))
                      }
                      className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
                      title={t("Add reaction", "Pridať reakciu", "Reakció hozzáadása")}
                    >
                      <SmilePlus className="h-3.5 w-3.5" />
                    </button>
                    {canManage && !isEditing && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCommentId(item.id);
                            setEditingBody(item.body || "");
                          }}
                          className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
                          title={t("Edit message", "Upraviť správu", "Üzenet szerkesztése")}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        {confirmDeleteId === item.id ? (
                          <span className="inline-flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => void handleDeleteComment(item.id)}
                              className="p-1 rounded bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                              title={t("Confirm delete", "Potvrdiť zmazanie", "Törlés megerősítése")}
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="p-1 rounded text-gray-400 hover:bg-gray-100 cursor-pointer"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(item.id)}
                            className="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            title={t("Delete message", "Zmazať správu", "Üzenet törlése")}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {messageEmojiTarget === item.id && (
                  <div className="relative z-40">
                    <EmojiPicker
                      onSelect={(emoji) => void handleToggleMessageReaction(item.id, emoji)}
                      onClose={() => setMessageEmojiTarget(null)}
                    />
                  </div>
                )}

                {isEditing ? (
                  <div className="space-y-1.5">
                    <textarea
                      rows={2}
                      value={editingBody}
                      onChange={(e) => setEditingBody(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-md border border-entity-border text-caption focus:outline-none focus:ring-2 focus:ring-entity-ring"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCommentId(null);
                          setEditingBody("");
                        }}
                        className="px-2 py-1 rounded text-micro font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer"
                      >
                        {t("Cancel", "Zrušiť", "Mégse")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveCommentEdit(item.id)}
                        className="px-2.5 py-1 rounded bg-entity-solid text-white text-micro font-semibold hover:opacity-90 cursor-pointer"
                      >
                        {t("Save", "Uložiť", "Mentés")}
                      </button>
                    </div>
                  </div>
                ) : (
                  item.body && (
                    <p className="text-caption text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
                      <TaskPillText
                        text={item.body}
                        onTagClick={onTagClick}
                        knownEntities={mentionEntities}
                      />
                    </p>
                  )
                )}

                {images.length > 0 && (
                  <div
                    className={`grid gap-1.5 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
                  >
                    {images.map((img, idx) => (
                      <button
                        key={`${img.url}-${idx}`}
                        type="button"
                        onClick={() => setLightboxImage(img)}
                        className="group/img relative overflow-hidden rounded-lg border border-gray-200 bg-gray-100 cursor-pointer text-left"
                      >
                        <img
                          src={img.url}
                          alt={img.name}
                          loading="lazy"
                          className="w-full max-h-48 object-cover transition-transform group-hover/img:scale-[1.02]"
                        />
                      </button>
                    ))}
                  </div>
                )}

                {msgReactions.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {msgReactions.map(([emoji, reactors]) => {
                      const mine = reactors.includes(currentUserName);
                      return (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => void handleToggleMessageReaction(item.id, emoji)}
                          title={reactors.join(", ")}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-micro font-semibold cursor-pointer transition-colors ${
                            mine
                              ? "bg-entity-subtle border-entity-border text-entity-text"
                              : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          <span>{emoji}</span>
                          <span className="tabular-nums">{reactors.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={streamEndRef} />
      </div>

      {/* Composer */}
      <div className="relative p-3 border-t border-gray-200 bg-white space-y-2 shrink-0">
        {mentionCandidates.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg p-1 z-40 max-h-40 overflow-y-auto">
            {mentionCandidates.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => insertMention(u.name)}
                className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-entity-subtle text-caption font-medium text-gray-800 flex items-center justify-between cursor-pointer"
              >
                <span>{u.name}</span>
                <span className="text-micro text-gray-400">{u.role}</span>
              </button>
            ))}
          </div>
        )}

        {composerEmojiOpen && (
          <div className="absolute bottom-full right-3 mb-2 z-50">
            <EmojiPicker
              onSelect={(emoji) => {
                setDraftBody((prev) => prev + emoji);
                setComposerEmojiOpen(false);
                composerRef.current?.focus();
              }}
              onClose={() => setComposerEmojiOpen(false)}
            />
          </div>
        )}

        {pendingUploads.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pendingUploads.map((p) => (
              <div
                key={p.localId}
                className="relative h-14 w-14 rounded-lg border border-gray-200 overflow-hidden bg-gray-100 shrink-0"
              >
                <img src={p.previewUrl} alt={p.name} className="h-full w-full object-cover" />
                {p.uploading && (
                  <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center text-white">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
                {p.error && (
                  <div
                    title={p.error}
                    className="absolute inset-0 bg-rose-900/70 flex items-center justify-center text-white text-micro font-bold px-1 text-center"
                  >
                    !
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removePendingUpload(p.localId)}
                  className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-slate-900/75 text-white flex items-center justify-center hover:bg-rose-600 cursor-pointer"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-slate-50/50 focus-within:bg-white focus-within:border-entity-solid focus-within:ring-2 focus-within:ring-entity-ring transition-all p-2 space-y-1.5">
          <textarea
            ref={composerRef}
            data-testid="task-activity-composer-input"
            rows={2}
            maxLength={4000}
            value={draftBody}
            onChange={(e) => handleDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSendComment();
              }
            }}
            onPaste={(e) => {
              const files: File[] = [];
              const itemsList = e.clipboardData?.items;
              if (itemsList) {
                for (const item of Array.from(itemsList)) {
                  if (item.kind === "file" && item.type.startsWith("image/")) {
                    const f = item.getAsFile();
                    if (f) files.push(f);
                  }
                }
              }
              if (files.length > 0) {
                e.preventDefault();
                void enqueueImageFiles(files);
              }
            }}
            placeholder={t(
              "Write a message, @mention, or paste an image...",
              "Napíšte správu, @označte kolegu alebo vložte obrázok...",
              "Írjon üzenetet, @említsen kollégát vagy illesszen be képet..."
            )}
            className="w-full resize-none bg-transparent text-caption text-gray-900 placeholder:text-gray-400 focus:outline-none font-normal"
          />

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                data-testid="task-activity-file-input"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void enqueueImageFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                data-testid="task-activity-upload-btn"
                onClick={() => fileInputRef.current?.click()}
                title={t("Attach image (or paste screenshot)", "Priložiť obrázok (alebo vložiť snímku)", "Kép csatolása (vagy beillesztés)")}
                className="p-1.5 rounded-md text-gray-500 hover:text-entity-text hover:bg-entity-subtle transition-colors cursor-pointer"
              >
                <ImagePlus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setComposerEmojiOpen((v) => !v)}
                title={t("Emoji", "Emoji", "Emoji")}
                className="p-1.5 rounded-md text-gray-500 hover:text-entity-text hover:bg-entity-subtle transition-colors cursor-pointer"
              >
                <SmilePlus className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              data-testid="task-activity-send-btn"
              disabled={!readyToSend}
              onClick={() => void handleSendComment()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-entity-solid text-white text-caption font-semibold hover:opacity-90 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              <span>{t("Send", "Odoslať", "Küldés")}</span>
            </button>
          </div>
        </div>
      </div>
        </>
      )}

      {/* Full-resolution image lightbox */}
      {lightboxImage &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            data-testid="task-activity-lightbox"
            onClick={() => setLightboxImage(null)}
            className="fixed inset-0 z-[100020] bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center p-4"
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              aria-label={t("Close preview", "Zavrieť náhľad", "Előnézet bezárása")}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={lightboxImage.url}
              alt={lightboxImage.name}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[85vh] max-w-[92vw] rounded-lg shadow-2xl object-contain"
            />
            <span className="mt-2 text-caption text-white/80 font-medium">
              {lightboxImage.name}
            </span>
          </div>,
          document.body
        )}
    </aside>
  );
};
