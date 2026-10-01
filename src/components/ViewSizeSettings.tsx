import React from "react";
import type { Language } from "../utils/translations";
import { cn } from "../utils/cn";
import { VIEW_SIZE_ENABLED } from "../utils/featureFlags";
import { applyViewSize, setStoredViewSizeMode, useViewSize, type ViewSize, type ViewSizeMode } from "../utils/viewSize";

interface ViewSizeSettingsProps {
  systemLanguage: Language;
}

/**
 * The per-device View size setting (docs/VIEW-SIZE.md §3.1). Not mounted
 * anywhere until Phase F flips VIEW_SIZE_ENABLED; until then it renders nothing.
 */
export const ViewSizeSettings: React.FC<ViewSizeSettingsProps> = ({ systemLanguage }) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;
  const { mode, size } = useViewSize();

  if (!VIEW_SIZE_ENABLED) return null;

  const sizeName = (s: ViewSize) =>
    s === "compact" ? t("Compact", "Kompaktné", "Kompakt")
    : s === "normal" ? t("Normal", "Normálne", "Normál")
    : t("Big", "Veľké", "Nagy");

  const options: { id: ViewSizeMode; label: string; sub: string }[] = [
    {
      id: "auto",
      label: t("Auto", "Automaticky", "Automatikus"),
      sub: t(
        `Follows the window width · now ${sizeName(size)}`,
        `Podľa šírky okna · teraz ${sizeName(size)}`,
        `Az ablak szélessége szerint · most ${sizeName(size)}`
      ),
    },
    {
      id: "compact",
      label: t("Compact", "Kompaktné", "Kompakt"),
      sub: t("Phones & laptops", "Mobily a notebooky", "Telefonok és laptopok"),
    },
    {
      id: "normal",
      label: t("Normal", "Normálne", "Normál"),
      sub: t("Full HD & 1440p monitors", "Monitory Full HD a 1440p", "Full HD és 1440p monitorok"),
    },
    {
      id: "big",
      label: t("Big", "Veľké", "Nagy"),
      sub: t("iMac & large monitors", "iMac a veľké monitory", "iMac és nagy monitorok"),
    },
  ];

  const choose = (next: ViewSizeMode) => {
    setStoredViewSizeMode(next);
    applyViewSize(next);
  };

  return (
    <div className="@container p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3">
      <div>
        <label className="type-label text-slate-700 block">
          {t("View size", "Veľkosť zobrazenia", "Nézet mérete")}
        </label>
        <p className="type-meta text-slate-500">
          {t(
            "Text size, spacing and layout everywhere except the sidebar",
            "Veľkosť písma, rozostupy a rozloženie všade okrem bočného menu",
            "Betűméret, térközök és elrendezés mindenhol, az oldalsáv kivételével"
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 @lg:grid-cols-4 gap-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => choose(opt.id)}
            aria-pressed={mode === opt.id}
            className={cn(
              "p-2.5 rounded-xl border text-center flex flex-col items-center justify-center gap-1 transition-all cursor-pointer",
              mode === opt.id
                ? "bg-indigo-50/70 border-indigo-500/60 ring-2 ring-indigo-500/20"
                : "bg-slate-50/50 border-slate-200 hover:bg-slate-100/60"
            )}
          >
            <span className={cn("text-ui font-bold block", mode === opt.id ? "text-indigo-600" : "text-slate-700")}>
              {opt.label}
            </span>
            <span className="type-meta text-slate-500 block">{opt.sub}</span>
          </button>
        ))}
      </div>

      <p className="type-meta text-slate-400">
        {t("Saved on this device only", "Uloží sa len v tomto zariadení", "Csak ezen az eszközön tárolódik")}
      </p>
    </div>
  );
};
