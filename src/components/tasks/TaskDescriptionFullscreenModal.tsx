import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { FileText, Minimize2, X } from "lucide-react";
import type { TaskFile } from "../../types";
import type { Language } from "../../utils/translations";
import { BlockEditor, type EditorBlock } from "../BlockEditor";
import { parseNotesToBlocks } from "../../utils/blockNotes";
import { TaskFilesPanel } from "./TaskFilesPanel";

interface TaskDescriptionFullscreenModalProps {
  open: boolean;
  title: string;
  taskId: string;
  description: string;
  systemLanguage: Language;
  currentUserName: string;
  currentUserRole?: string;
  canEdit: boolean;
  filesRefreshKey?: number;
  insertFileSignal?: { nonce: number; file: TaskFile } | null;
  onInsertFileHandled?: (nonce: number) => void;
  onChangeDescription: (blocks: EditorBlock[]) => void;
  onUploadFile?: (file: File) => Promise<TaskFile | null>;
  onPreviewFile?: (file: TaskFile) => void;
  onInsertIntoDescription?: (file: TaskFile) => void;
  onFilesChanged?: (info: { fileCount: number; event: "load" | "upload" | "delete" }) => void;
  onClose: () => void;
}

export const TaskDescriptionFullscreenModal: React.FC<TaskDescriptionFullscreenModalProps> = ({
  open,
  title,
  taskId,
  description,
  systemLanguage,
  currentUserName,
  currentUserRole,
  canEdit,
  filesRefreshKey = 0,
  insertFileSignal,
  onInsertFileHandled,
  onChangeDescription,
  onUploadFile,
  onPreviewFile,
  onInsertIntoDescription,
  onFilesChanged,
  onClose,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-testid="task-description-fullscreen-modal"
      className="fixed inset-0 z-[100025] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
    >
      <div className="w-full max-w-6xl h-[92vh] bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-8 w-8 rounded-lg bg-entity-subtle text-entity-text border border-entity-border flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="type-overline text-entity-text leading-none mb-0.5">
                {t("Description & Files", "Popis a súbory", "Leírás és fájlok")}
              </p>
              <h2 className="text-ui font-bold text-slate-900 truncate">
                {title || t("Untitled task", "Úloha bez názvu", "Névtelen feladat")}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="task-description-fullscreen-close-btn"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-caption font-semibold text-slate-700 cursor-pointer"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              <span>{t("Exit fullscreen", "Zavrieť celú obrazovku", "Teljes képernyő bezárása")}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("Close", "Zavrieť", "Bezárás")}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Split view body */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* Wide description editor */}
          <div className="min-h-0 overflow-y-auto p-6 sm:pl-14 bg-white">
            <BlockEditor
              key={`fullscreen-desc-${taskId || "draft"}`}
              initialBlocks={parseNotesToBlocks(description)}
              onChange={onChangeDescription}
              systemLanguage={systemLanguage}
              readOnly={!canEdit}
              fillHeight
              exportTitle={title}
              onUploadFile={canEdit ? onUploadFile : undefined}
              onPreviewFile={onPreviewFile}
              insertFileSignal={insertFileSignal}
              onInsertFileHandled={onInsertFileHandled}
            />
          </div>

          {/* Right side files list */}
          <div className="min-h-0 flex flex-col bg-slate-50/70">
            <div className="px-4 py-3 border-b border-slate-200 bg-white shrink-0">
              <h3 className="text-caption font-bold text-slate-900">
                {t("Task Files", "Súbory úlohy", "Feladat fájljai")}
              </h3>
              <p className="text-micro text-slate-500 mt-0.5">
                {t(
                  "Click 'Insert into description' to embed any file inline.",
                  "Kliknutím na 'Vložiť do popisu' vložíte súbor priamo do textu.",
                  "Kattintson a 'Beillesztés a leírásba' gombra a beágyazáshoz.",
                )}
              </p>
            </div>
            {taskId ? (
              <TaskFilesPanel
                taskId={taskId}
                systemLanguage={systemLanguage}
                currentUserName={currentUserName}
                currentUserRole={currentUserRole}
                canEdit={canEdit}
                refreshKey={filesRefreshKey}
                compact
                onFilesChanged={onFilesChanged}
                onInsertIntoDescription={onInsertIntoDescription}
                onPreviewFile={onPreviewFile}
              />
            ) : (
              <div className="p-4 text-caption text-slate-500">
                {t(
                  "Save this task first to manage attached files.",
                  "Pre správu súborov najprv uložte túto úlohu.",
                  "A fájlok kezeléséhez először mentse el a feladatot.",
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
