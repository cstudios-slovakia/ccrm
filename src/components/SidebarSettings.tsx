import React from "react";
import {
  Pin,
  Sparkles,
  SlidersHorizontal,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import type { Language } from "../utils/translations";
import { useUserPref } from "../utils/userPrefs";
import { cn } from "../utils/cn";

interface SidebarSettingsProps {
  systemLanguage: Language;
  compact?: boolean;
}

export const SidebarSettings: React.FC<SidebarSettingsProps> = ({ systemLanguage, compact = false }) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  const [sidebarPinned, setSidebarPinned] = useUserPref("sidebarPinned");
  const [sidebarCompactness, setSidebarCompactness] = useUserPref("sidebarCompactness");
  const [sidebarUnpinnedStyle, setSidebarUnpinnedStyle] = useUserPref("sidebarUnpinnedStyle");

  const handleTogglePin = (pinned: boolean) => {
    setSidebarPinned(pinned);
  };

  const handleCompactnessChange = (level: "compact" | "comfortable" | "spacious") => {
    setSidebarCompactness(level);
  };

  const handleUnpinnedStyleChange = (style: "overlay" | "dock") => {
    setSidebarUnpinnedStyle(style);
  };

  return (
    <div className={cn("text-left", compact ? "space-y-4" : "space-y-6 pt-5 border-t border-slate-200/80")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-indigo-50 text-indigo-600">
            <SlidersHorizontal className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-ui font-bold text-slate-800">
              {t("Sidebar & Navigation", "Bočné menu & Navigácia", "Oldalsáv és Navigáció")}
            </h4>
            <p className="text-micro font-medium text-slate-500 mt-0.5">
              {t(
                "Customize left sidebar behavior, density and depth style",
                "Prispôsobte správanie ľavého menu, hustotu a hĺbku",
                "Szabja testre a bal oldalsáv működését, sűrűségét és stílusát"
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Grid of Main Settings */}
      <div className={cn("grid gap-4", compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2")}>
        {/* 1. Pinning Behavior */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3">
          <label className="type-overline text-slate-600 block">
            {t("Sidebar Attachment", "Uchytenie bočného menu", "Oldalsáv rögzítése")}
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleTogglePin(false)}
              className={cn(
                "p-3 rounded-xl border text-left flex flex-col gap-2 transition-all cursor-pointer relative",
                !sidebarPinned
                  ? "bg-indigo-50/70 border-indigo-500/60 ring-2 ring-indigo-500/20"
                  : "bg-slate-50/50 border-slate-200 hover:bg-slate-100/60"
              )}
            >
              <div className="flex items-center justify-between">
                <PanelLeftClose className={cn("h-4 w-4", !sidebarPinned ? "text-indigo-600" : "text-slate-400")} />
                {!sidebarPinned && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />}
              </div>
              <div>
                <span className="text-ui font-bold text-slate-800 block">
                  {t("Floating Overlay", "Plávajúce menu", "Lebegő menü")}
                </span>
                <span className="text-micro text-slate-500 leading-tight block mt-0.5">
                  {t("Floats over UI on hover", "Rozbalí sa pri prechode myšou", "Rámutatáskor kinyílik")}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleTogglePin(true)}
              className={cn(
                "p-3 rounded-xl border text-left flex flex-col gap-2 transition-all cursor-pointer relative",
                sidebarPinned
                  ? "bg-indigo-50/70 border-indigo-500/60 ring-2 ring-indigo-500/20"
                  : "bg-slate-50/50 border-slate-200 hover:bg-slate-100/60"
              )}
            >
              <div className="flex items-center justify-between">
                <Pin className={cn("h-4 w-4", sidebarPinned ? "text-indigo-600 fill-indigo-600" : "text-slate-400")} />
                {sidebarPinned && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />}
              </div>
              <div>
                <span className="text-ui font-bold text-slate-800 block">
                  {t("Pinned Column", "Pripnutý stĺpec", "Rögzített oszlop")}
                </span>
                <span className="text-micro text-slate-500 leading-tight block mt-0.5">
                  {t("Permanent column with depth shadow", "Trvalý stĺpec s vnútorným tieňom", "Állandó oszlop belső árnyékkal")}
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* 2. Compactness Density */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3">
          <label className="type-overline text-slate-600 block">
            {t("Sidebar size", "Veľkosť bočného menu", "Oldalsáv mérete")}
          </label>

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: "compact", label: t("Compact", "Kompaktné", "Kompakt"), sub: "64px / 224px" },
                { id: "comfortable", label: t("Comfortable", "Pohodlné", "Kényelmes"), sub: "80px / 256px" },
                { id: "spacious", label: t("Spacious", "Priestranné", "Tágas"), sub: "96px / 288px" }
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleCompactnessChange(opt.id)}
                className={cn(
                  "p-2.5 rounded-xl border text-center flex flex-col items-center justify-center gap-1 transition-all cursor-pointer",
                  sidebarCompactness === opt.id
                    ? "bg-indigo-50/70 border-indigo-500/60 ring-2 ring-indigo-500/20"
                    : "bg-slate-50/50 border-slate-200 hover:bg-slate-100/60"
                )}
              >
                <span
                  className={cn(
                    "text-ui font-bold block",
                    sidebarCompactness === opt.id ? "text-indigo-600" : "text-slate-700"
                  )}
                >
                  {opt.label}
                </span>
                <span className="text-micro text-slate-500 block">{opt.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 3. Unpinned Interaction Style */}
        <div className={cn("p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3", !compact && "md:col-span-2")}>
          <div className="flex items-center justify-between">
            <label className="type-overline text-slate-600 block">
              {t("Unpinned Interaction Style", "Štýl nepripnutého menu", "Nem rögzített oldalsáv stílusa")}
            </label>
            <span className="text-micro text-slate-500">
              {t("Active when sidebar is unpinned", "Platí, keď menu nie je pripnuté", "Akkor él, ha az oldalsáv nincs rögzítve")}
            </span>
          </div>

          <div className={cn("grid gap-3", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
            <button
              type="button"
              onClick={() => handleUnpinnedStyleChange("overlay")}
              className={cn(
                "p-3 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer",
                sidebarUnpinnedStyle === "overlay"
                  ? "bg-indigo-50/70 border-indigo-500/60 ring-2 ring-indigo-500/20"
                  : "bg-slate-50/50 border-slate-200 hover:bg-slate-100/60"
              )}
            >
              <div className="p-2 rounded-xl bg-slate-100 text-slate-600 shrink-0">
                <PanelLeftOpen className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-ui font-bold text-slate-800 block">
                  {t("Standard Flyout", "Štandardné vysunutie", "Kinyíló sáv")}
                </span>
                <span className="text-micro text-slate-500 leading-snug block mt-0.5">
                  {t(
                    "Expands sidebar smoothly on hover with full labels",
                    "Plynule vysunie celé menu s popiskami pri prejdení myšou",
                    "Rámutatáskor kinyitja az oldalsávot a teljes feliratokkal"
                  )}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleUnpinnedStyleChange("dock")}
              className={cn(
                "p-3 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer",
                sidebarUnpinnedStyle === "dock"
                  ? "bg-indigo-50/70 border-indigo-500/60 ring-2 ring-indigo-500/20"
                  : "bg-slate-50/50 border-slate-200 hover:bg-slate-100/60"
              )}
            >
              <div className="p-2 rounded-xl bg-purple-100 text-purple-600 shrink-0">
                <Sparkles className="h-4 w-4 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-ui font-bold text-slate-800 flex items-center gap-1.5">
                  {t("Dynamic macOS Dock", "Dynamický macOS Dock", "Dinamikus macOS Dock")}
                  <span className="type-overline px-1.5 py-0.2 rounded-md bg-purple-100 text-purple-700">
                    NEW
                  </span>
                </span>
                <span className="text-micro text-slate-500 leading-snug block mt-0.5">
                  {t(
                    "Fluid cursor-distance icon magnification with floating tooltips",
                    "Zväčšovanie ikon podľa vzdialenosti kurzora a plávajúce popisky",
                    "Kurzortávolság alapú nagyítás lebegő feliratokkal"
                  )}
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
