import React, { useState, useEffect, useRef } from "react";
import { Sparkles, Save, Edit, RefreshCw, Send, AlertCircle, LayoutDashboard, FileText, HelpCircle, X, Info } from "lucide-react";
import type { CustomDashboard } from "../types";
import { cn } from "../utils/cn";
import type { Language } from "../utils/translations";
import { formatMoney } from "../utils/currency";

interface DynamicDashboardViewProps {
  dashboard: CustomDashboard;
  onSaveDashboard: (updated: CustomDashboard) => void;
  systemLanguage: string;
  currencyCode?: string | null;
}

export const DynamicDashboardView: React.FC<DynamicDashboardViewProps> = ({
  dashboard,
  onSaveDashboard,
  systemLanguage,
  currencyCode
}) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;
  const money = (value: number, opts?: Intl.NumberFormatOptions) =>
    formatMoney(value, currencyCode, (systemLanguage as Language) || "en", opts);

  const [isEditMode, setIsEditMode] = useState(dashboard.layout.widgets.length === 0);
  const [promptText, setPromptText] = useState("");
  const [selectedModel, setSelectedModel] = useState(dashboard.activeModel || "gpt-4o");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [widgetData, setWidgetData] = useState<Record<string, any>>({});
  const [loadingWidgets, setLoadingWidgets] = useState<Record<string, boolean>>({});
  const [isSaved, setIsSaved] = useState(true);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const models = ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"];
  const modelIndex = models.indexOf(selectedModel);
  const handleModelSliderChange = (val: number) => {
    setSelectedModel(models[val] || "gpt-4o");
  };

  // Temporary layout workspace before saving
  const [tempLayout, setTempLayout] = useState(dashboard.layout);
  const [tempPrompts, setTempPrompts] = useState(dashboard.prompts || []);

  const prevDashIdRef = useRef(dashboard.id);

  useEffect(() => {
    if (dashboard.id !== prevDashIdRef.current || isSaved) {
      setTempLayout(dashboard.layout);
      setTempPrompts(dashboard.prompts || []);
      setIsEditMode(dashboard.layout.widgets.length === 0);
      setIsSaved(true);
      prevDashIdRef.current = dashboard.id;
    }
  }, [dashboard, isSaved]);

  // Load data for all widgets in the layout
  const fetchAllWidgetsData = async (layoutToLoad = tempLayout) => {
    const widgets = layoutToLoad?.widgets || [];
    widgets.forEach(async (w: any) => {
      if (!w.query || !w.query.action) return;
      setLoadingWidgets(prev => ({ ...prev, [w.id]: true }));
      try {
        const res = await fetch("/api/dashboard_query.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: w.query.action,
            params: w.query.params || {}
          })
        });
        const json = await res.json();
        if (json.success) {
          setWidgetData(prev => ({ ...prev, [w.id]: json.data }));
        }
      } catch (err) {
        console.error(`Failed to fetch data for widget ${w.id}`, err);
      } finally {
        setLoadingWidgets(prev => ({ ...prev, [w.id]: false }));
      }
    });
  };

  useEffect(() => {
    if (tempLayout.widgets.length > 0) {
      fetchAllWidgetsData();
    }
  }, [tempLayout]);

  const handleRunPrompt = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!promptText.trim()) return;

    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/generate_dashboard.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText.trim(),
          history: tempPrompts,
          model: selectedModel
        })
      });
      const json = await res.json();
      if (json.success && json.layout) {
        setTempLayout(json.layout);
        setTempPrompts(prev => [...prev, { prompt: promptText.trim(), layout: json.layout }]);
        setPromptText("");
        setIsSaved(false);
      } else {
        setErrorMsg(json.message || "Failed to generate dashboard layout.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Connection to AI agent failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    const updated: CustomDashboard = {
      ...dashboard,
      layout: tempLayout,
      prompts: tempPrompts,
      activeModel: selectedModel
    };
    onSaveDashboard(updated);
    setIsSaved(true);
    setIsEditMode(false);
    if (typeof (window as any).showToast === "function") {
      (window as any).showToast(t("Dashboard saved successfully!", "Panel bol úspešne uložený!", "Irányítópult sikeresen mentve!"));
    }
  };

  const getGridSpan = (size: string) => {
    switch (size) {
      case "sm": return "col-span-12 md:col-span-6 lg:col-span-3";
      case "md": return "col-span-12 md:col-span-6 lg:col-span-4";
      case "lg": return "col-span-12 md:col-span-12 lg:col-span-6";
      case "full":
      default:
        return "col-span-12";
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-[#f8fafc] relative overflow-hidden p-6">
      {/* Top Action Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200/80 mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md"
            style={{ backgroundColor: dashboard.color }}
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="text-left">
            <h1 className="text-xl font-extrabold text-slate-800 tracking-tight leading-none">
              {dashboard.name}
            </h1>
            <span className="text-[10px] text-slate-450 font-bold uppercase tracking-wider mt-1 block">
              {t("Custom Dynamic AI Dashboard", "Vlastný dynamický AI panel", "Egyéni dinamikus AI irányítópult")}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isEditMode && (
            <button
              onClick={() => setIsHelpOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-550 hover:text-slate-800 text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer animate-in fade-in duration-205"
            >
              <HelpCircle className="h-4 w-4" />
              <span>{t("Help", "Pomoc", "Súgó")}</span>
            </button>
          )}

          {tempLayout.widgets.length > 0 && !isEditMode && (
            <button
              onClick={() => setIsEditMode(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer"
            >
              <Edit className="h-4 w-4" />
              <span>{t("Edit", "Upraviť", "Szerkesztés")}</span>
            </button>
          )}

          {!isSaved && (
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-emerald-600/10 cursor-pointer"
            >
              <Save className="h-4 w-4" />
              <span>{t("Save", "Uložiť", "Mentés")}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto pb-32 pr-1 scrollbar-thin">
        {errorMsg && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-800 text-sm animate-in fade-in duration-200">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="text-left">
              <span className="font-bold">{t("Error", "Chyba", "Hiba")}: </span>
              {errorMsg}
            </div>
          </div>
        )}

        {tempLayout.widgets.length === 0 ? (
          /* Empty Initial State: Large Center Prompt Input */
          <div className="h-full max-w-2xl mx-auto flex flex-col items-center justify-center text-center p-8 mt-12">
            <div className="w-16 h-16 rounded-[24px] bg-indigo-50 flex items-center justify-center mb-6 shadow-inner">
              <Sparkles className="h-8 w-8 text-indigo-600 animate-pulse" />
            </div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-wide">
              {t("Generate your Dashboard", "Vytvorte si svoj panel", "Irányítópult létrehozása")}
            </h2>
            <p className="text-sm text-slate-500 mt-2 max-w-md">
              {t(
                "Type what you want to analyze. The AI agent will fetch live database records, build custom metrics and charts.",
                "Zadajte, čo chcete analyzovať. AI agent načíta živé databázové záznamy a zostaví metriky a grafy.",
                "Írja be, mit szeretne elemezni. Az AI lekéri az élő adatbázis rekordokat, és diagramokat készít."
              )}
            </p>

            <form onSubmit={handleRunPrompt} className="w-full mt-8 bg-white border border-slate-200/80 rounded-[28px] shadow-xl p-5 space-y-4 text-left">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                  {t("What would you like to build?", "Čo si prajete vytvoriť?", "Mit szeretne felépíteni?")}
                </label>
                <textarea
                  rows={4}
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder={t(
                    "e.g., Show a count of total leads, a doughnut chart of lead sources, and a table of the newest 5 tasks...",
                    "napr., Zobrazte celkový počet leadov, koláčový graf zdrojov a tabuľku 5 najnovších úloh...",
                    "pl., Mutassa a lead-ek számát, egy kördiagramot a forrásokról, és a legújabb 5 feladatot..."
                  )}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-slate-50 transition-all font-semibold resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleRunPrompt();
                    }
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-4 pt-2">
                <div className="flex flex-col gap-1 items-start min-w-[120px]">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">
                      {t("Model Power", "Výkon modelu", "Modell Teljesítmény")}
                    </span>
                    <span className="text-[9px] font-black text-purple-600 uppercase tracking-wider">
                      {selectedModel === "gpt-4o-mini"
                        ? t("Simple", "Jednoduchý", "Egyszerű")
                        : selectedModel === "gpt-4o"
                          ? t("Smart", "Inteligentný", "Okos")
                          : t("Expert", "Expert", "Szakértő")}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    value={modelIndex >= 0 ? modelIndex : 1}
                    onChange={(e) => handleModelSliderChange(Number(e.target.value))}
                    className="w-full accent-purple-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isGenerating || !promptText.trim()}
                  className="flex items-center gap-1.5 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-indigo-600/10 cursor-pointer shrink-0"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>{t("Generating...", "Generujem...", "Generálás...")}</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>{t("Generate", "Vytvoriť", "Generálás")}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Render Generated Layout Grid */
          <div className="grid grid-cols-12 gap-6 text-left">
            {tempLayout.widgets.map((w: any) => (
              <div
                key={w.id}
                className={cn(
                  "bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 flex flex-col justify-between overflow-hidden min-h-[140px] relative animate-in fade-in duration-300",
                  getGridSpan(w.size)
                )}
              >
                {/* Loader Overlay */}
                {loadingWidgets[w.id] && (
                  <div className="absolute inset-0 bg-white/70 backdrop-blur-[0.5px] z-50 flex items-center justify-center">
                    <RefreshCw className="h-5 w-5 text-indigo-600 animate-spin" />
                  </div>
                )}

                <div className="w-full flex items-center justify-between pb-3 mb-3 border-b border-slate-100/50">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {w.title}
                  </span>
                  <div
                    className="w-7 h-7 rounded-xl flex items-center justify-center text-white scale-90"
                    style={{ backgroundColor: w.color || dashboard.color }}
                  >
                    {w.type === "metric" ? (
                      <LayoutDashboard className="h-4 w-4" />
                    ) : w.type === "chart" ? (
                      <Sparkles className="h-4 w-4" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                  </div>
                </div>

                <div className="flex-1 flex flex-col justify-center">
                  {w.type === "metric" && (
                    <div className="text-3xl font-black text-slate-800 tracking-tight">
                      {(() => {
                        if (w.metricValue !== undefined && w.metricValue !== "") {
                          return w.metricValue;
                        }
                        const data = widgetData[w.id];
                        if (data === undefined || data === null) {
                          return "...";
                        }
                        if (Array.isArray(data)) {
                          if (data.length === 0) return "0";
                          const firstRow = data[0];
                          if (typeof firstRow === "object" && firstRow !== null) {
                            const values = Object.values(firstRow);
                            if (values.length > 0) {
                              const val = values[0];
                              const keys = Object.keys(firstRow);
                              const firstKeyLower = keys[0].toLowerCase();
                              const titleLower = (w.title || "").toLowerCase();
                              const isCurrency = 
                                firstKeyLower.includes("value") || 
                                firstKeyLower.includes("worth") || 
                                firstKeyLower.includes("revenue") || 
                                firstKeyLower.includes("price") ||
                                titleLower.includes("value") ||
                                titleLower.includes("worth") ||
                                titleLower.includes("revenue");

                              if (isCurrency && !isNaN(Number(val))) {
                                return money(Number(val));
                              }
                              return typeof val === "number" ? val.toLocaleString() : String(val);
                            }
                          }
                          return JSON.stringify(data);
                        }
                        if (typeof data === "object") {
                          if (data.count !== undefined) return data.count;
                          if (data.value !== undefined) return money(Number(data.value));
                          return JSON.stringify(data);
                        }
                        return String(data);
                      })()}
                    </div>
                  )}

                  {w.type === "chart" && (
                    <DashboardChart widget={w} data={widgetData[w.id]} />
                  )}

                  {w.type === "table" && (
                    <DashboardTable widget={w} data={widgetData[w.id]} t={t} formatCurrency={money} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Prompt Bar at the bottom in Edit Mode */}
      {isEditMode && tempLayout.widgets.length > 0 && (
        <div className="absolute bottom-6 left-6 right-6 z-[999] animate-in slide-in-from-bottom-6 duration-300">
          <form
            onSubmit={handleRunPrompt}
            className="max-w-3xl mx-auto bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-[28px] shadow-2xl p-4 flex items-center gap-3.5"
          >
            <textarea
              rows={1}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder={t(
                "Refine layout (e.g. change X chart to Y, add Z metric)...",
                "Upravte rozloženie (napr. zmeňte graf X na Y, pridajte metriku Z)...",
                "Módosítsa az elrendezést (pl. változtassa meg az X diagramot Y-ra)..."
              )}
              className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs font-semibold bg-slate-50/50 resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleRunPrompt();
                }
              }}
            />

            <div className="flex flex-col gap-1 items-start min-w-[100px] shrink-0 justify-center">
              <div className="flex items-center justify-between w-full">
                <span className="text-[8px] font-black text-purple-600 uppercase tracking-wider">
                  {selectedModel === "gpt-4o-mini"
                    ? t("Simple", "Jednoduchý", "Egyszerű")
                    : selectedModel === "gpt-4o"
                      ? t("Smart", "Inteligentný", "Okos")
                      : t("Expert", "Expert", "Szakértő")}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                value={modelIndex >= 0 ? modelIndex : 1}
                onChange={(e) => handleModelSliderChange(Number(e.target.value))}
                className="w-full accent-purple-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <button
              type="submit"
              disabled={isGenerating || !promptText.trim()}
              className="flex items-center justify-center h-9 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shrink-0"
            >
              {isGenerating ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>

            <div className="h-6 w-px bg-slate-200" />

            <button
              type="button"
              onClick={() => {
                setIsEditMode(false);
                setIsHelpOpen(false);
              }}
              className="h-9 px-4 border border-slate-200 rounded-xl hover:bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-wider transition-colors cursor-pointer shrink-0"
            >
              {t("Close", "Zavrieť", "Bezárás")}
            </button>
          </form>
        </div>
      )}

      {/* UX Help Slideout Drawer */}
      {isHelpOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-[1px] z-[9998] animate-in fade-in duration-200"
            onClick={() => setIsHelpOpen(false)}
          />
          {/* Drawer Panel */}
          <div className="fixed right-0 top-0 h-screen w-full max-w-[440px] bg-white border-l border-slate-200 shadow-2xl z-[9999] flex flex-col animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Info className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider leading-none">
                    {t("Dashboard Layout Guide", "Návod na tvorbu panela", "Irányítópult tervezési útmutató")}
                  </h3>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1 block">
                    {t("UX Helper for Non-Designers", "Dizajn pomocník", "UX Segédtervező")}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsHelpOpen(false)}
                className="text-slate-400 hover:text-slate-650 p-2 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
              {/* Introduction */}
              <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 text-left">
                <p className="text-xs font-semibold text-indigo-950 leading-relaxed">
                  {t(
                    "You don't need to be a designer! Our AI agent will build widgets based on your natural prompt. Read below to understand available widgets and how to arrange them for a premium display.",
                    "Nem musíte byť dizajnér! Náš AI agent vytvorí moduly na základe vášho popisu. Prečítajte si, ako správne usporiadať komponenty.",
                    "Nem kell dizájnernek lennie! Az AI agent az Ön leírása alapján építi fel a modulokat. Az alábbiakban megismerheti a diagramokat."
                  )}
                </p>
              </div>

              {/* Grid System Explanation */}
              <div className="space-y-3 text-left">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {t("1. 12-Column Responsive Grid", "1. 12-Stĺpcový responsívny grid", "1. 12-Oszlopos rácsrendszer")}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {t(
                    "Widgets automatically snap into a 12-column row layout. Combine widgets to sum up to exactly 12 in a row for clean visual alignment:",
                    "Moduly sa automaticky usporiadajú do 12-stĺpcového riadku. Nakombinujte veľkosti tak, aby súčet v riadku dával presne 12:",
                    "A modulok automatikusan egy 12 oszlopos sorba rendeződnek. Kombinálja a méreteket úgy, hogy a sor összege pontosan 12 legyen:"
                  )}
                </p>
                <div className="grid grid-cols-12 gap-1.5 pt-2">
                  <div className="col-span-3 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[9px] font-black text-slate-500 border border-slate-200">sm (1/4)</div>
                  <div className="col-span-3 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[9px] font-black text-slate-500 border border-slate-200">sm (1/4)</div>
                  <div className="col-span-3 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[9px] font-black text-slate-500 border border-slate-200">sm (1/4)</div>
                  <div className="col-span-3 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[9px] font-black text-slate-500 border border-slate-200">sm (1/4)</div>

                  <div className="col-span-4 h-8 rounded-lg bg-slate-100/70 flex items-center justify-center text-[9px] font-black text-slate-500 border border-slate-200">md (1/3)</div>
                  <div className="col-span-4 h-8 rounded-lg bg-slate-100/70 flex items-center justify-center text-[9px] font-black text-slate-500 border border-slate-200">md (1/3)</div>
                  <div className="col-span-4 h-8 rounded-lg bg-slate-100/70 flex items-center justify-center text-[9px] font-black text-slate-500 border border-slate-200">md (1/3)</div>

                  <div className="col-span-6 h-8 rounded-lg bg-indigo-50/50 flex items-center justify-center text-[9px] font-black text-indigo-650 border border-indigo-100">lg (1/2)</div>
                  <div className="col-span-6 h-8 rounded-lg bg-indigo-50/50 flex items-center justify-center text-[9px] font-black text-indigo-650 border border-indigo-100">lg (1/2)</div>

                  <div className="col-span-12 h-8 rounded-lg bg-purple-50/50 flex items-center justify-center text-[9px] font-black text-purple-600 border border-purple-100">full (1/1)</div>
                </div>
              </div>

              {/* Elements breakdowns */}
              <div className="space-y-4 text-left">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {t("2. Interface Element Types", "2. Typy rozhraní a modulov", "2. Interfész elem típusok")}
                </h4>

                {/* Metric Card */}
                <div className="p-4 border border-slate-150 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex flex-col justify-between shrink-0 shadow-sm w-24 h-16">
                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wide truncate">Total Leads</span>
                    <span className="text-base font-black text-slate-850">142</span>
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">{t("KPI Metric Card", "Metrická karta (KPI)", "KPI Kártya")}</h5>
                    <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                      {t("Best for counts, single sums, or values. Uses sizes 'sm' (1/4 width) or 'md' (1/3 width).", "Ideálne pre počty, celkové sumy. Používa veľkosti 'sm' (1/4 šírky) alebo 'md' (1/3 šírky).", "Ideális összegekhez, darabszámokhoz.")}
                    </p>
                  </div>
                </div>

                {/* Bar Chart */}
                <div className="p-4 border border-slate-150 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
                  <div className="w-24 h-16 rounded-xl bg-white border border-slate-200 p-2 flex items-end justify-around shrink-0 shadow-sm">
                    <div className="w-2.5 h-6 bg-indigo-500 rounded-sm" />
                    <div className="w-2.5 h-10 bg-indigo-500 rounded-sm" />
                    <div className="w-2.5 h-7 bg-indigo-500 rounded-sm" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">{t("Bar Chart", "Stĺpcový graf", "Oszlopdiagram")}</h5>
                    <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                      {t("Compares quantities across different categories. Great for showing pipeline value per owner or count of leads per marketing source.", "Porovnáva hodnoty medzi kategóriami. Vhodné pre objem pipeline podľa správcov alebo počty leadov zo zdrojov.", "Kategóriák közötti értékek összehasonlítására szolgál.")}
                    </p>
                  </div>
                </div>

                {/* Line Chart */}
                <div className="p-4 border border-slate-150 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
                  <div className="w-24 h-16 rounded-xl bg-white border border-slate-200 p-2 flex items-center justify-center shrink-0 shadow-sm">
                    <svg className="w-16 h-8 text-purple-500" viewBox="0 0 100 50" fill="none">
                      <path d="M5 45 L25 35 L45 40 L65 15 L85 20 L95 5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">{t("Line Chart", "Čiarový trendový graf", "Vonaldiagram")}</h5>
                    <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                      {t("Visualizes trends, increases, or cycles over time. Excellent for showing lead count by date/month created.", "Vizualizuje vývoj a trendy v čase. Ideálne pre počty vytvorených záujemcov podľa mesiacov.", "Időbeli trendek és folyamatok ábrázolására kiváló.")}</p>
                  </div>
                </div>

                {/* Doughnut Chart */}
                <div className="p-4 border border-slate-150 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
                  <div className="w-24 h-16 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-sm animate-pulse-slow">
                    <div className="w-10 h-10 rounded-full border-4 border-emerald-500 border-r-indigo-500 border-t-purple-500" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">{t("Pie / Doughnut Chart", "Koláčový / Kruhový graf", "Kör / Fánk diagram")}</h5>
                    <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                      {t("Displays percentage shares of a total. Best for statuses, sources, or priorities (keep slices under 6 for legibility).", "Zobrazuje percentuálne podiely. Najvhodnejšie pre stavy, marketingové kanály alebo priority.", "Részarányok szemléltetésére a legalkalmasabb.")}
                    </p>
                  </div>
                </div>

                {/* Data Table */}
                <div className="p-4 border border-slate-150 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
                  <div className="w-24 h-16 rounded-xl bg-white border border-slate-200 p-2 flex flex-col gap-1.5 shrink-0 shadow-sm justify-center">
                    <div className="h-2 bg-slate-100 rounded w-full" />
                    <div className="h-2 bg-slate-100 rounded w-4/5" />
                    <div className="h-2 bg-slate-100 rounded w-5/6" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">{t("Data Table", "Dátová tabuľka", "Adattáblázat")}</h5>
                    <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                      {t("Lists records with details (names, dates, statuses, currencies). Uses sizes 'lg' or 'full'. Ideal for showing newest leads or pending deadlines.", "Zobrazuje detailné riadky (mená, dátumy, stavy, sumy). Využíva veľkosti 'lg' alebo 'full'.", "Részletes adatsorok listázására kiváló.")}
                    </p>
                  </div>
                </div>

                {/* Accordion */}
                <div className="p-4 border border-slate-150 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
                  <div className="w-24 h-16 rounded-xl bg-white border border-slate-200 p-2 flex flex-col gap-1.5 shrink-0 shadow-sm justify-center">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                      <div className="h-1.5 bg-indigo-500 rounded w-1/2" />
                      <div className="w-1.5 h-1.5 border-r border-b border-slate-400 transform rotate-45" />
                    </div>
                    <div className="h-2 bg-slate-50 rounded w-full" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">{t("Collapsible Accordions", "Rozbaľovacia harmonika", "Harmonika (Accordion)")}</h5>
                    <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                      {t("Best for FAQs, logs, details, or lists of meeting notes where items should expand/collapse individually.", "Vhodné pre zoznamy úloh, poznámky zo stretnutí a detaily, ktoré sa majú jednotlivo rozbaliť.", "Kinyitható és összecsukható részletek megjelenítésére kiváló.")}
                    </p>
                  </div>
                </div>

                {/* Tabs */}
                <div className="p-4 border border-slate-150 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
                  <div className="w-24 h-16 rounded-xl bg-white border border-slate-200 p-2 flex gap-1.5 items-start shrink-0 shadow-sm justify-center">
                    <div className="px-1.5 py-0.5 rounded bg-indigo-600 text-[6px] font-bold text-white">Tab A</div>
                    <div className="px-1.5 py-0.5 rounded bg-slate-50 text-[6px] font-bold text-slate-500">Tab B</div>
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">{t("Tabbed Views", "Záložkové prepínače (Tab-y)", "Fülek (Tabs)")}</h5>
                    <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                      {t("Allows users to toggle between different datasets or query filters within the same card/module.", "Umožňuje používateľom prepínať medzi rôznymi pohľadmi alebo filtrami v rámci jedného modulu.", "Lehetővé teszi a nézetek közötti váltást egyetlen modulon belül.")}
                    </p>
                  </div>
                </div>

                {/* Progress & Goals */}
                <div className="p-4 border border-slate-150 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
                  <div className="w-24 h-16 rounded-xl bg-white border border-slate-200 p-2.5 flex flex-col justify-center shrink-0 shadow-sm gap-1.5">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 w-3/4 rounded-full" />
                    </div>
                    <span className="text-[8px] font-black text-emerald-600 text-center">75% Goal</span>
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">{t("Progress & Goals", "Ukazovatele pokroku (Gauge)", "Célok és Folyamatjelzők")}</h5>
                    <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                      {t("Ideal for tracking target goals (e.g. sales targets, completed tasks, lead pipeline progression).", "Ideálne pre sledovanie finančných cieľov, splnených úloh alebo percentuálneho pokroku.", "Célértékek és elért haladás szemléltetésére tökéletes.")}
                    </p>
                  </div>
                </div>

                {/* Timeline */}
                <div className="p-4 border border-slate-150 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
                  <div className="w-24 h-16 rounded-xl bg-white border border-slate-200 p-2 flex flex-col shrink-0 shadow-sm justify-center pl-4 relative">
                    <div className="absolute left-2.5 top-2 bottom-2 w-px bg-slate-200" />
                    <div className="absolute left-[7px] top-3.5 w-2.5 h-2.5 rounded-full bg-indigo-500" />
                    <div className="absolute left-[7px] bottom-3.5 w-2.5 h-2.5 rounded-full bg-slate-300" />
                    <div className="h-1 bg-slate-100 rounded w-4/5" />
                    <div className="h-1 bg-slate-100 rounded w-1/2 mt-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">{t("Activity / Timeline", "Časová os a história", "Idővonal / Előzmények")}</h5>
                    <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                      {t("Visualizes chronological events, logs, meeting notes history, or audit logs.", "Chronologicky usporiada udalosti, históriu úloh alebo poznámky zo stretnutí.", "Kronologikus események és előzmények megjelenítésére.")}
                    </p>
                  </div>
                </div>

                {/* Area Chart */}
                <div className="p-4 border border-slate-150 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
                  <div className="w-24 h-16 rounded-xl bg-white border border-slate-200 p-2 flex items-center justify-center shrink-0 shadow-sm">
                    <svg className="w-16 h-8 text-indigo-500" viewBox="0 0 100 50">
                      <path d="M 5 45 L 25 30 L 50 40 L 75 20 L 95 10 L 95 45 Z" fill="rgba(99, 102, 241, 0.15)" stroke="currentColor" strokeWidth="2.5" />
                    </svg>
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">{t("Area Chart", "Plošný graf", "Területdiagram")}</h5>
                    <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                      {t("Like a line chart, but fills the area beneath. Great for displaying cumulative volumes, growth, or revenue.", "Podobný ako čiarový, avšak vypĺňa spodnú plochu. Vhodný pre sledovanie celkového kumulatívneho rastu.", "A vonaldiagramhoz hasonló, de kitölti az alatta lévő területet.")}
                    </p>
                  </div>
                </div>

                {/* Radar Chart */}
                <div className="p-4 border border-slate-150 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
                  <div className="w-24 h-16 rounded-xl bg-white border border-slate-200 p-2 flex items-center justify-center shrink-0 shadow-sm">
                    <div className="w-8 h-8 border border-slate-200 rotate-45 relative flex items-center justify-center">
                      <div className="absolute inset-1.5 border border-indigo-400 rotate-[22deg] bg-indigo-500/10" />
                    </div>
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">{t("Radar / Spider Chart", "Radarový / Pavučinový graf", "Pókhálódiagram (Radar)")}</h5>
                    <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                      {t("Compares performance across multiple distinct variables (e.g. skills comparison, team strengths, multi-category balances).", "Porovnáva výkony a vyváženosť medzi viacerými vlastnosťami naraz.", "Több változó mentén történő teljesítmény-összehasonlításra.")}
                    </p>
                  </div>
                </div>

                {/* Scatter Plot */}
                <div className="p-4 border border-slate-150 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
                  <div className="w-24 h-16 rounded-xl bg-white border border-slate-200 p-2.5 relative flex items-center justify-center shrink-0 shadow-sm">
                    <div className="w-1 h-1 rounded-full bg-purple-500 absolute top-3 left-4" />
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500 absolute top-7 left-6" />
                    <div className="w-1 h-1 rounded-full bg-purple-500 absolute top-5 left-10" />
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500 absolute top-10 left-12" />
                    <div className="w-1 h-1 rounded-full bg-purple-500 absolute top-4 left-16" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">{t("Scatter / Bubble Plot", "Bodový / Korelačný graf", "Pontdiagram (Scatter)")}</h5>
                    <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                      {t("Displays relationship patterns and correlations between two variables (e.g. deal size vs. time to close).", "Ukazuje vzťahy, korelácie a zhluky medzi dvoma číselnými hodnotami.", "Két számszerű változó közötti korreláció ábrázolására.")}
                    </p>
                  </div>
                </div>

                {/* Horizontal Bar */}
                <div className="p-4 border border-slate-150 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
                  <div className="w-24 h-16 rounded-xl bg-white border border-slate-200 p-2.5 flex flex-col gap-1.5 shrink-0 shadow-sm justify-center font-sans">
                    <div className="h-2 bg-indigo-500 rounded-sm w-4/5" />
                    <div className="h-2 bg-indigo-500 rounded-sm w-3/5" />
                    <div className="h-2 bg-indigo-500 rounded-sm w-5/6" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">{t("Horizontal Bar Chart", "Horizontálny stĺpcový graf", "Vízszintes oszlopdiagram")}</h5>
                    <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                      {t("Best when category names are very long (like full names or long lead sources) to prevent overlapping labels.", "Najvhodnejšie pri dlhých názvoch kategórií, aby sa text neprekrýval a ostal čitateľný.", "Különösen alkalmas hosszú nevű kategóriák ábrázolására.")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Color Coding Guideline */}
              <div className="space-y-3 text-left">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {t("3. Color Coding Harmony", "3. Farebná symbolika a harmónia", "3. Színharmónia")}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {t("Match widget colors to the semantics of the data for quicker comprehension:", "Zlaďte farby modulu s významom údajov pre rýchlejšie pochopenie:", "Igazítsa a színeket az adatok jelentéséhez a gyorsabb megértésért:")}
                </p>
                <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>{t("Emerald: Finance", "Smaragdová: Financie", "Smaragd: Pénzügy")}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-800 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-rose-500" />
                    <span>{t("Rose: Urgent", "Ružová: Súrne", "Rózsaszín: Sürgős")}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>{t("Amber: Warnings", "Jantárová: Varovania", "Borostyán: Figyelem")}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-100 text-purple-800 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <span>{t("Purple: AI / Notes", "Fialová: AI / Poznámky", "Ibolya: AI / Jegyzet")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/* Widget Chart Element utilizing global Chart.js */
interface DashboardChartProps {
  widget: any;
  data: any;
}

const DashboardChart: React.FC<DashboardChartProps> = ({ widget, data }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<any>(null);

  const chartPalettes: Record<string, string[]> = {
    indigo: ["#4f46e5", "#818cf8", "#312e81", "#c7d2fe", "#4338ca"],
    blue: ["#2563eb", "#60a5fa", "#1e3a8a", "#dbeafe", "#1d4ed8"],
    emerald: ["#059669", "#34d399", "#064e3b", "#d1fae5", "#047857"],
    purple: ["#8b5cf6", "#a78bfa", "#4c1d95", "#f3e8ff", "#6d28d9"],
    amber: ["#d97706", "#fbbf24", "#78350f", "#fef3c7", "#b45309"],
    rose: ["#e11d48", "#fb7185", "#881337", "#ffe4e6", "#be123c"],
    cyan: ["#0891b2", "#22d3ee", "#164e63", "#ecfeff", "#0e7490"],
    pink: ["#db2777", "#f472b6", "#831843", "#fce7f3", "#be185d"]
  };

  useEffect(() => {
    if (!canvasRef.current || !data) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const ChartGlob = (window as any).Chart;
    if (!ChartGlob) {
      console.warn("Chart.js is not loaded in the window environment.");
      return;
    }

    const dataList = Array.isArray(data) ? data : [];
    const labelsKey = widget.mapping?.labelsKey || "status";
    const dataKey = widget.mapping?.dataKey || "count";

    const labels = dataList.map((item: any) => item[labelsKey] || "Unknown");
    const chartData = dataList.map((item: any) => Number(item[dataKey] || 0));

    const colorKey = widget.color || "indigo";
    const palette = chartPalettes[colorKey] || chartPalettes.indigo;

    const isPie = ["pie", "doughnut"].includes(widget.chartType);
    const bgColors = isPie ? palette : palette[0] + "20"; // 20% opacity for bar/line
    const borderColors = isPie ? "#ffffff" : palette[0];

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    chartInstanceRef.current = new ChartGlob(ctx, {
      type: widget.chartType || "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: widget.title,
            data: chartData,
            backgroundColor: bgColors,
            borderColor: borderColors,
            borderWidth: isPie ? 2 : 3,
            fill: widget.chartType === "line",
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: isPie,
            position: "bottom",
            labels: {
              boxWidth: 10,
              font: { size: 9, weight: "bold" }
            }
          }
        },
        scales: isPie
          ? undefined
          : {
              x: {
                grid: { display: false },
                ticks: { font: { size: 9, weight: "bold" } }
              },
              y: {
                grid: { color: "#f1f5f9" },
                ticks: { font: { size: 9, weight: "bold" } }
              }
            }
      }
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [widget, data]);

  return (
    <div className="h-[220px] w-full relative">
      <canvas ref={canvasRef} />
    </div>
  );
};

/* Widget Table Renderer */
interface DashboardTableProps {
  widget: any;
  data: any;
  t: (en: string, sk: string, hu: string) => string;
  formatCurrency?: (value: number) => string;
}

const DashboardTable: React.FC<DashboardTableProps> = ({ widget, data, t, formatCurrency = (v) => `€${v.toLocaleString()}` }) => {
  const dataList = Array.isArray(data) ? data : [];
  const columns = widget.columns || [];

  const formatCell = (val: any, format: string) => {
    if (val === null || val === undefined) return "-";
    if (format === "currency") {
      return formatCurrency(Number(val));
    }
    if (format === "date") {
      return new Date(val).toLocaleDateString();
    }
    return String(val);
  };

  return (
    <div className="w-full overflow-x-auto">
      {dataList.length === 0 ? (
        <div className="text-center py-6 text-xs text-slate-400 font-semibold uppercase tracking-wider">
          {t("No records found", "Žiadne záznamy", "Nincs találat")}
        </div>
      ) : (
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              {columns.map((c: any, index: number) => (
                <th key={index} className="py-2.5 px-3">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 font-semibold text-slate-700">
            {dataList.map((row: any, rIdx: number) => (
              <tr key={rIdx} className="hover:bg-slate-50/50 transition-colors">
                {columns.map((c: any, cIdx: number) => (
                  <td key={cIdx} className="py-2.5 px-3 whitespace-nowrap">
                    {formatCell(row[c.key], c.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
