import React, { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Crosshair, Loader2, Moon, Palette, Sun, Sunrise, Sunset } from "lucide-react";
import {
  HERB_THEMES,
  THEME_MODES,
  applyTheme,
  describeAutoSchedule,
  getStoredTheme,
  requestPreciseLocation,
  type Appearance,
  type ThemeMode,
} from "../utils/theme";
import { localeCodeFor } from "../utils/localTime";
import type { Language } from "../utils/translations";
import { CustomSelect } from "./ui/CustomSelect";

interface ThemeSettingsProps {
  systemLanguage: Language;
  /** Light palette id — see HERB_THEMES. */
  userTheme?: string;
  setUserTheme?: (theme: string) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  /** What the mode currently resolves to, so the screen can say so out loud. */
  appearance: Appearance;
}

/** The app's standard entrance curve, shared with the drawer/dialog keyframes. */
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const ThemeSettings: React.FC<ThemeSettingsProps> = ({
  systemLanguage,
  userTheme,
  setUserTheme,
  themeMode,
  setThemeMode,
  appearance,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  const reduceMotion = useReducedMotion();
  const [locating, setLocating] = useState(false);

  const currentThemeId = userTheme || getStoredTheme();
  const currentThemeObj = HERB_THEMES.find((th) => th.id === currentThemeId) || HERB_THEMES[0];
  const activeMode = THEME_MODES.find((m) => m.id === themeMode) || THEME_MODES[0];
  const isDark = appearance === "dark";

  // Recomputed on every render: it is a handful of trigonometric operations, and
  // it has to stay honest as the day moves and after a location is granted.
  const schedule = describeAutoSchedule();
  const formatTime = (date: Date | null) =>
    date
      ? date.toLocaleTimeString(localeCodeFor(systemLanguage), { hour: "2-digit", minute: "2-digit" })
      : "—";

  const handleUseLocation = async () => {
    setLocating(true);
    const coords = await requestPreciseLocation();
    setLocating(false);
    if (!coords) {
      (window as any).showToast?.(
        t(
          "Location unavailable — the sunrise times stay estimated from your time zone.",
          "Poloha nie je dostupná — časy východu slnka zostávajú odhadnuté z časového pásma.",
          "A helyadat nem érhető el — a napkelte időpontja az időzónából becsült marad."
        )
      );
      return;
    }
    // Re-applying the same mode makes the watcher recompute against the new
    // position and re-arm its timer for the corrected sunset.
    setThemeMode(themeMode);
  };

  return (
    <div className="space-y-4 pt-3 border-t border-slate-200/80">
      {/* -------------------------------------------------- Appearance mode */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
            {isDark ? (
              <Moon className="h-3.5 w-3.5 text-indigo-500" />
            ) : (
              <Sun className="h-3.5 w-3.5 text-amber-500" />
            )}
            {t("Appearance", "Vzhľad", "Megjelenés")}
          </label>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-700 shadow-xs">
            <span>{isDark ? "🌙" : "☀️"}</span>
            <span>
              {t("Now", "Teraz", "Most")}:{" "}
              {isDark ? t("Dark", "Tmavá", "Sötét") : t("Light", "Svetlá", "Világos")}
            </span>
          </div>
        </div>

        <div
          role="radiogroup"
          aria-label={t("Appearance", "Vzhľad", "Megjelenés")}
          className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-2xl bg-slate-50 border border-slate-200/80"
        >
          {THEME_MODES.map((mode) => {
            const selected = mode.id === themeMode;
            return (
              <motion.button
                key={mode.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setThemeMode(mode.id)}
                whileHover={reduceMotion ? undefined : { y: -1 }}
                whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                transition={{ duration: 0.15, ease: EASE_OUT }}
                className={`relative flex flex-col items-center justify-center gap-1 px-2 py-2.5 rounded-xl cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 ${
                  selected ? "text-indigo-700" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {selected && (
                  <motion.span
                    layoutId="theme-mode-pill"
                    className="absolute inset-0 rounded-xl bg-white border border-indigo-200 shadow-sm"
                    transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative text-base leading-none">{mode.icon}</span>
                <span className="relative text-[10px] font-bold leading-tight text-center">
                  {mode.id === "auto"
                    ? t("Auto", "Automatická", "Automatikus")
                    : mode.name[systemLanguage] || mode.name.en}
                </span>
              </motion.button>
            );
          })}
        </div>

        <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
          {activeMode.description[systemLanguage] || activeMode.description.en}
        </p>
      </div>

      {/* ------------------------------------------- Sunrise / sunset detail */}
      <AnimatePresence initial={false}>
        {themeMode === "auto" && (
          <motion.div
            key="auto-schedule"
            initial={reduceMotion ? false : { opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -6 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/80 space-y-2.5">
              {schedule.polarDay || schedule.polarNight ? (
                <p className="text-[11px] font-semibold text-amber-900 leading-relaxed">
                  {schedule.polarDay
                    ? t(
                        "The sun does not set at your location today, so the interface stays light.",
                        "Slnko dnes na vašej polohe nezapadá, rozhranie preto zostane svetlé.",
                        "Ma nem nyugszik le a nap az Ön helyén, ezért a felület világos marad."
                      )
                    : t(
                        "The sun does not rise at your location today, so the interface stays dark.",
                        "Slnko dnes na vašej polohe nevychádza, rozhranie preto zostane tmavé.",
                        "Ma nem kel fel a nap az Ön helyén, ezért a felület sötét marad."
                      )}
                </p>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-amber-900">
                    <Sunrise className="h-4 w-4 shrink-0 text-amber-600" />
                    <div className="leading-tight">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-amber-700/80">
                        {t("Sunrise", "Východ slnka", "Napkelte")}
                      </div>
                      <div className="text-xs font-black tabular-nums">{formatTime(schedule.sunrise)}</div>
                    </div>
                  </div>
                  <div className="h-6 w-px bg-amber-200" />
                  <div className="flex items-center gap-1.5 text-amber-900">
                    <Sunset className="h-4 w-4 shrink-0 text-amber-600" />
                    <div className="leading-tight">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-amber-700/80">
                        {t("Sunset", "Západ slnka", "Napnyugta")}
                      </div>
                      <div className="text-xs font-black tabular-nums">{formatTime(schedule.sunset)}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-amber-200/70 space-y-2">
                <p className="text-[10px] text-amber-800/90 font-medium leading-relaxed">
                  {schedule.precise
                    ? t(
                        "Calculated for your exact location — no weather service involved.",
                        "Vypočítané pre vašu presnú polohu — bez akejkoľvek meteoslužby.",
                        "A pontos helyzetéhez számítva — időjárás-szolgáltatás nélkül."
                      )
                    : t(
                        "Estimated from your time zone. Share your location for times accurate to the minute.",
                        "Odhadnuté z časového pásma. Zdieľajte polohu pre časy presné na minútu.",
                        "Az időzónából becsülve. Ossza meg a helyzetét a percre pontos időkért."
                      )}
                </p>
                {!schedule.precise && (
                  <motion.button
                    type="button"
                    onClick={handleUseLocation}
                    disabled={locating}
                    whileHover={reduceMotion || locating ? undefined : { y: -1 }}
                    whileTap={reduceMotion || locating ? undefined : { scale: 0.97 }}
                    transition={{ duration: 0.15, ease: EASE_OUT }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-[10px] font-bold uppercase tracking-wider shadow-sm transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-1"
                  >
                    {locating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Crosshair className="h-3.5 w-3.5" />
                    )}
                    {t("Use my location", "Použiť moju polohu", "Helyzetem használata")}
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* -------------------------------------------------- Light palette */}
      <div className="space-y-2 pt-3 border-t border-slate-200/80">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5 text-amber-600" />
            {t("Light palette (Herb Collection)", "Svetlá paleta (Bylinky)", "Világos paletta (Fűszernövények)")}
          </label>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-900 shadow-xs">
            <span>{currentThemeObj.icon}</span>
            <span>{currentThemeObj.name[systemLanguage] || currentThemeObj.name.en}</span>
          </div>
        </div>

        <CustomSelect
          value={currentThemeId}
          onChange={(newTheme) => {
            if (setUserTheme) setUserTheme(newTheme);
            else applyTheme(newTheme);
          }}
          options={HERB_THEMES.map((theme) => ({
            value: theme.id,
            label: `${theme.icon} ${theme.name[systemLanguage] || theme.name.en}`,
          }))}
        />

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
          <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
            {currentThemeObj.description[systemLanguage] || currentThemeObj.description.en}
          </p>
          {isDark && (
            <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
              {t(
                "The palette above applies whenever the interface is light.",
                "Paleta vyššie sa uplatní vždy, keď je rozhranie svetlé.",
                "A fenti paletta akkor érvényes, amikor a felület világos."
              )}
            </p>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {t("Theme Palette:", "Paleta témy:", "Téma paletta:")}
            </span>
            <div className="flex items-center gap-1.5">
              {([
                ["bg", t("Background", "Pozadie", "Háttér")],
                ["card", t("Card", "Karta", "Kártya")],
                ["primary", t("Primary", "Hlavná", "Elsődleges")],
                ["secondary", t("Secondary", "Sekundárna", "Másodlagos")],
                ["text", t("Text", "Text", "Szöveg")],
              ] as const).map(([key, title]) => (
                <motion.div
                  key={key}
                  layout={!reduceMotion}
                  animate={{ backgroundColor: currentThemeObj.preview[key] }}
                  transition={{ duration: 0.25, ease: EASE_OUT }}
                  className="w-4 h-4 rounded-full border border-slate-300 shadow-xs"
                  title={title}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
