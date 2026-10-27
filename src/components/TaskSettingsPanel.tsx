import React from "react";
import { SectionCard } from "./settings/SectionCard";
import { Info } from "lucide-react";
import type { TaskSettings } from "../types";
import type { Language } from "../utils/translations";

interface TaskSettingsPanelProps {
  settings: TaskSettings;
  setSettings: React.Dispatch<React.SetStateAction<TaskSettings>>;
  userLanguage: Language;
  canEdit: boolean;
}

/**
 * Settings → Tasks. For now a single switch: whether the "Requires conclusion"
 * checkbox is offered when a task is created. Switching it off does not touch
 * tasks that already carry the flag — they keep asking for a conclusion.
 */
export const TaskSettingsPanel: React.FC<TaskSettingsPanelProps> = ({
  settings,
  setSettings,
  userLanguage,
  canEdit,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;
  const on = settings.offerConclusion;
  const defaultOn = settings.defaultRequiresConclusion;

  return (
    <SectionCard
      title={t("Tasks", "Úlohy", "Feladatok")}
    >
      <div className="space-y-3">
        <label
          className={`flex items-start gap-3 p-4 rounded-2xl border-2 transition-colors ${
            on ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200 bg-white"
          } ${canEdit ? "cursor-pointer hover:border-indigo-300" : "cursor-not-allowed opacity-70"}`}
        >
          <input
            type="checkbox"
            data-testid="task-settings-offer-conclusion"
            checked={on}
            disabled={!canEdit}
            onChange={(e) => setSettings((prev) => ({ ...prev, offerConclusion: e.target.checked }))}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-indigo-600 disabled:cursor-not-allowed"
          />
          <span className="space-y-1 min-w-0">
            <span className="block text-ui font-bold text-slate-800">
              {t(
                'Offer "Requires conclusion" when creating a task',
                'Ponúknuť „Vyžaduje záver“ pri vytváraní úlohy',
                'A „Záró összegzés szükséges” felajánlása feladat létrehozásakor',
              )}
            </span>
            <span className="block text-ui font-medium text-slate-500">
              {t(
                "A task marked this way can only be completed after whoever finishes it writes a conclusion — a short note or report on how it went.",
                "Úloha označená týmto spôsobom sa dá dokončiť, až keď ten, kto ju uzatvára, napíše záver — krátku poznámku alebo správu o tom, ako úloha dopadla.",
                "Az így megjelölt feladat csak akkor fejezhető be, ha a lezáró személy összegzést ír — rövid jegyzetet vagy beszámolót arról, hogyan zárult.",
              )}
            </span>
          </span>
        </label>

        {/* Sub-setting: child of the offerConclusion option above */}
        <div className="relative pl-6 sm:pl-7 ml-4 sm:ml-6">
          <div
            aria-hidden="true"
            className={`absolute -top-3 left-0 w-4 sm:w-6 h-10 border-l-2 border-b-2 rounded-bl-xl transition-colors pointer-events-none ${
              on ? "border-indigo-300" : "border-slate-300/70 opacity-60"
            }`}
          />
          <label
            title={
              !on
                ? t(
                    "Available when 'Offer Requires conclusion' is enabled",
                    "Dostupné, keď je zapnuté „Ponúknuť Vyžaduje záver“",
                    "Elérhető, ha a „Záró összegzés felajánlása” be van kapcsolva",
                  )
                : undefined
            }
            className={`flex items-start gap-3 p-4 rounded-2xl border-2 transition-colors ${
              !on
                ? "border-slate-200 bg-slate-50/60 opacity-60 cursor-not-allowed"
                : defaultOn
                ? "border-indigo-200 bg-indigo-50/40"
                : "border-slate-200 bg-white"
            } ${canEdit && on ? "cursor-pointer hover:border-indigo-300" : "cursor-not-allowed"}`}
          >
            <input
              type="checkbox"
              data-testid="task-settings-default-conclusion"
              checked={Boolean(defaultOn)}
              disabled={!canEdit || !on}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, defaultRequiresConclusion: e.target.checked }))
              }
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-indigo-600 disabled:cursor-not-allowed"
            />
            <span className="space-y-1 min-w-0">
              <span className="block text-ui font-bold text-slate-800">
                {t(
                  'Require conclusion by default on new tasks',
                  'Vyžadovať záver v nových úlohách v predvolenom stave',
                  'Alapértelmezés szerint záró összegzés megkövetelése új feladatoknál',
                )}
              </span>
              <span className="block text-ui font-medium text-slate-500">
                {t(
                  'When creating a new task, the "Requires conclusion" checkbox will already be checked.',
                  'Pri vytváraní novej úlohy bude začiarkavacie políčko „Vyžaduje záver“ už predvolene začiarknuté.',
                  'Új feladat létrehozásakor a „Záró összegzés szükséges” jelölőnégyzet már alapértelmezetten be lesz jelölve.',
                )}
              </span>
            </span>
          </label>
        </div>
      </div>

      <p className="flex items-start gap-2 text-micro font-semibold text-slate-400">
        <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
        <span>
          {t(
            "Turning this off only hides the checkbox for new tasks. Tasks that already require a conclusion keep requiring it.",
            "Vypnutie len skryje začiarkavacie políčko pri nových úlohách. Úlohy, ktoré už záver vyžadujú, ho vyžadujú naďalej.",
            "A kikapcsolás csak az új feladatoknál rejti el a jelölőnégyzetet. A már összegzést igénylő feladatok továbbra is igénylik azt.",
          )}
        </span>
      </p>
    </SectionCard>
  );
};
