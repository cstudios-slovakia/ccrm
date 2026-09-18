/**
 * "Add widget": the ready-made library on one tab, a one-shot AI prompt on the
 * other. Both append to the working layout, so nothing is stored until Save.
 *
 * The library is grouped by app section rather than by widget type, because
 * that is how someone looks for one: you want something about the pipeline, or
 * about the team's tasks — not "a chart". What kind of card it is rides along
 * as a quiet label next to the name.
 */

import React, { useMemo, useState } from "react";
import { AlertCircle, Check, Info, LayoutGrid, Plus, RefreshCw, Search, Sparkles, Wand2, X } from "lucide-react";
import { cn } from "../../utils/cn";
import {
  WIDGET_PRESETS,
  WIDGET_SECTIONS,
  WIDGET_SECTION_ORDER,
  type WidgetKind,
  type WidgetPreset
} from "../../utils/dashboardWidgets";
import type { Translate } from "./widgetKit";

const kindLabel = (kind: WidgetKind, t: Translate): string => {
  switch (kind) {
    case "metric":
      return t("Metric", "Metrika", "Mérőszám");
    case "chart":
      return t("Chart", "Graf", "Diagram");
    case "table":
      return t("Table", "Tabuľka", "Táblázat");
    case "timeline":
      return t("Timeline", "Časová os", "Idővonal");
    default:
      return kind;
  }
};

export const AddWidgetDrawer: React.FC<{
  t: Translate;
  localize: (value: any) => string;
  /** Preset ids already on the board — those rows read "Added" instead. */
  presentPresetIds: string[];
  onAdd: (preset: WidgetPreset) => void;
  onClose: () => void;
  /* The AI tab. */
  prompt: string;
  onPrompt: (value: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  error: string | null;
  modelLabel: string;
  modelIndex: number;
  onModelIndex: (index: number) => void;
}> = ({
  t,
  localize,
  presentPresetIds,
  onAdd,
  onClose,
  prompt,
  onPrompt,
  onGenerate,
  isGenerating,
  error,
  modelLabel,
  modelIndex,
  onModelIndex
}) => {
  const [tab, setTab] = useState<"library" | "ai">("library");
  const [search, setSearch] = useState("");

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return WIDGET_PRESETS;
    return WIDGET_PRESETS.filter((preset) =>
      `${localize(preset.title)} ${localize(preset.description)}`.toLowerCase().includes(needle)
    );
  }, [search, localize]);

  return (
    <>
      <div
        className="fixed inset-0 bg-slate-900/30 backdrop-blur-[1px] z-[9998] animate-in fade-in duration-200"
        onClick={onClose}
      />
      <aside className="fixed right-0 top-0 h-screen w-full max-w-[460px] bg-white border-l border-slate-200 shadow-2xl z-[9999] flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex items-center gap-3.5 px-6 py-[22px] border-b border-slate-100 shrink-0">
          <span className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <Plus className="h-5 w-5 text-indigo-600" strokeWidth={2.25} />
          </span>
          <div className="flex flex-col gap-[3px] flex-1 min-w-0">
            <span className="text-[17px] font-bold text-slate-900">
              {t("Add widget", "Pridať modul", "Modul hozzáadása")}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
              {t("Library or AI", "Knižnica alebo AI", "Könyvtár vagy AI")}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close", "Zavrieť", "Bezárás")}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 pt-[18px] flex flex-col gap-3 shrink-0">
          <div role="tablist" className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100">
            {(
              [
                { id: "library" as const, label: t("Library", "Knižnica", "Könyvtár"), icon: LayoutGrid },
                { id: "ai" as const, label: t("Generate with AI", "Vytvoriť s AI", "Létrehozás AI-val"), icon: Wand2 }
              ]
            ).map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                onClick={() => setTab(entry.id)}
                className={cn(
                  "flex items-center justify-center gap-2 h-9 rounded-xl text-[11px] font-bold uppercase tracking-[0.06em] transition-all cursor-pointer",
                  tab === entry.id ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <entry.icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                {entry.label}
              </button>
            ))}
          </div>

          {tab === "library" && (
            <label className="flex items-center gap-2.5 h-10 px-3.5 rounded-xl border border-slate-200 bg-white">
              <Search className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Search widgets…", "Hľadať modul…", "Modul keresése…")}
                aria-label={t("Search widgets", "Hľadať modul", "Modul keresése")}
                className="w-full border-0 outline-none bg-transparent text-[13px] text-slate-700"
              />
            </label>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3.5">
          {tab === "library" ? (
            WIDGET_SECTION_ORDER.map((sectionId) => {
              const section = WIDGET_SECTIONS[sectionId];
              const presets = matches.filter((preset) => preset.section === sectionId);
              if (presets.length === 0) return null;
              const SectionIcon = section.icon;
              return (
                <section
                  key={sectionId}
                  className="shrink-0 flex flex-col border border-slate-100 rounded-2xl overflow-hidden"
                >
                  <div className="flex items-center gap-2.5 h-12 px-3 bg-slate-50">
                    <span
                      className="w-[26px] h-[26px] rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: section.accent }}
                    >
                      <SectionIcon className="h-3.5 w-3.5 text-white" strokeWidth={2.25} />
                    </span>
                    <span className="flex-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-700">
                      {t(section.title.en, section.title.sk, section.title.hu)}
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">{presets.length}</span>
                  </div>

                  {presets.map((preset) => {
                    const added = presentPresetIds.includes(preset.id);
                    const PresetIcon = preset.icon;
                    return (
                      <div
                        key={preset.id}
                        className="flex items-center gap-3 px-3 py-2.5 border-t border-slate-100"
                      >
                        <span className="w-[34px] h-[34px] rounded-[10px] bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                          <PresetIcon className="h-4 w-4 text-slate-500" strokeWidth={2.25} />
                        </span>
                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                          <span className="flex items-center gap-2 min-w-0">
                            <span
                              className={cn(
                                "text-[13px] font-bold truncate",
                                added ? "text-slate-500" : "text-slate-800"
                              )}
                            >
                              {localize(preset.title)}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400 shrink-0">
                              {kindLabel(preset.kind, t)}
                            </span>
                          </span>
                          <span className="text-xs font-medium text-slate-500 truncate">
                            {localize(preset.description)}
                          </span>
                        </div>
                        {added ? (
                          <span className="flex items-center gap-1.5 h-[30px] px-2.5 rounded-lg bg-slate-100 text-slate-500 text-[11px] font-bold shrink-0">
                            <Check className="h-3 w-3" strokeWidth={3} />
                            {t("Added", "Pridané", "Hozzáadva")}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onAdd(preset)}
                            aria-label={`${t("Add", "Pridať", "Hozzáadás")} ${localize(preset.title)}`}
                            className="flex items-center gap-1.5 h-[30px] px-2.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100 transition-colors text-[11px] font-bold uppercase tracking-[0.06em] cursor-pointer shrink-0"
                          >
                            <Plus className="h-3 w-3" strokeWidth={3} />
                            {t("Add", "Pridať", "Hozzáadať")}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </section>
              );
            })
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onGenerate();
              }}
              className="space-y-4"
            >
              <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100 text-[11px] text-slate-600 leading-relaxed flex gap-2">
                <Info className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
                <span>
                  {t(
                    "Describe one widget. The AI writes the query against your live data and adds a single card to this dashboard.",
                    "Opíšte jeden modul. AI napíše dopyt nad vašimi živými dátami a pridá na nástenku jednu kartu.",
                    "Írjon le egy modult. Az AI lekérdezést ír az élő adataira, és egyetlen kártyát ad az irányítópulthoz."
                  )}
                </span>
              </div>

              <textarea
                rows={4}
                value={prompt}
                onChange={(e) => onPrompt(e.target.value)}
                placeholder={t(
                  "e.g. a bar chart of won deals per month this year",
                  "napr. stĺpcový graf uzavretých obchodov po mesiacoch",
                  "pl. oszlopdiagram a havi megnyert üzletekről"
                )}
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-slate-50 transition-all font-semibold resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onGenerate();
                  }
                }}
              />

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between w-full gap-3">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">
                    {t("Model Power", "Výkon modelu", "Modell Teljesítmény")}
                  </span>
                  <span className="text-[9px] font-black text-purple-600 uppercase tracking-wider whitespace-nowrap">
                    {modelLabel}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  value={modelIndex}
                  onChange={(e) => onModelIndex(Number(e.target.value))}
                  className="w-full accent-purple-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {error && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isGenerating || !prompt.trim()}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-indigo-600/10 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {t("Generating...", "Generujem...", "Generálás...")}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {t("Generate widget", "Vytvoriť modul", "Modul létrehozása")}
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold uppercase tracking-[0.08em] transition-colors cursor-pointer"
          >
            {t("Done", "Hotovo", "Kész")}
          </button>
        </div>
      </aside>
    </>
  );
};
