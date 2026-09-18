import React from "react";
import { BrainCircuit, KeyRound, X } from "lucide-react";
import { hasOpenAiKey, openAiSettings } from "../../utils/aiConfig";
import { useUserPref } from "../../utils/userPrefs";
import type { Language } from "../../utils/translations";

/**
 * Warning shown at the top of a section whose features need OpenAI, when no key
 * is configured.
 *
 * Without it the AI sections look healthy until the user presses the button and
 * gets a failure toast — the missing key is invisible up to that point. The
 * three exits map to the three honest reactions: fix it now (jump straight to
 * the field), not now (hidden until reload, everywhere at once), never (stored
 * per user in metadata_json, so it follows them across devices).
 */

/** Session-wide dismissal: one "not now" hides every mounted banner at once. */
const DISMISS_EVENT = "ccrm:ai-key-banner-dismissed";
let dismissedThisSession = false;

interface AiKeyBannerProps {
  integrationsConfig: any;
  language: Language;
  /**
   * Name of the blocked feature, e.g. "AI financial report". Quoted in the
   * sentence rather than used as its subject, so a label of any gender or
   * number stays grammatical in all three languages.
   */
  feature?: string;
  className?: string;
}

const t = (lang: Language, en: string, sk: string, hu: string): string =>
  lang === "sk" ? sk : lang === "hu" ? hu : en;

export const AiKeyBanner: React.FC<AiKeyBannerProps> = ({
  integrationsConfig,
  language,
  feature,
  className = "",
}) => {
  const [dismissedForever, setDismissedForever] = useUserPref("aiKeyBannerDismissed");
  const [hiddenForSession, setHiddenForSession] = React.useState(dismissedThisSession);

  React.useEffect(() => {
    const onDismiss = () => setHiddenForSession(true);
    window.addEventListener(DISMISS_EVENT, onDismiss);
    return () => window.removeEventListener(DISMISS_EVENT, onDismiss);
  }, []);

  if (hasOpenAiKey(integrationsConfig) || dismissedForever || hiddenForSession) return null;

  const dismissForSession = () => {
    dismissedThisSession = true;
    window.dispatchEvent(new Event(DISMISS_EVENT));
  };

  const explanation = feature
    ? t(
        language,
        `“${feature}” needs an OpenAI API key. It stays unavailable until an administrator saves one in Settings → AI integration.`,
        `Funkcia „${feature}“ vyžaduje OpenAI API kľúč. Kým ho administrátor neuloží v Nastaveniach → AI integrácia, zostane nedostupná.`,
        `A(z) „${feature}“ funkció OpenAI API kulcsot igényel. Amíg egy adminisztrátor nem ment kulcsot a Beállítások → AI integráció alatt, nem érhető el.`
      )
    : t(
        language,
        "The AI features in this section stay unavailable until an administrator saves an OpenAI API key in Settings → AI integration.",
        "AI funkcie v tejto sekcii zostanú nedostupné, kým administrátor neuloží OpenAI API kľúč v Nastaveniach → AI integrácia.",
        "Az ebben a szakaszban lévő AI funkciók addig nem érhetők el, amíg egy adminisztrátor nem ment OpenAI API kulcsot a Beállítások → AI integráció alatt."
      );

  return (
    <div
      // `bg-white` under the gradient keeps the panel opaque: callers pin this
      // banner with `sticky`, and a translucent one let the view scroll through it.
      className={`animate-fade-in relative overflow-hidden rounded-3xl border border-amber-200 bg-white bg-gradient-to-r from-amber-50 via-amber-50 to-amber-50/40 p-4 sm:p-5 shadow-sm transition-shadow duration-300 hover:shadow-md ${className}`}
    >
      {/* Stacked rather than side-by-side: this banner is dropped into columns
          as narrow as a client detail panel, where a horizontal row squeezed the
          sentence into three cramped lines beside the buttons. */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 h-10 w-10 rounded-2xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center">
            <BrainCircuit className="h-5 w-5 animate-pulse" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-amber-900">
              {t(language, "OpenAI API key is missing", "Chýba OpenAI API kľúč", "Hiányzik az OpenAI API kulcs")}
            </h4>
            <p className="text-[11px] font-semibold text-amber-800/80 leading-relaxed mt-0.5">{explanation}</p>
          </div>
          <button
            type="button"
            onClick={dismissForSession}
            title={t(language, "Hide for now", "Skryť dočasne", "Elrejtés egyelőre")}
            className="shrink-0 -mt-1 -mr-1 p-2 rounded-xl text-amber-900/50 hover:text-amber-900 hover:bg-white/70 transition-all duration-200 hover:rotate-90 active:scale-95 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={openAiSettings}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {t(language, "Add the key", "Doplniť kľúč", "Kulcs megadása")}
          </button>
          <button
            type="button"
            onClick={() => setDismissedForever(true)}
            className="px-3 py-2 rounded-xl bg-white/70 hover:bg-white text-amber-900/70 hover:text-amber-900 border border-amber-200 text-[10px] font-black uppercase tracking-wider transition-all duration-200 active:scale-95 cursor-pointer"
          >
            {t(language, "Don't show again", "Už nezobrazovať", "Ne jelenjen meg többé")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiKeyBanner;
