import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { AlertTriangle, Sparkles } from "lucide-react";
import type { Language } from "../../utils/translations";

interface TemplateRenameDialogProps {
  lang: Language;
  /** The name the AI proposed; pre-filled and selected so typing replaces it. */
  initialName: string;
  /** Names of the other templates — a clash is allowed but warned about. */
  otherNames: string[];
  /** Where focus goes when the dialog closes (the upload control that started it). */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  onSave: (name: string) => void;
  onKeep: () => void;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Offered right after an AI template is generated: the model's name is a guess,
 * and the name is what tells templates apart in the editor's picker. Enter saves,
 * Esc keeps the proposed name; Tab stays inside the dialog, and focus goes back
 * to the control that opened it. Mounted only while open (the caller wraps it in
 * AnimatePresence).
 */
export const TemplateRenameDialog: React.FC<TemplateRenameDialogProps> = ({
  lang,
  initialName,
  otherNames,
  returnFocusRef,
  onSave,
  onKeep
}) => {
  const t = (en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const trimmed = name.trim();
  const empty = trimmed === "";
  const duplicate = !empty && otherNames.some(other => sameName(other, trimmed));

  // Focus in, text selected; focus back out when the dialog goes away.
  useEffect(() => {
    const returnTo = returnFocusRef?.current ?? (document.activeElement as HTMLElement | null);
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => returnTo?.focus?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () => {
    if (!empty) onSave(trimmed);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onKeep();
      return;
    }
    if (e.key === "Enter" && e.target === inputRef.current) {
      e.preventDefault();
      save();
      return;
    }
    if (e.key === "Tab") {
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>("input, button:not(:disabled)") ?? []
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      // Same layer as ConfirmDialog: above drawers and select panels.
      className="fixed inset-0 z-[100020] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onKeep();
      }}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ccrm-template-rename-title"
        data-testid="template-rename-dialog"
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        onMouseDown={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-start gap-3 p-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            <Sparkles className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id="ccrm-template-rename-title" className="font-heading text-body font-bold text-slate-800 break-words">
              {t("Name this template", "Pomenujte šablónu", "Nevezze el a sablont")}
            </h2>
            <p className="mt-1.5 text-ui text-slate-500 break-words">
              {t(
                "The AI suggested this name. It tells your templates apart in the offer editor — keep it or type your own.",
                "Toto meno navrhla AI. Podľa neho rozoznáte šablóny v editore ponuky — ponechajte ho alebo napíšte vlastné.",
                "Ezt a nevet az AI javasolta. Ez különbözteti meg a sablonokat az ajánlatszerkesztőben — tartsa meg, vagy írjon sajátot."
              )}
            </p>
            <input
              ref={inputRef}
              type="text"
              value={name}
              maxLength={150}
              onChange={e => setName(e.target.value)}
              aria-label={t("Template name", "Názov šablóny", "Sablon neve")}
              aria-invalid={empty}
              data-testid="template-rename-input"
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-ui text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
            />
            {empty && (
              <p className="mt-1.5 text-caption font-semibold text-rose-600" role="alert">
                {t("The name cannot be empty.", "Názov nesmie byť prázdny.", "A név nem lehet üres.")}
              </p>
            )}
            {duplicate && (
              <p className="mt-1.5 flex items-start gap-1.5 text-caption font-semibold text-amber-700" data-testid="template-rename-duplicate">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t(
                  "Another template already has this name — they will be hard to tell apart.",
                  "Iná šablóna už má tento názov — budú sa ťažko rozlišovať.",
                  "Egy másik sablon már ezt a nevet viseli — nehéz lesz megkülönböztetni őket."
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <button
            type="button"
            data-testid="template-rename-keep"
            onClick={onKeep}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-ui font-bold text-slate-600 transition-all hover:bg-slate-50 hover:border-slate-300 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 cursor-pointer"
          >
            {t("Keep", "Ponechať", "Megtart")}
          </button>
          <button
            type="button"
            data-testid="template-rename-save"
            disabled={empty}
            onClick={save}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-ui font-bold text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {t("Save", "Uložiť", "Mentés")}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};
