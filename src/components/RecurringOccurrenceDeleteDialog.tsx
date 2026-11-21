import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Trash2, StopCircle } from "lucide-react";
import type { Task } from "../types";

export type OccurrenceDeleteChoice = "only_this" | "all_future" | "cancel";

export type Translate = (en: string, sk: string, hu: string) => string;

interface RecurringOccurrenceDeleteDialogProps {
  task: Task | null;
  onChoice: (choice: OccurrenceDeleteChoice) => void;
  t: Translate;
}

export const RecurringOccurrenceDeleteDialog: React.FC<RecurringOccurrenceDeleteDialogProps> = ({
  task,
  onChoice,
  t,
}) => {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!task) return;
    cancelBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onChoice("cancel");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [task, onChoice]);

  if (typeof document === "undefined" || !task) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[100020] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onChoice("cancel");
        }}
      >
        <motion.div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="recurring-delete-title"
          data-testid="recurring-occurrence-delete-dialog"
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-full max-w-md overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          <div className="p-6">
            <div className="flex items-start gap-3.5 mb-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-600 border border-amber-200">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0 pt-0.5">
                <h2
                  id="recurring-delete-title"
                  className="type-title-sm text-gray-900 font-semibold"
                >
                  {t("Delete recurring task", "Odstrániť opakovanú úlohu", "Ismétlődő feladat törlése")}
                </h2>
                <p className="mt-1 text-ui text-gray-500 font-medium">
                  {t(
                    `"${task.title}" is part of a repeating series. How would you like to delete it?`,
                    `"${task.title}" je súčasťou opakovanej série. Ako ju chcete odstrániť?`,
                    `A(z) "${task.title}" egy ismétlődő sorozat része. Hogyan szeretné törölni?`
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-2.5 mt-5">
              <button
                type="button"
                onClick={() => onChoice("only_this")}
                className="w-full p-3.5 flex items-start gap-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 text-left transition-all cursor-pointer group"
              >
                <Trash2 className="w-5 h-5 text-gray-400 group-hover:text-gray-700 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-ui font-semibold text-gray-900">
                    {t("Only this task", "Iba túto úlohu", "Csak ezt a feladatot")}
                  </span>
                  <span className="block text-caption text-gray-500 mt-0.5">
                    {t(
                      "Skips this occurrence. The series continues with the next scheduled date.",
                      "Vynechá tento jeden výskyt. Séria pokračuje ďalším termínom.",
                      "Kihagyja ezt az előfordulást. A sorozat a következő határidővel folytatódik."
                    )}
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onChoice("all_future")}
                className="w-full p-3.5 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50/50 hover:bg-rose-50 hover:border-rose-300 text-left transition-all cursor-pointer group"
              >
                <StopCircle className="w-5 h-5 text-rose-500 group-hover:text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-ui font-semibold text-rose-700">
                    {t("This and all future tasks", "Túto a všetky budúce úlohy", "Ezt és minden jövőbeli feladatot")}
                  </span>
                  <span className="block text-caption text-rose-600/80 mt-0.5">
                    {t(
                      "Deletes this task and stops the series. Closed past tasks stay in history.",
                      "Odstráni túto úlohu a zastaví celú sériu. Uzavreté úlohy zostanú v histórii.",
                      "Törli ezt a feladatot és leállítja a sorozatot. A lezárt feladatok megmaradnak az előzményekben."
                    )}
                  </span>
                </div>
              </button>
            </div>

            <div className="mt-5 pt-4 border-t border-gray-200 flex justify-end">
              <button
                ref={cancelBtnRef}
                type="button"
                onClick={() => onChoice("cancel")}
                className="px-4 py-2 text-ui font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-all cursor-pointer"
              >
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};
