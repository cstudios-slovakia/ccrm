import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Info, Trash } from "lucide-react";
import { cn } from "../../utils/cn";
import { MENU_EDIT_LAYER_ATTR, editBtn } from "./primitives";

/**
 * "Potvrdenie vymazania" from the design: a rose trash badge, the question, what
 * happens to the group's modules, one grey note strip, Cancel + a rose button.
 * Escape and the backdrop cancel; focus starts on Cancel (the safe answer).
 */
export interface DeleteGroupDialogProps {
  open: boolean;
  title: string;
  body: string;
  note?: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteGroupDialog: React.FC<DeleteGroupDialogProps> = ({
  open,
  title,
  body,
  note,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => cancelRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onCancel]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          {...{ [MENU_EDIT_LAYER_ATTR]: "" }}
          className="view-size-fixed fixed inset-0 z-[100060] flex items-center justify-center p-4"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <motion.div
            className="absolute inset-0 bg-slate-900/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onCancel}
            aria-hidden="true"
          />
          <motion.section
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-5 flex flex-col gap-3 shadow-[0_25px_50px_-12px_rgb(15_23_42/0.25)] text-left"
          >
            <span className="size-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
              <Trash className="size-5" aria-hidden="true" />
            </span>
            <h2 className="m-0 type-panel-title text-slate-900">{title}</h2>
            <p className="m-0 text-body text-slate-600">{body}</p>
            {note && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-slate-50">
                <Info className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
                <span className="text-caption text-slate-600">{note}</span>
              </div>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <button ref={cancelRef} type="button" className={cn(editBtn.base, editBtn.secondary)} onClick={onCancel}>
                {cancelLabel}
              </button>
              <button type="button" className={cn(editBtn.base, editBtn.danger)} onClick={onConfirm}>
                {confirmLabel}
              </button>
            </div>
          </motion.section>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
