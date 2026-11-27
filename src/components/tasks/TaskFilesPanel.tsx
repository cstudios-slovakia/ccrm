import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  Eye,
  FileCode2,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { TaskFile } from "../../types";
import type { Language } from "../../utils/translations";
import {
  deleteTaskFile,
  fetchTaskFiles,
  formatFileSize,
  isBlockedUploadExtension,
  isPdfFile,
  isPreviewableCodeFile,
  MAX_TASK_FILE_BYTES,
  uploadTaskFile,
} from "../../utils/taskFilesApi";
import { TaskFilePreviewModal } from "./TaskFilePreviewModal";

interface PendingUploadRow {
  localId: string;
  name: string;
  error?: string;
}

interface TaskFilesPanelProps {
  taskId: string;
  systemLanguage: Language;
  currentUserName: string;
  currentUserRole?: string;
  canEdit: boolean;
  refreshKey?: number;
  compact?: boolean;
  onFilesChanged?: (info: { fileCount: number; event: "load" | "upload" | "delete" }) => void;
  onInsertIntoDescription?: (file: TaskFile) => void;
  onPreviewFile?: (file: TaskFile) => void;
}

export const TaskFilesPanel: React.FC<TaskFilesPanelProps> = ({
  taskId,
  systemLanguage,
  currentUserName,
  currentUserRole,
  canEdit,
  refreshKey = 0,
  compact = false,
  onFilesChanged,
  onInsertIntoDescription,
  onPreviewFile,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  const isAdmin = (currentUserRole || "").toLowerCase() === "admin";
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState<PendingUploadRow[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [internalPreview, setInternalPreview] = useState<TaskFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onFilesChangedRef = useRef(onFilesChanged);
  onFilesChangedRef.current = onFilesChanged;

  const loadFiles = useCallback(
    async (signal?: AbortSignal) => {
      if (!taskId) {
        setFiles([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetchTaskFiles(taskId, signal);
        if (signal?.aborted) return;
        setFiles(res.files);
        onFilesChangedRef.current?.({ fileCount: res.fileCount, event: "load" });
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : t("Failed to load files.", "Nepodarilo sa načítať súbory.", "Nem sikerült betölteni a fájlokat."));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [taskId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadFiles(controller.signal);
    return () => controller.abort();
  }, [loadFiles, refreshKey]);

  const handleUploadList = async (fileList: FileList | File[]) => {
    if (!canEdit || !taskId) return;
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    for (const file of incoming) {
      const localId = `tf-up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      if (isBlockedUploadExtension(file.name)) {
        setPending((prev) => [
          ...prev,
          {
            localId,
            name: file.name,
            error: t("Executable file type is blocked.", "Spustiteľný typ súboru je blokovaný.", "Futtatható fájltípus tiltva."),
          },
        ]);
        continue;
      }
      if (file.size <= 0 || file.size > MAX_TASK_FILE_BYTES) {
        setPending((prev) => [
          ...prev,
          {
            localId,
            name: file.name,
            error: t("File exceeds 25 MB limit.", "Súbor presahuje limit 25 MB.", "A fájl meghaladja a 25 MB-os korlátot."),
          },
        ]);
        continue;
      }

      setPending((prev) => [...prev, { localId, name: file.name }]);
      try {
        const res = await uploadTaskFile(taskId, file);
        setPending((prev) => prev.filter((p) => p.localId !== localId));
        setFiles((prev) => [res.file, ...prev.filter((f) => f.id !== res.file.id)]);
        onFilesChangedRef.current?.({ fileCount: res.fileCount, event: "upload" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : t("Upload failed", "Nahrávanie zlyhalo", "Feltöltés sikertelen");
        setPending((prev) => prev.map((p) => (p.localId === localId ? { ...p, error: msg } : p)));
      }
    }
  };

  const handleDelete = async (file: TaskFile) => {
    setDeletingId(file.id);
    setConfirmDeleteId(null);
    try {
      const res = await deleteTaskFile(taskId, file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      onFilesChangedRef.current?.({ fileCount: res.fileCount, event: "delete" });
    } catch (err) {
      (window as any).showToast?.(
        err instanceof Error ? err.message : t("Delete failed.", "Zmazanie zlyhalo.", "Törlés sikertelen."),
        "error",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const openPreview = (file: TaskFile) => {
    if (onPreviewFile) {
      onPreviewFile(file);
    } else {
      setInternalPreview(file);
    }
  };

  return (
    <div
      data-testid="task-files-panel"
      className="flex flex-col flex-1 min-h-0 overflow-hidden"
    >
      {canEdit && taskId && (
        <div className={compact ? "p-3 pb-2 shrink-0" : "p-4 pb-2 shrink-0"}>
          <input
            ref={inputRef}
            type="file"
            multiple
            data-testid="task-files-file-input"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void handleUploadList(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            data-testid="task-files-upload-btn"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              if (Array.from(e.dataTransfer.types).includes("Files")) {
                e.preventDefault();
                setDragOver(true);
              }
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
              if (e.dataTransfer.files?.length) {
                void handleUploadList(e.dataTransfer.files);
              }
            }}
            className={`w-full rounded-xl border border-dashed px-3 py-3 text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-1 ${
              dragOver
                ? "border-entity-solid bg-entity-subtle text-entity-text"
                : "border-gray-300 bg-white hover:border-entity hover:bg-entity-subtle/40 text-gray-600"
            }`}
          >
            <Upload className="h-4 w-4 text-entity-text" />
            <span className="text-caption font-semibold text-gray-800">
              {t("Click or drop files to attach", "Kliknite alebo presuňte súbory", "Kattintson vagy húzza ide a fájlokat")}
            </span>
            <span className="text-micro text-gray-400">
              {t("Docs, images, code & configs up to 25 MB", "Dokumenty, obrázky, kód a konfigurácie do 25 MB", "Dokumentumok, képek, kód és konfigurációk 25 MB-ig")}
            </span>
          </button>
        </div>
      )}

      <div className={`flex-1 min-h-0 overflow-y-auto space-y-2 ${compact ? "px-3 pb-3" : "px-4 pb-4"}`}>
        {pending.map((row) => (
          <div
            key={row.localId}
            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-caption ${
              row.error
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {!row.error && <Loader2 className="h-3.5 w-3.5 animate-spin text-entity-text shrink-0" />}
              <span className="truncate font-medium">{row.name}</span>
              {row.error && <span className="text-micro font-semibold shrink-0">{row.error}</span>}
            </div>
            {row.error && (
              <button
                type="button"
                onClick={() => setPending((prev) => prev.filter((p) => p.localId !== row.localId))}
                className="p-0.5 rounded hover:bg-rose-100 cursor-pointer shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}

        {loading ? (
          <div className="py-10 flex items-center justify-center gap-2 text-caption text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t("Loading files...", "Načítavam súbory...", "Fájlok betöltése...")}</span>
          </div>
        ) : error ? (
          <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-caption text-rose-700">
            {error}
          </div>
        ) : files.length === 0 ? (
          <div className="py-10 text-center space-y-1.5 text-gray-400">
            <Paperclip className="h-6 w-6 mx-auto opacity-60" />
            <p className="text-caption font-semibold text-gray-500">
              {t("No files attached yet", "Zatiaľ nie sú priložené žiadne súbory", "Még nincsenek csatolt fájlok")}
            </p>
            <p className="text-micro text-gray-400">
              {t(
                "Upload files here or use /file in the task description.",
                "Nahrajte súbory sem alebo napíšte /file v popise úlohy.",
                "Töltsön fel fájlokat ide vagy használja a /file parancsot a leírásban.",
              )}
            </p>
          </div>
        ) : (
          files.map((file) => {
            const isPdf = isPdfFile(file.fileName, file.mimeType);
            const isCode = !file.isImage && !isPdf && (file.isCodePreviewable || isPreviewableCodeFile(file.fileName, file.mimeType));
            const canPreview = file.isImage || isPdf || isCode;
            const canDeleteFile = canEdit && (isAdmin || file.uploadedBy === currentUserName);
            const Icon = isCode ? FileCode2 : isPdf ? FileText : Paperclip;

            return (
              <div
                key={file.id}
                data-testid="task-file-item"
                className="group rounded-xl border border-gray-200 bg-white p-2.5 shadow-2xs space-y-2 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    disabled={!canPreview}
                    onClick={() => canPreview && openPreview(file)}
                    className="h-10 w-10 rounded-lg border border-gray-200 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0 cursor-pointer disabled:cursor-default"
                    title={canPreview ? t("Preview", "Náhľad", "Előnézet") : file.fileName}
                  >
                    {file.isImage ? (
                      <img src={file.url} alt={file.fileName} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <Icon className="h-4.5 w-4.5 text-slate-500" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      disabled={!canPreview}
                      onClick={() => canPreview && openPreview(file)}
                      className="text-left text-caption font-semibold text-gray-900 hover:text-entity-text truncate block w-full cursor-pointer disabled:cursor-default"
                      title={file.fileName}
                    >
                      {file.fileName}
                    </button>
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-micro text-gray-400">
                      <span className="tabular-nums">{formatFileSize(file.sizeBytes)}</span>
                      {file.uploadedBy && <span>• {file.uploadedBy}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-gray-100">
                  <div>
                    {canEdit && onInsertIntoDescription && (
                      <button
                        type="button"
                        data-testid="task-file-insert-btn"
                        onClick={() => onInsertIntoDescription(file)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-entity-subtle hover:bg-entity-subtle/80 text-entity-text border border-entity-border text-micro font-bold cursor-pointer transition-colors"
                        title={t("Insert inline into task description", "Vložiť priamo do popisu úlohy", "Beillesztés a feladat leírásába")}
                      >
                        <Plus className="h-3 w-3" />
                        <span>{t("Insert into description", "Vložiť do popisu", "Beillesztés a leírásba")}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {canPreview && (
                      <button
                        type="button"
                        data-testid="task-file-preview-btn"
                        onClick={() => openPreview(file)}
                        className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 cursor-pointer"
                        title={t("Preview", "Náhľad", "Előnézet")}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <a
                      href={file.downloadUrl || file.url}
                      download={file.fileName}
                      data-testid="task-file-download-btn"
                      className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                      title={t("Download", "Stiahnuť", "Letöltés")}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                    {canDeleteFile && (
                      confirmDeleteId === file.id ? (
                        <span className="inline-flex items-center gap-0.5">
                          <button
                            type="button"
                            disabled={deletingId === file.id}
                            data-testid="task-file-delete-confirm-btn"
                            onClick={() => void handleDelete(file)}
                            className="p-1 rounded bg-rose-600 text-white hover:bg-rose-700 cursor-pointer disabled:opacity-50"
                            title={t("Confirm delete", "Potvrdiť zmazanie", "Törlés megerősítése")}
                          >
                            {deletingId === file.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
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
                          data-testid="task-file-delete-btn"
                          onClick={() => setConfirmDeleteId(file.id)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title={t("Delete file", "Zmazať súbor", "Fájl törlése")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {!onPreviewFile && internalPreview && (
        <TaskFilePreviewModal
          file={internalPreview}
          systemLanguage={systemLanguage}
          onClose={() => setInternalPreview(null)}
        />
      )}
    </div>
  );
};
