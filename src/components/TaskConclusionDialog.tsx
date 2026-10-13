import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckSquare, X } from "lucide-react";
import type { Task } from "../types";
import type { Language } from "../utils/translations";
import { CONCLUSION_MAX, cleanConclusion } from "../utils/taskConclusion";

const makeT =
  (lang: Language) =>
  (en: string, sk: string, hu: string): string =>
    lang === "sk" ? sk : lang === "hu" ? hu : en;

interface TaskConclusionDialogProps {
  task: Pick<Task, "title">;
  lang: Language;
  /** Called with the trimmed, non-empty conclusion. */
  onConfirm: (conclusion: string) => void;
  onCancel: () => void;
}

/**
 * Asks for the conclusion of a task that is about to be completed. Used wherever
 * a task can be completed without opening its drawer (the board's status
 * dropdown, the project / client task lists, the pipeline gate).
 */
export const TaskConclusionDialog: React.FC<TaskConclusionDialogProps> = ({ task, lang, onConfirm, onCancel }) => {
  const t = makeT(lang);
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const cleaned = cleanConclusion(text);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100001] flex items-center justify-center p-4">
      <div onClick={onCancel} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in" />
      <form
        role="dialog"
        aria-modal="true"
        aria-label={t("Conclusion required", "Vyžaduje sa záver", "Összegzés szükséges")}
        data-testid="task-conclusion-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (cleaned) onConfirm(cleaned);
        }}
        className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4 text-ui font-bold animate-fade-in"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <span className="type-overline text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5">
              <CheckSquare className="h-3.5 w-3.5 text-indigo-600" />
              {t("Conclusion required", "Vyžaduje sa záver", "Összegzés szükséges")}
            </span>
            <h2 className="type-page-title text-slate-900 leading-snug break-words">{task.title}</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("Close", "Zavrieť", "Bezárás")}
            className="p-1 hover:bg-slate-100 active:scale-95 rounded-lg text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-1">
          <label className="type-overline text-slate-500" htmlFor="task-conclusion-text">
            {t("Conclusion", "Záver", "Összegzés")}
          </label>
          <textarea
            id="task-conclusion-text"
            ref={ref}
            rows={4}
            required
            maxLength={CONCLUSION_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t(
              "A short note or report on how the task was finished…",
              "Krátka poznámka alebo správa o tom, ako úloha dopadla…",
              "Rövid jegyzet vagy beszámoló arról, hogyan zárult a feladat…",
            )}
            className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-indigo-600 focus:outline-none resize-none text-ui font-bold"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-ui transition-colors cursor-pointer shrink-0"
          >
            {t("Cancel", "Zrušiť", "Mégse")}
          </button>
          <button
            type="submit"
            disabled={!cleaned}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-xl font-bold text-ui shadow-lg shadow-indigo-600/20 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("Complete task", "Dokončiť úlohu", "Feladat befejezése")}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
};

type Pending = { task: Task; resolve: (conclusion: string | null) => void };

/**
 * `ask(task)` opens the dialog and resolves with the conclusion, or null when
 * the person backs out. Render `dialog` once anywhere in the component.
 *
 *   const { ask, dialog } = useTaskConclusionPrompt(lang);
 *   const conclusion = await ask(task);
 *   if (conclusion === null) return;   // cancelled — leave the task as it was
 */
export const useTaskConclusionPrompt = (lang: Language) => {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;

  const ask = useCallback(
    (task: Task) =>
      new Promise<string | null>((resolve) => {
        // A second request while one is open cancels the first.
        pendingRef.current?.resolve(null);
        setPending({ task, resolve });
      }),
    [],
  );

  const close = useCallback((conclusion: string | null) => {
    pendingRef.current?.resolve(conclusion);
    setPending(null);
  }, []);

  const dialog = pending ? (
    <TaskConclusionDialog
      task={pending.task}
      lang={lang}
      onConfirm={(text) => close(text)}
      onCancel={() => close(null)}
    />
  ) : null;

  return { ask, dialog };
};
