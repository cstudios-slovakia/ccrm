import { useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Circle,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Send,
  User,
  X,
} from "lucide-react";
import type { TaskAttachmentDto, TaskDto, TaskStatusValue } from "../../api/contract.ts";
import type { WaaiClient } from "../../api/waaiClient.ts";
import { useChatTasks } from "../../hooks/useChatTasks.ts";
import { CrmTaskInfo } from "./CrmTaskInfo.tsx";
import { TaskUpdateComposer } from "./TaskUpdateComposer.tsx";
import { getPanelI18n } from "./panelI18n.ts";

interface Props {
  client: WaaiClient;
  conversationId: string;
  language?: string;
  active?: boolean;
  initialTasks?: TaskDto[];
  senderName?: string;
  onOpenRecord?: (kind: "lead" | "project" | "task", id: string) => void;
  onTasksChanged?: () => void;
  onClose?: () => void;
  className?: string;
}

export const ChatTasks = ({
  client,
  conversationId,
  language = "en",
  active = true,
  initialTasks,
  senderName = "User",
  onOpenRecord,
  onTasksChanged,
  onClose,
  className = "",
}: Props) => {
  const t = getPanelI18n(language).tasks;

  const {
    tasks,
    filter,
    setFilter,
    loading,
    error,
    filteredTasks,
    completedTasks,
    reload,
    toggleStatus,
  } = useChatTasks({
    client,
    conversationId,
    active,
    initialTasks,
  });

  const [composerOpen, setComposerOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  const handleToggle = async (task: TaskDto) => {
    const nextStatus: TaskStatusValue = task.status === "completed" ? "open" : "completed";
    try {
      await toggleStatus(task.id, nextStatus);
      if (onTasksChanged) onTasksChanged();
    } catch {
      // Reverted in hook
    }
  };

  const handleComposerSuccess = () => {
    void reload();
    if (onTasksChanged) onTasksChanged();
  };

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Header and Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-1">
          {(["open", "completed", "all"] as const).map((key) => {
            const count =
              key === "open"
                ? tasks.filter((t) => t.status === "open").length
                : key === "completed"
                  ? completedTasks.length
                  : tasks.length;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`type-meta cursor-pointer rounded-xl px-3 py-1 font-semibold transition-all duration-150 ${
                  filter === key
                    ? "bg-white text-slate-800 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.filters[key]} ({count})
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh button */}
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            aria-label="Refresh tasks"
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          {/* Report done / Task update composer button */}
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="type-meta inline-flex cursor-pointer items-center gap-1.5 rounded-2xl bg-green-600 px-3.5 py-1.5 font-bold text-white shadow-xs shadow-green-600/20 transition-all hover:bg-green-500 active:scale-[0.98]"
          >
            <Send className="size-3.5" />
            {t.reportDone}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 cursor-pointer"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700">
          <p className="type-body">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && tasks.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-8 text-slate-500">
          <Loader2 className="size-5 animate-spin text-green-600" />
          <span className="type-body">{t.loading}</span>
        </div>
      )}

      {/* Empty states */}
      {!loading && filteredTasks.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-10 text-center">
          <CheckCircle2 className="size-8 text-slate-300 mb-2" />
          <p className="type-body font-medium text-slate-700">
            {filter === "completed" ? t.noTasks : t.allCaughtUp}
          </p>
          <p className="type-meta mt-1 text-slate-400">
            {filter === "open" ? t.allCaughtUp : t.noTasks}
          </p>
        </div>
      )}

      {/* Task Cards List */}
      <ul className="flex flex-col gap-2.5">
        {filteredTasks.map((task) => {
          const isDone = task.status === "completed";
          const cannotReopen = task.crm_linked && isDone;

          return (
            <li
              key={task.id}
              className={`group flex flex-col gap-2 rounded-2xl border p-4 transition-all duration-150 ${
                isDone
                  ? "border-slate-100 bg-slate-50/60 opacity-80"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs"
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Status Toggle Checkbox */}
                <button
                  type="button"
                  disabled={cannotReopen}
                  onClick={() => void handleToggle(task)}
                  aria-label={isDone ? t.markOpen : t.markDone}
                  title={cannotReopen ? t.linkedHint : isDone ? t.markOpen : t.markDone}
                  className={`mt-0.5 shrink-0 rounded-full transition-transform active:scale-90 ${
                    cannotReopen
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer hover:opacity-80"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="size-5 text-green-600" />
                  ) : (
                    <Circle className="size-5 text-slate-300 group-hover:text-slate-400" />
                  )}
                </button>

                {/* Task Details */}
                <div className="min-w-0 flex-1">
                  <h4
                    className={`type-body font-semibold transition-colors ${
                      isDone ? "text-slate-500 line-through" : "text-slate-800"
                    }`}
                  >
                    {task.title}
                  </h4>

                  {task.description && (
                    <p className="type-body mt-1 text-slate-600 whitespace-pre-line">
                      {task.description}
                    </p>
                  )}

                  {/* Metadata Chips: Assignee, Dates, CRM */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {task.assignee && (
                      <span className="type-meta inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
                        <User className="size-3 text-slate-400" />
                        {task.assignee}
                      </span>
                    )}

                    {task.due_at && (
                      <span className="type-meta inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
                        <Calendar className="size-3 text-slate-400" />
                        {t.dueOn(task.due_at.slice(0, 10))}
                      </span>
                    )}

                    {/* CRM Info Badge & Link */}
                    <CrmTaskInfo
                      task={task}
                      language={language}
                      onOpenRecord={onOpenRecord}
                    />
                  </div>

                  {/* Task Attachments */}
                  {task.attachments && task.attachments.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
                      <span className="type-meta text-slate-400">{t.attachments}:</span>
                      {task.attachments.map((att, idx) => (
                        <TaskAttachmentItem
                          key={`${att.message_id}-${idx}`}
                          attachment={att}
                          client={client}
                          onPreviewImage={(url, title) => setPreviewImage({ url, title })}
                          downloadLabel={t.download}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Task Update Composer Modal */}
      <TaskUpdateComposer
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        client={client}
        conversationId={conversationId}
        completedTasks={completedTasks}
        language={language}
        senderName={senderName}
        onSuccess={handleComposerSuccess}
      />

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-xs"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative flex max-h-[90vh] max-w-3xl flex-col items-center overflow-hidden rounded-2xl bg-white p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-slate-900/60 p-2 text-white hover:bg-slate-900/80"
              aria-label={t.closePreview}
            >
              <X className="size-5" />
            </button>
            <img
              src={previewImage.url}
              alt={previewImage.title}
              className="max-h-[80vh] w-auto rounded-xl object-contain"
            />
            {previewImage.title && (
              <p className="type-meta mt-2 text-center text-slate-600">{previewImage.title}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function TaskAttachmentItem({
  attachment,
  client,
  onPreviewImage,
  downloadLabel,
}: {
  attachment: TaskAttachmentDto;
  client: WaaiClient;
  onPreviewImage: (url: string, title: string) => void;
  downloadLabel: string;
}) {
  const fullUrl = client.mediaUrl(attachment.url);
  const isImage = attachment.kind === "image" || attachment.mime_type?.startsWith("image/");
  const displayName = attachment.file_name || attachment.caption || (isImage ? "Photo" : "Document");

  if (isImage) {
    return (
      <button
        type="button"
        onClick={() => onPreviewImage(fullUrl, displayName)}
        className="type-meta inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700 transition-colors hover:border-green-300 hover:bg-green-50/50"
      >
        <ImageIcon className="size-3.5 text-green-600" />
        <span className="max-w-36 truncate">{displayName}</span>
        <Eye className="size-3 text-slate-400" />
      </button>
    );
  }

  return (
    <a
      href={fullUrl}
      download={attachment.file_name ?? "document"}
      target="_blank"
      rel="noreferrer"
      className="type-meta inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
      title={downloadLabel}
    >
      <FileText className="size-3.5 text-slate-500" />
      <span className="max-w-36 truncate">{displayName}</span>
      <Download className="size-3 text-slate-400" />
    </a>
  );
}
