import React from "react";
import { ArrowRight, Lock, Settings2 } from "lucide-react";
import type { Language } from "../../utils/translations";

/**
 * Stand-in for a module whose setup is not done yet (RAG AI without a vector
 * database, Mail without a connected mailbox).
 *
 * These modules used to be hidden from the navigation until configured, which
 * gave no hint they existed or what they needed. They stay listed now and open
 * to this card: what is missing, and a jump to the exact settings section. The
 * real view is not mounted behind it, so it cannot fire requests that are bound
 * to fail.
 */

interface ModuleSetupRequiredProps {
  language: Language;
  icon: React.ComponentType<{ className?: string }>;
  moduleName: string;
  /** One line on why the module cannot run yet. */
  description: string;
  /** Each setting that still has to be filled in, in plain words. */
  missing: string[];
  /** Where the settings live, e.g. "Settings → AI integration". */
  settingsLocation: string;
  /** Omitted when this user may not change those settings. */
  onOpenSettings?: () => void;
}

const t = (lang: Language, en: string, sk: string, hu: string): string =>
  lang === "sk" ? sk : lang === "hu" ? hu : en;

export const ModuleSetupRequired: React.FC<ModuleSetupRequiredProps> = ({
  language,
  icon: Icon,
  moduleName,
  description,
  missing,
  settingsLocation,
  onOpenSettings,
}) => (
  <div className="w-full flex justify-center py-6 sm:py-12 animate-fade-in" data-testid="module-setup-required">
    <div className="w-full max-w-xl glass-panel rounded-3xl border border-slate-200 bg-white/95 shadow-glass p-6 sm:p-8 space-y-6">
      <div className="flex items-start gap-4">
        <div className="relative shrink-0 h-12 w-12 rounded-2xl bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center">
          <Icon className="h-6 w-6" />
          <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center">
            <Lock className="h-3 w-3" />
          </span>
        </div>
        <div className="min-w-0">
          <span className="inline-block text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            {t(language, "Inactive — setup required", "Neaktívne — chýba nastavenie", "Inaktív — beállítás szükséges")}
          </span>
          <h3 className="mt-2 text-base font-heading font-extrabold text-slate-900">{moduleName}</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500 leading-relaxed">{description}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-amber-50/60 border border-amber-200 p-4 space-y-2">
        <span className="block text-[9px] font-black uppercase tracking-widest text-amber-800">
          {t(language, "Missing settings", "Chýbajúce nastavenia", "Hiányzó beállítások")}
        </span>
        <ul className="space-y-1.5">
          {missing.map((item) => (
            <li key={item} className="flex items-start gap-2 text-xs font-semibold text-amber-900">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="pt-1 text-[10px] font-bold text-amber-800/70">{settingsLocation}</p>
      </div>

      {onOpenSettings ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onOpenSettings}
            className="group px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-2 shadow-md shadow-indigo-600/20 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 cursor-pointer"
          >
            <Settings2 className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-90" />
            {t(language, "Open settings", "Otvoriť nastavenia", "Beállítások megnyitása")}
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
        </div>
      ) : (
        <p className="text-[11px] font-semibold text-slate-500 text-right">
          {t(
            language,
            "Ask an administrator to complete this setup.",
            "Požiadajte administrátora o dokončenie nastavenia.",
            "Kérje meg az adminisztrátort a beállítás befejezésére."
          )}
        </p>
      )}
    </div>
  </div>
);

export default ModuleSetupRequired;
