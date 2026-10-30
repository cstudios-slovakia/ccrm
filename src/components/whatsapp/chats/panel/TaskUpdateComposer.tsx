import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  FileText,
  Image,
  Loader2,
  Paperclip,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type {
  SummaryLanguage,
  TaskDto,
  TaskUpdateItem,
  TaskUpdateResponse,
} from "../../api/contract.ts";
import { type WaaiClient, WaaiApiError } from "../../api/waaiClient.ts";
import { getPanelI18n } from "./panelI18n.ts";
import {
  MAX_FILE_BYTES,
  MAX_NOTE_CHARS,
  MAX_UPDATE_FILES,
  buildTaskUpdateText,
  newRequestId,
} from "./taskUpdateMessage.ts";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  client: WaaiClient;
  conversationId: string;
  completedTasks: TaskDto[];
  language?: string;
  senderName?: string;
  onSuccess?: (res: TaskUpdateResponse) => void;
}

interface AttachedFile {
  id: string;
  taskId: string;
  file: File;
}

export const TaskUpdateComposer = ({
  isOpen,
  onClose,
  client,
  conversationId,
  completedTasks,
  language = "en",
  senderName = "User",
  onSuccess,
}: Props) => {
  const t = getPanelI18n(language).taskUpdate;

  // Selected task IDs to report
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    new Set(completedTasks.map((t) => t.id)),
  );

  // Notes per task id
  const [notes, setNotes] = useState<Record<string, string>>({});

  // Attached files per task
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);

  // Language for the WhatsApp message
  const [msgLang, setMsgLang] = useState<SummaryLanguage>(
    language.slice(0, 2) === "sk" ? "sk" : language.slice(0, 2) === "hu" ? "hu" : "en",
  );

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [targetTaskIdForUpload, setTargetTaskIdForUpload] = useState<string | null>(null);

  const toggleTask = (taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const setTaskNote = (taskId: string, text: string) => {
    if (text.length > MAX_NOTE_CHARS) return;
    setNotes((prev) => ({ ...prev, [taskId]: text }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !targetTaskIdForUpload) return;

    if (attachments.length + files.length > MAX_UPDATE_FILES) {
      setError(t.tooManyFiles);
      return;
    }

    const newFiles: AttachedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      if (file.size > MAX_FILE_BYTES) {
        setError(t.fileTooLarge);
        return;
      }
      newFiles.push({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        taskId: targetTaskIdForUpload,
        file,
      });
    }

    setError(null);
    setAttachments((prev) => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (fileId: string) => {
    setAttachments((prev) => prev.filter((f) => f.id !== fileId));
  };

  const selectedTasks = useMemo(
    () => completedTasks.filter((task) => selectedIds.has(task.id)),
    [completedTasks, selectedIds],
  );

  // Generate real-time preview of the message
  const previewText = useMemo(() => {
    const items = selectedTasks.map((task) => {
      const taskFiles = attachments.filter((a) => a.taskId === task.id);
      const attachmentNumbers = taskFiles.map(
        (f) => attachments.findIndex((a) => a.id === f.id) + 1,
      );
      return {
        title: task.title,
        notes: notes[task.id] ?? null,
        attachmentNumbers,
      };
    });

    return buildTaskUpdateText({
      language: msgLang,
      senderName,
      items,
      attachmentCount: attachments.length,
    });
  }, [selectedTasks, notes, attachments, msgLang, senderName]);

  const handleSubmit = async () => {
    if (selectedTasks.length === 0) return;
    setSending(true);
    setError(null);

    try {
      const form = new FormData();
      form.set("client_request_id", newRequestId());
      form.set("language", msgLang);

      const items: TaskUpdateItem[] = selectedTasks.map((task) => ({
        task_id: task.id,
        notes: notes[task.id]?.trim() || null,
      }));
      form.set("items", JSON.stringify(items));

      // Append files and their matching task IDs
      for (const att of attachments) {
        form.append("file", att.file, att.file.name);
        form.append("file_task_id", att.taskId);
      }

      const res = await client.post<TaskUpdateResponse>(
        `/conversations/${encodeURIComponent(conversationId)}/task-updates`,
        form,
      );

      if (res.update.status === "failed") {
        setError(res.update.error ?? t.failed);
      } else {
        if (onSuccess) onSuccess(res);
        onClose();
      }
    } catch (err) {
      if (err instanceof WaaiApiError) {
        if (err.code === "offline") setError(t.offline);
        else if (err.code === "payload_too_large") setError(t.fileTooLarge);
        else setError(err.message || t.failed);
      } else {
        setError(t.failed);
      }
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-update-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 id="task-update-title" className="type-card-title text-slate-800">
              {t.title}
            </h3>
            <p className="type-meta text-slate-500">{t.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.cancel}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-rose-700">
              <AlertCircle className="size-4 shrink-0" />
              <span className="type-body">{error}</span>
            </div>
          )}

          {completedTasks.length === 0 ? (
            <p className="type-body py-8 text-center text-slate-500">{t.noCompletedTasks}</p>
          ) : (
            <>
              {/* Task Selection Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="type-label text-slate-700">{t.selectTasks}</h4>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedIds(new Set(completedTasks.map((t) => t.id)))}
                      className="type-meta text-green-700 hover:underline cursor-pointer"
                    >
                      Select all
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={() => setSelectedIds(new Set())}
                      className="type-meta text-slate-500 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {completedTasks.map((task) => {
                    const isChecked = selectedIds.has(task.id);
                    const taskAttachments = attachments.filter((a) => a.taskId === task.id);

                    return (
                      <div
                        key={task.id}
                        className={`rounded-2xl border p-3.5 transition-all ${
                          isChecked
                            ? "border-green-200 bg-green-50/20"
                            : "border-slate-200 bg-slate-50/50 opacity-70"
                        }`}
                      >
                        <label className="flex cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleTask(task.id)}
                            className="mt-0.5 size-4 rounded accent-green-600"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="type-body font-semibold text-slate-800">
                              {task.title}
                            </span>
                            {task.assignee && (
                              <p className="type-meta text-slate-500">
                                {task.assignee}
                                {task.due_at && ` · ${task.due_at.slice(0, 10)}`}
                              </p>
                            )}
                          </div>
                        </label>

                        {/* Note and attachment section for selected task */}
                        {isChecked && (
                          <div className="mt-3 pl-7 space-y-2">
                            <div>
                              <textarea
                                value={notes[task.id] ?? ""}
                                onChange={(e) => setTaskNote(task.id, e.target.value)}
                                placeholder={t.notesPlaceholder}
                                rows={2}
                                className="type-body w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-800 placeholder:text-slate-400 focus:border-green-600 focus:outline-none"
                              />
                              <div className="text-right type-meta text-slate-400">
                                {(notes[task.id] ?? "").length} / {MAX_NOTE_CHARS}
                              </div>
                            </div>

                            {/* Attachments for this task */}
                            <div className="flex flex-wrap items-center gap-2">
                              {taskAttachments.map((att) => (
                                <span
                                  key={att.id}
                                  className="type-meta inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 shadow-xs"
                                >
                                  {att.file.type.startsWith("image/") ? (
                                    <Image className="size-3.5 text-green-600" />
                                  ) : (
                                    <FileText className="size-3.5 text-slate-500" />
                                  )}
                                  <span className="max-w-32 truncate">{att.file.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => removeAttachment(att.id)}
                                    className="cursor-pointer text-slate-400 hover:text-rose-600"
                                    aria-label={t.removeFile}
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                </span>
                              ))}

                              <button
                                type="button"
                                onClick={() => {
                                  setTargetTaskIdForUpload(task.id);
                                  fileInputRef.current?.click();
                                }}
                                className="type-meta inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-slate-300 bg-white px-3 py-1 text-slate-600 transition-colors hover:border-green-500 hover:text-green-700"
                              >
                                <Paperclip className="size-3.5" />
                                {t.attachFiles}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Language selection for message */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <span className="type-label text-slate-700">{t.language}</span>
                <div className="flex gap-1.5">
                  {(["en", "sk", "hu"] as const).map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setMsgLang(code)}
                      className={`type-meta cursor-pointer rounded-full border px-3 py-1 font-medium transition-all ${
                        msgLang === code
                          ? "border-green-600 bg-green-50 text-green-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {code.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live WhatsApp preview */}
              <div className="space-y-1.5">
                <h4 className="type-meta font-bold uppercase tracking-wider text-slate-400">
                  {t.preview}
                </h4>
                <div className="type-body rounded-2xl border border-slate-200 bg-slate-50 p-4 font-sans text-slate-800 whitespace-pre-line shadow-inner">
                  {previewText}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="type-label cursor-pointer rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={selectedTasks.length === 0 || sending}
            className="type-label inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-green-600 px-5 py-2.5 font-bold text-white shadow-md shadow-green-600/20 transition-all hover:bg-green-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {sending ? t.sending : t.sendUpdate}
          </button>
        </div>
      </div>
    </div>
  );
};
