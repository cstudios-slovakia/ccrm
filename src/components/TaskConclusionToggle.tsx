import React from "react";
import { Info } from "lucide-react";
import type { Translate } from "../utils/taskLabels";

/** What the "Requires conclusion" checkbox explains, as shown in its tooltip. */
export const conclusionHint = (t: Translate): string =>
  t(
    "When this task is completed, whoever finishes it must write a conclusion — a short note or report on how it went. The task cannot be set to done until the conclusion is filled in.",
    "Pri dokončení úlohy bude musieť ten, kto ju uzatvára, napísať záver — krátku poznámku alebo správu o tom, ako úloha dopadla. Kým záver nie je vyplnený, úlohu nie je možné nastaviť ako hotovú.",
    "A feladat befejezésekor a lezáró személynek összegzést kell írnia — rövid jegyzetet vagy beszámolót arról, hogyan zárult. Amíg az összegzés nincs kitöltve, a feladat nem állítható késznek.",
  );

interface TaskConclusionToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  t: Translate;
  disabled?: boolean;
  /** Custom explanation when the toggle is disabled (e.g. restriction reason). */
  disabledHint?: string;
  /** Smaller paddings for the compact quick-create popup. */
  compact?: boolean;
}

/**
 * "Requires conclusion" — the checkbox shared by the quick-create popup and the
 * Edit Task drawer. The explanation sits in a tooltip on the info icon (and on
 * the whole row, for touch and screen readers).
 */
export const TaskConclusionToggle: React.FC<TaskConclusionToggleProps> = ({
  checked,
  onChange,
  t,
  disabled = false,
  disabledHint,
  compact = false,
}) => {
  const hint = disabled && disabledHint ? disabledHint : conclusionHint(t);
  return (
    <label
      title={hint}
      onClick={(e) => {
        if (disabled) e.preventDefault();
      }}
      className={`flex items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 ${
        compact ? "p-2" : "p-3"
      } ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-indigo-50"} transition-colors`}
    >
      <span className="type-overline text-indigo-700 flex items-center gap-1.5 min-w-0">
        <span className="group/hint relative inline-flex">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 w-64 rounded-xl bg-slate-900 px-3 py-2 text-micro font-semibold normal-case tracking-normal text-white shadow-xl opacity-0 transition-opacity duration-150 group-hover/hint:opacity-100"
          >
            {hint}
          </span>
        </span>
        <span className="truncate">{t("Requires conclusion", "Vyžaduje záver", "Záró összegzés szükséges")}</span>
      </span>
      <input
        type="checkbox"
        data-testid="task-requires-conclusion"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={t("Requires conclusion", "Vyžaduje záver", "Záró összegzés szükséges")}
        className="h-4 w-4 shrink-0 cursor-pointer accent-indigo-600 disabled:cursor-not-allowed"
      />
    </label>
  );
};
