import React from "react";
import { Download, Eye, FileCode2, FileText, Paperclip, Trash2 } from "lucide-react";
import type { EditorBlock } from "../../utils/blockNotes";
import type { TaskFile } from "../../types";
import type { Language } from "../../utils/translations";
import { formatFileSize, isPdfFile, isPreviewableCodeFile } from "../../utils/taskFilesApi";

interface TaskInlineFileBlockProps {
  block: EditorBlock;
  readOnly?: boolean;
  compact?: boolean;
  systemLanguage?: Language;
  onPreview?: (file: TaskFile) => void;
  onRemove?: () => void;
}

export const TaskInlineFileBlock: React.FC<TaskInlineFileBlockProps> = ({
  block,
  readOnly = false,
  compact = false,
  systemLanguage = "en",
  onPreview,
  onRemove,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  const fileName = block.fileName || t("Attachment", "Príloha", "Melléklet");
  const fileUrl = block.fileUrl || "";
  const fileMime = block.fileMime || "application/octet-stream";
  const fileSize = Number(block.fileSize || 0);
  const isImage = Boolean(block.fileIsImage);
  const isCode = isPreviewableCodeFile(fileName, fileMime);
  const isPdf = isPdfFile(fileName, fileMime);
  const canPreview = isImage || isPdf || isCode;
  const downloadUrl = fileUrl ? (fileUrl.includes("?") ? `${fileUrl}&download=1` : fileUrl) : "";

  const syntheticFile: TaskFile = {
    id: block.fileId || block.id,
    taskId: "",
    fileName,
    mimeType: fileMime,
    sizeBytes: fileSize,
    isImage,
    isCodePreviewable: isCode,
    url: fileUrl,
    downloadUrl,
    uploadedBy: "",
    createdAt: "",
  };

  if (isImage && fileUrl) {
    return (
      <div
        data-testid="block-editor-file-block"
        contentEditable={false}
        className="group/file relative inline-flex flex-col max-w-full rounded-xl border border-slate-200 bg-slate-50/70 overflow-hidden shadow-2xs select-none"
      >
        <button
          type="button"
          onClick={() => onPreview?.(syntheticFile)}
          className="block text-left cursor-zoom-in bg-slate-100/70"
          title={t("Preview image", "Zobraziť obrázok", "Kép előnézete")}
        >
          <img
            src={fileUrl}
            alt={fileName}
            loading="lazy"
            className={compact ? "max-h-56 w-auto max-w-full object-contain" : "max-h-96 w-auto max-w-full object-contain"}
          />
        </button>
        <div className="flex items-center justify-between gap-3 px-2.5 py-1.5 bg-white border-t border-slate-200 text-micro">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-slate-800 truncate">{fileName}</span>
            {fileSize > 0 && (
              <span className="text-slate-400 tabular-nums shrink-0">{formatFileSize(fileSize)}</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onPreview && (
              <button
                type="button"
                onClick={() => onPreview(syntheticFile)}
                className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                title={t("Preview", "Náhľad", "Előnézet")}
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            )}
            {downloadUrl && (
              <a
                href={downloadUrl}
                download={fileName}
                onClick={(e) => e.stopPropagation()}
                className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                title={t("Download", "Stiahnuť", "Letöltés")}
              >
                <Download className="h-3.5 w-3.5" />
              </a>
            )}
            {!readOnly && onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                title={t("Remove from description", "Odstrániť z popisu", "Eltávolítás a leírásból")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const Icon = isCode ? FileCode2 : isPdf ? FileText : Paperclip;

  return (
    <div
      data-testid="block-editor-file-block"
      contentEditable={false}
      className="flex items-center justify-between gap-2.5 w-full rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-white px-3 py-2 transition-colors select-none"
    >
      <button
        type="button"
        disabled={!canPreview || !onPreview}
        onClick={() => canPreview && onPreview?.(syntheticFile)}
        className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer disabled:cursor-default"
      >
        <span className="h-8 w-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 shrink-0 shadow-2xs">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-caption font-semibold text-slate-800 truncate">{fileName}</span>
          {fileSize > 0 && (
            <span className="block text-micro text-slate-400 tabular-nums">
              {formatFileSize(fileSize)}
            </span>
          )}
        </span>
      </button>

      <div className="flex items-center gap-1 shrink-0">
        {canPreview && onPreview && (
          <button
            type="button"
            onClick={() => onPreview(syntheticFile)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-micro font-semibold text-slate-700 cursor-pointer"
            title={t("Preview file", "Náhľad súboru", "Fájl előnézete")}
          >
            <Eye className="h-3 w-3" />
            <span className="hidden sm:inline">{t("Preview", "Náhľad", "Előnézet")}</span>
          </button>
        )}
        {downloadUrl && (
          <a
            href={downloadUrl}
            download={fileName}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-micro font-semibold text-slate-700"
            title={t("Download file", "Stiahnuť súbor", "Fájl letöltése")}
          >
            <Download className="h-3 w-3" />
            <span className="hidden sm:inline">{t("Download", "Stiahnuť", "Letöltés")}</span>
          </a>
        )}
        {!readOnly && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
            title={t("Remove from description", "Odstrániť z popisu", "Eltávolítás a leírásból")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
