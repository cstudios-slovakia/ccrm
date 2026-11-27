import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, ExternalLink, FileCode2, FileText, Loader2, Paperclip, X } from "lucide-react";
import type { TaskFile } from "../../types";
import type { Language } from "../../utils/translations";
import {
  fetchTaskFileTextPreview,
  formatFileSize,
  isPdfFile,
  isPreviewableCodeFile,
} from "../../utils/taskFilesApi";

interface TaskFilePreviewModalProps {
  file: TaskFile | null;
  systemLanguage: Language;
  onClose: () => void;
}

export const TaskFilePreviewModal: React.FC<TaskFilePreviewModalProps> = ({
  file,
  systemLanguage,
  onClose,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  const [textData, setTextData] = useState<{
    text: string;
    truncated: boolean;
    language: string;
  } | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isPdf = file ? isPdfFile(file.fileName, file.mimeType) : false;
  const isCode = file ? !file.isImage && !isPdf && (file.isCodePreviewable || isPreviewableCodeFile(file.fileName, file.mimeType)) : false;

  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [file, onClose]);

  useEffect(() => {
    if (!file || !isCode) {
      setTextData(null);
      setTextLoading(false);
      setTextError(null);
      return;
    }
    const controller = new AbortController();
    setTextLoading(true);
    setTextError(null);
    setTextData(null);
    fetchTaskFileTextPreview(file.id, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setTextData({ text: res.text, truncated: res.truncated, language: res.language });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setTextError(err instanceof Error ? err.message : t("Failed to load file preview.", "Nepodarilo sa načítať náhľad súboru.", "Nem sikerült betölteni a fájl előnézetét."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setTextLoading(false);
      });
    return () => controller.abort();
  }, [file?.id, isCode]);

  if (!file || typeof document === "undefined") return null;

  const handleCopyCode = async () => {
    if (!textData?.text) return;
    try {
      await navigator.clipboard.writeText(textData.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard error
    }
  };

  if (file.isImage) {
    return createPortal(
      <div
        data-testid="task-file-preview-modal"
        onClick={onClose}
        className="fixed inset-0 z-[100040] bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center p-4"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-4 right-4 flex items-center gap-2"
        >
          <a
            href={file.downloadUrl || file.url}
            download={file.fileName}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-caption font-semibold"
          >
            <Download className="h-4 w-4" />
            <span>{t("Download", "Stiahnuť", "Letöltés")}</span>
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close preview", "Zavrieť náhľad", "Előnézet bezárása")}
            className="p-2 rounded-full bg-white/15 text-white hover:bg-white/25 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <img
          src={file.url}
          alt={file.fileName}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[84vh] max-w-[92vw] rounded-lg shadow-2xl object-contain"
        />
        <div className="mt-2.5 flex items-center gap-2 text-caption text-white/85 font-medium">
          <span>{file.fileName}</span>
          {file.sizeBytes > 0 && <span className="text-white/60 tabular-nums">({formatFileSize(file.sizeBytes)})</span>}
        </div>
      </div>,
      document.body,
    );
  }

  const HeaderIcon = isCode ? FileCode2 : isPdf ? FileText : Paperclip;
  const lines = textData ? textData.text.replace(/\r\n/g, "\n").split("\n") : [];

  return createPortal(
    <div
      data-testid="task-file-preview-modal"
      onClick={onClose}
      className="fixed inset-0 z-[100040] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl h-[86vh] bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <HeaderIcon className="h-4 w-4 text-slate-600 shrink-0" />
            <span className="text-ui font-bold text-slate-900 truncate">{file.fileName}</span>
            {file.sizeBytes > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-slate-200/70 text-micro font-semibold text-slate-700 tabular-nums shrink-0">
                {formatFileSize(file.sizeBytes)}
              </span>
            )}
            {textData?.language && (
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-micro font-mono font-semibold shrink-0">
                {textData.language}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isCode && textData?.text && (
              <button
                type="button"
                onClick={() => void handleCopyCode()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-caption font-semibold text-slate-700 cursor-pointer"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? t("Copied", "Skopírované", "Másolva") : t("Copy", "Kopírovať", "Másolás")}</span>
              </button>
            )}
            {isPdf && (
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-caption font-semibold text-slate-700"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>{t("Open tab", "Otvoriť na karte", "Megnyitás lapon")}</span>
              </a>
            )}
            <a
              href={file.downloadUrl || file.url}
              download={file.fileName}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-entity-solid text-white hover:opacity-90 text-caption font-semibold"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{t("Download", "Stiahnuť", "Letöltés")}</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("Close", "Zavrieť", "Bezárás")}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto bg-slate-50">
          {isPdf ? (
            <iframe
              src={file.url}
              title={file.fileName}
              className="w-full h-full border-0 bg-white"
            />
          ) : isCode ? (
            <div className="h-full flex flex-col">
              {textData?.truncated && (
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-caption text-amber-800 shrink-0">
                  {t(
                    "Preview truncated at 512 KB. Download the file to inspect its full contents.",
                    "Náhľad bol skrátený na 512 KB. Pre celý obsah si súbor stiahnite.",
                    "Az előnézet 512 KB-nál le lett vágva. A teljes tartalomhoz töltse le a fájlt.",
                  )}
                </div>
              )}
              {textLoading ? (
                <div className="flex-1 flex items-center justify-center gap-2 text-caption text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t("Loading preview...", "Načítavam náhľad...", "Előnézet betöltése...")}</span>
                </div>
              ) : textError ? (
                <div className="p-6 text-caption text-rose-700">{textError}</div>
              ) : (
                <pre
                  data-testid="task-file-code-viewer"
                  className="flex-1 overflow-auto p-4 bg-slate-950 text-slate-100 font-mono text-caption leading-relaxed m-0"
                >
                  <code>
                    {lines.map((line, i) => (
                      <div key={i} className="flex gap-4">
                        <span className="select-none text-slate-500 text-right w-10 shrink-0 tabular-nums">
                          {i + 1}
                        </span>
                        <span className="whitespace-pre-wrap break-all">{line || " "}</span>
                      </div>
                    ))}
                  </code>
                </pre>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="h-14 w-14 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-slate-500">
                <Paperclip className="h-6 w-6" />
              </div>
              <p className="text-ui font-semibold text-slate-800">{file.fileName}</p>
              <p className="text-caption text-slate-500">
                {t(
                  "Browser preview is not available for this file type.",
                  "Pre tento typ súboru nie je dostupný náhľad v prehliadači.",
                  "Ehhez a fájltípushoz nem érhető el böngészős előnézet.",
                )}
              </p>
              <a
                href={file.downloadUrl || file.url}
                download={file.fileName}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-entity-solid text-white text-caption font-semibold hover:opacity-90"
              >
                <Download className="h-4 w-4" />
                <span>{t("Download file", "Stiahnuť súbor", "Fájl letöltése")}</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
