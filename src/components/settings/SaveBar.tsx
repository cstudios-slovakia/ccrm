import React from "react";
import { getTranslation } from "../../utils/translations";
import type { Language } from "../../utils/translations";

/**
 * The floating "Unsaved changes / Discard / Save" bar of the phone layout. It only
 * wraps forms that already have an explicit Save; settings that save immediately
 * never show it. Fixed to the bottom of the screen, above the safe area.
 */
export const SaveBar: React.FC<{
  lang: Language;
  /** What changed, e.g. "Company name, IBAN". */
  detail: string;
  onSave: () => void;
  onDiscard: () => void;
}> = ({ lang, detail, onSave, onDiscard }) => (
  <div
    role="region"
    aria-label={getTranslation(lang, "settings.nav.ui.unsaved")}
    data-testid="settings-save-bar"
    className="settings-menu-in fixed bottom-24 left-3 right-20 z-40 lg:bottom-4 flex items-center gap-2.5 rounded-3xl bg-slate-900 py-2.5 pl-4 pr-2.5 shadow-2xl [padding-bottom:max(0.625rem,env(safe-area-inset-bottom))]"
  >
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="text-ui font-bold text-white">{getTranslation(lang, "settings.nav.ui.unsaved")}</span>
      <span className="truncate text-caption text-slate-300">{detail}</span>
    </span>
    <button
      type="button"
      onClick={onDiscard}
      data-testid="settings-save-bar-discard"
      className="min-h-11 shrink-0 cursor-pointer rounded-2xl border border-slate-600 bg-transparent px-3.5 text-ui font-semibold text-slate-200 transition-colors hover:bg-slate-800"
    >
      {getTranslation(lang, "settings.nav.ui.discard")}
    </button>
    <button
      type="button"
      onClick={onSave}
      data-testid="settings-save-bar-save"
      className="min-h-11 shrink-0 cursor-pointer rounded-2xl bg-indigo-600 px-4.5 text-ui font-bold text-white transition-colors hover:bg-indigo-500"
    >
      {getTranslation(lang, "settings.nav.ui.save")}
    </button>
  </div>
);
