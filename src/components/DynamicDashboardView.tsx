import React, { useState, useEffect, useRef } from "react";
import { Sparkles, Save, Edit, RefreshCw, Send, AlertCircle, LayoutDashboard, FileText, HelpCircle, X, Info, Languages, Layers, Rows3, History, ChevronDown } from "lucide-react";
import type { CustomDashboard } from "../types";
import { cn } from "../utils/cn";
import type { Language } from "../utils/translations";
import { formatMoney } from "../utils/currency";
import { localeCodeFor } from "../utils/localTime";
import { chartTheme, useAppearance } from "../utils/theme";

interface DynamicDashboardViewProps {
  dashboard: CustomDashboard;
  onSaveDashboard: (updated: CustomDashboard) => void;
  systemLanguage: string;
  currencyCode?: string | null;
}

/** Where a `tabs` widget's per-tab query result is stored in the data/error maps. */
const tabDataKey = (widgetId: string, index: number) => `${widgetId}::tab${index}`;

const WIDGET_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  metric: LayoutDashboard,
  chart: Sparkles,
  table: FileText,
  timeline: History,
  accordion: Rows3,
  tabs: Layers
};

const WIDGET_TYPES = ["metric", "chart", "table", "timeline", "accordion", "tabs"];

/**
 * Every chart flavour the renderer understands (keys are `canonical()`-ed), mapped
 * to the Chart.js controller that actually draws it. "gauge" has no controller and
 * is rendered natively by GaugeWidget.
 */
const CHART_BASE_TYPES: Record<string, string> = {
  bar: "bar",
  horizontalbar: "bar",
  line: "line",
  area: "line",
  pie: "pie",
  doughnut: "doughnut",
  polararea: "polarArea",
  radar: "radar",
  scatter: "scatter",
  bubble: "bubble"
};

const CHART_TYPES = [...Object.keys(CHART_BASE_TYPES), "gauge"];

const canonical = (value: any) => String(value ?? "").toLowerCase().replace(/[\s_-]/g, "");

/** Solid accent for the widget palette names the AI is allowed to pick from. */
const ACCENT_COLORS: Record<string, string> = {
  indigo: "#4f46e5",
  blue: "#2563eb",
  emerald: "#059669",
  purple: "#8b5cf6",
  amber: "#d97706",
  rose: "#e11d48",
  cyan: "#0891b2",
  pink: "#db2777"
};

const accentFor = (color: any) => ACCENT_COLORS[String(color || "indigo")] || ACCENT_COLORS.indigo;

/**
 * Decides which renderer a widget belongs to. The model is told to emit
 * `type` + `chartType`, but in practice it also writes `type: "radar"` or omits
 * `type` entirely — infer rather than render an empty card.
 */
const resolveWidgetType = (w: any): { type: string; widget: any } => {
  const raw = canonical(w?.type);
  if (WIDGET_TYPES.includes(raw)) return { type: raw, widget: w };
  if (raw === "kpi" || raw === "counter" || raw === "stat") return { type: "metric", widget: w };
  if (raw === "list") return { type: "table", widget: w };
  if (CHART_TYPES.includes(raw)) {
    return { type: "chart", widget: { ...w, chartType: w?.chartType || raw } };
  }
  if (Array.isArray(w?.tabs) && w.tabs.length > 0) return { type: "tabs", widget: w };
  if (w?.chartType) return { type: "chart", widget: w };
  if (Array.isArray(w?.columns) && w.columns.length > 0) return { type: "table", widget: w };
  return { type: "metric", widget: w };
};

/**
 * Picks the first row key that looks like the requested role, so timeline and
 * accordion widgets still render when the model omits the `mapping` block.
 */
const pickKey = (row: any, explicit: any, candidates: string[]): string | null => {
  if (explicit && row && Object.prototype.hasOwnProperty.call(row, explicit)) return explicit;
  if (!row || typeof row !== "object") return null;
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const hit = keys.find(k => k.toLowerCase() === candidate);
    if (hit) return hit;
  }
  for (const candidate of candidates) {
    const hit = keys.find(k => k.toLowerCase().includes(candidate));
    if (hit) return hit;
  }
  return null;
};

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
  // AI-generated widget titles/column labels come back either as a plain
  // string (legacy panels, or a model that ignored the schema) or as an
  // { en, sk, hu } object — pick the current app language, falling back
  // through the other translations rather than showing nothing.
  const localize = (value: any): string => {
    if (value && typeof value === "object") {
      return value[systemLanguage] || value.en || value.sk || value.hu || Object.values(value)[0] as string || "";
    }
    return value ?? "";
  };
  // A widget/column whose title/label is still a plain string predates the
  // { en, sk, hu } schema (or came from a model that ignored it) — those are
  // the only ones that still need translating; freshly generated widgets
  // already carry all three languages.
  const hasLegacyText = (layout: any): boolean => {
    const isLegacy = (v: any) => typeof v === "string" && v.trim() !== "";
    const widgets = layout?.widgets || [];
    return widgets.some((w: any) => {
      if (isLegacy(w?.title)) return true;
      if (Array.isArray(w?.columns) && w.columns.some((c: any) => isLegacy(c?.label))) return true;
      if (Array.isArray(w?.tabs) && w.tabs.some((tab: any) =>
        isLegacy(tab?.label) || isLegacy(tab?.title) ||
        (Array.isArray(tab?.columns) && tab.columns.some((c: any) => isLegacy(c?.label)))
      )) return true;
      return false;
    });
  };

  const [isEditMode, setIsEditMode] = useState(dashboard.layout.widgets.length === 0);
  const [promptText, setPromptText] = useState("");
  const [selectedModel, setSelectedModel] = useState(dashboard.activeModel || "gpt-5.6-terra");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [widgetData, setWidgetData] = useState<Record<string, any>>({});
  const [loadingWidgets, setLoadingWidgets] = useState<Record<string, boolean>>({});
  const [widgetErrors, setWidgetErrors] = useState<Record<string, string>>({});
  const [isSaved, setIsSaved] = useState(true);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const models = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"];
  const modelIndex = models.indexOf(selectedModel);
  const handleModelSliderChange = (val: number) => {
    setSelectedModel(models[val] || "gpt-5.6-terra");
  };
  // Driven by slider position (not the selectedModel string) so dashboards saved
  // before models were renamed to the gpt-5.6 family (e.g. a stored "gpt-4o")
  // still show a level that matches where the slider thumb actually sits.
  const modelLevelIndex = modelIndex >= 0 ? modelIndex : 1;
  const modelLevelLabel = [
    t("Simple", "Jednoduchý", "Egyszerű"),
    t("Smart", "Inteligentný", "Okos"),
    t("Expert", "Expert", "Szakértő")
  ][modelLevelIndex];

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

  // Load data for all widgets in the layout. A `tabs` widget holds one query per
  // tab rather than a single query of its own, so results are keyed by a data key
  // (the widget id, or `${widget.id}::tab${i}`) instead of plainly by widget id.
  const fetchAllWidgetsData = async (layoutToLoad = tempLayout) => {
    const widgets = layoutToLoad?.widgets || [];
    const jobs: { key: string; query: any }[] = [];
    widgets.forEach((w: any) => {
      if (w?.query?.action) jobs.push({ key: w.id, query: w.query });
      if (Array.isArray(w?.tabs)) {
        w.tabs.forEach((tab: any, i: number) => {
          if (tab?.query?.action) jobs.push({ key: tabDataKey(w.id, i), query: tab.query });
        });
      }
    });

    jobs.forEach(async ({ key, query }) => {
      setLoadingWidgets(prev => ({ ...prev, [key]: true }));
      setWidgetErrors(prev => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      try {
        const res = await fetch("/api/dashboard_query.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: query.action,
            params: query.params || {}
          })
        });
        const json = await res.json();
        if (json.success) {
          setWidgetData(prev => ({ ...prev, [key]: json.data }));
        } else {
          const msg = json.message || t("The AI-generated query for this widget was rejected.", "AI vygenerovaný dopyt pre tento modul bol zamietnutý.", "A modulhoz generált AI lekérdezést elutasították.");
          console.error(`Failed to fetch data for widget ${key}: ${msg}`);
          setWidgetErrors(prev => ({ ...prev, [key]: msg }));
        }
      } catch (err: any) {
        const msg = err?.message || t("Connection to the server failed.", "Pripojenie na server zlyhalo.", "A szerverkapcsolat sikertelen.");
        console.error(`Failed to fetch data for widget ${key}`, err);
        setWidgetErrors(prev => ({ ...prev, [key]: msg }));
      } finally {
        setLoadingWidgets(prev => ({ ...prev, [key]: false }));
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
        setErrorMsg(json.message || t("Failed to generate dashboard layout.", "Vygenerovanie rozloženia nástenky zlyhalo.", "Az irányítópult elrendezésének létrehozása sikertelen."));
      }
    } catch (err: any) {
      setErrorMsg(err.message || t("Connection to AI agent failed.", "Pripojenie k AI agentovi zlyhalo.", "Az AI ügynökhöz való kapcsolódás sikertelen."));
    } finally {
      setIsGenerating(false);
    }
  };

  // Silently backfills en/sk/hu for a panel saved before the multi-language
  // schema existed (or produced by a model that ignored it) so it reads
  // correctly for every viewer without anyone having to ask for it. Runs
  // once per dashboard load and, since it only adds missing translations
  // rather than changing anything a user typed, persists on its own.
  const autoTranslatedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!hasLegacyText(dashboard.layout)) return;
    if (autoTranslatedIdsRef.current.has(dashboard.id)) return;
    autoTranslatedIdsRef.current.add(dashboard.id);

    let cancelled = false;
    (async () => {
      setIsTranslating(true);
      try {
        const res = await fetch("/api/translate_dashboard.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layout: dashboard.layout, model: dashboard.activeModel || "gpt-5.6-terra" })
        });
        const json = await res.json();
        if (!cancelled && json.success && json.layout) {
          const updated: CustomDashboard = { ...dashboard, layout: json.layout };
          onSaveDashboard(updated);
          setTempLayout(json.layout);
        }
      } catch {
        // Non-fatal: the panel just keeps showing in its original language
        // until the next successful attempt (e.g. after reload).
        autoTranslatedIdsRef.current.delete(dashboard.id);
      } finally {
        if (!cancelled) setIsTranslating(false);
      }
    })();

    return () => { cancelled = true; };
  }, [dashboard.id]);

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

  /**
   * Renders the body of one widget (or of one tab inside a `tabs` widget).
   * `dataKey` selects which entry of widgetData/widgetErrors belongs to it, and
   * `depth` stops a model-generated `tabs` inside `tabs` from recursing forever.
   */
  const renderWidgetBody = (rawWidget: any, dataKey: string, depth = 0): React.ReactNode => {
    const err = widgetErrors[dataKey];
    if (err) {
      return (
        <div className="flex items-start gap-2 p-3 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold leading-relaxed">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{err}</span>
        </div>
      );
    }

    const { type, widget } = resolveWidgetType(rawWidget);
    const data = widgetData[dataKey];

    switch (type) {
      case "metric":
        return <DashboardMetric widget={widget} data={data} localizedTitle={localize(widget.title)} money={money} />;
      case "chart":
        return <DashboardChart widget={widget} data={data} localizedTitle={localize(widget.title)} />;
      case "table":
        return (
          <DashboardTable
            widget={widget}
            data={data}
            t={t}
            formatCurrency={money}
            systemLanguage={systemLanguage as Language}
            localize={localize}
          />
        );
      case "timeline":
        return <DashboardTimeline widget={widget} data={data} t={t} systemLanguage={systemLanguage as Language} localize={localize} />;
      case "accordion":
        return <DashboardAccordion widget={widget} data={data} t={t} localize={localize} />;
      case "tabs":
        if (depth > 0) {
          // Tabs nested inside tabs have no sane layout and no fetched data.
          return (
            <div className="text-center py-6 text-xs text-slate-400 font-semibold uppercase tracking-wider">
              {t("Nested tabs are not supported", "Vnorené záložky nie sú podporované", "Az egymásba ágyazott fülek nem támogatottak")}
            </div>
          );
        }
        return (
          <DashboardTabs
            widget={widget}
            localize={localize}
            t={t}
            isTabLoading={(i: number) => !!loadingWidgets[tabDataKey(widget.id, i)]}
            renderTab={(tab: any, i: number) => renderWidgetBody(tab, tabDataKey(widget.id, i), depth + 1)}
          />
        );
      default:
        return null;
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
    <div className="w-full space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
      {/* HEADER — same shape as every other module: title block on the left,
          actions on the right, hairline rule underneath. This view used to paint
          its own full-bleed background and padding on top of the app's own
          <main> padding, which made it visibly narrower/differently inset than
          every other section. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6" style={{ color: dashboard.color }} />
            {dashboard.name}
          </h1>
          <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mt-1">
            {t("Custom Dynamic AI Dashboard", "Vlastný dynamický AI panel", "Egyéni dinamikus AI irányítópult")}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {isEditMode && (
            <button
              onClick={() => setIsHelpOpen(true)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition-colors text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <HelpCircle className="h-4 w-4" />
              <span>{t("Help", "Pomoc", "Súgó")}</span>
            </button>
          )}

          {isTranslating && (
            <span
              title={t(
                "Translating this panel's titles and labels into all app languages…",
                "Prekladám názvy a popisky tohto panela do všetkých jazykov aplikácie…",
                "A panel címeinek és feliratainak fordítása az összes alkalmazásnyelvre…"
              )}
              className="px-3 py-2.5 rounded-xl text-slate-400 flex items-center gap-1.5 shrink-0"
            >
              <Languages className="h-4 w-4 animate-pulse" />
            </span>
          )}

          {tempLayout.widgets.length > 0 && !isEditMode && (
            <button
              onClick={() => setIsEditMode(true)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition-colors text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Edit className="h-4 w-4" />
              <span>{t("Edit", "Upraviť", "Szerkesztés")}</span>
            </button>
          )}

          {!isSaved && (
            <button
              onClick={handleSave}
              className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 transition-all font-heading font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 shrink-0"
            >
              <Save className="h-4 w-4" />
              <span>{t("Save", "Uložiť", "Mentés")}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div>
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
          <div className="max-w-2xl mx-auto flex flex-col items-center text-center p-8 mt-12">
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

              <div className="flex items-center justify-between gap-5 pt-2">
                <div className="flex flex-col gap-1.5 items-start w-[190px] shrink-0">
                  <div className="flex items-center justify-between w-full gap-3">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">
                      {t("Model Power", "Výkon modelu", "Modell Teljesítmény")}
                    </span>
                    <span className="text-[9px] font-black text-purple-600 uppercase tracking-wider whitespace-nowrap">
                      {modelLevelLabel}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    value={modelLevelIndex}
                    onChange={(e) => handleModelSliderChange(Number(e.target.value))}
                    className="w-full accent-purple-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-[9px] font-medium text-slate-400 tracking-tight normal-case">
                    {selectedModel}
                  </span>
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
          <div className="grid grid-cols-12 gap-6 text-left pb-2">
            {tempLayout.widgets.map((w: any) => {
              const WidgetIcon = WIDGET_ICONS[resolveWidgetType(w).type] || FileText;
              return (
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
                      {localize(w.title)}
                    </span>
                    <div
                      className="w-7 h-7 rounded-xl flex items-center justify-center text-white scale-90"
                      // `w.color` is a palette NAME ("emerald", "rose", "amber"), which is
                      // not valid CSS — those badges painted transparent and hid their white
                      // icon. Resolve the name to its hex; anything else (a literal colour
                      // from the dashboard) is still passed through untouched.
                      style={widgetErrors[w.id] ? undefined : { backgroundColor: ACCENT_COLORS[w.color] || w.color || dashboard.color }}
                    >
                      {widgetErrors[w.id] ? (
                        <AlertCircle className="h-4 w-4 text-rose-500" />
                      ) : (
                        <WidgetIcon className="h-4 w-4" />
                      )}
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col justify-center">
                    {renderWidgetBody(w, w.id)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Prompt Bar docked at the bottom of the workspace in Edit Mode. Sticky
            (not the old viewport-fixed overlay) so it stays anchored to this
            view's own scroll flow like the rest of the app instead of floating
            over — and clipping — the last row of widgets. */}
        {isEditMode && tempLayout.widgets.length > 0 && (
          <div className="sticky bottom-6 z-40 mt-6 animate-in slide-in-from-bottom-6 duration-300">
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

              <div className="flex flex-col gap-1 items-start w-[150px] shrink-0 justify-center">
                <div className="flex items-center justify-between w-full gap-2">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest shrink-0">
                    {t("Model", "Model", "Modell")}
                  </span>
                  <span className="text-[8px] font-black text-purple-600 uppercase tracking-wider whitespace-nowrap">
                    {modelLevelLabel}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  value={modelLevelIndex}
                  onChange={(e) => handleModelSliderChange(Number(e.target.value))}
                  className="w-full accent-purple-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-[8px] font-medium text-slate-400 tracking-tight normal-case">
                  {selectedModel}
                </span>
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
      </div>

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
                className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
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

                  <div className="col-span-6 h-8 rounded-lg bg-indigo-50/50 flex items-center justify-center text-[9px] font-black text-indigo-600 border border-indigo-100">lg (1/2)</div>
                  <div className="col-span-6 h-8 rounded-lg bg-indigo-50/50 flex items-center justify-center text-[9px] font-black text-indigo-600 border border-indigo-100">lg (1/2)</div>

                  <div className="col-span-12 h-8 rounded-lg bg-purple-50/50 flex items-center justify-center text-[9px] font-black text-purple-600 border border-purple-100">full (1/1)</div>
                </div>
              </div>

              {/* Elements breakdowns */}
              <div className="space-y-4 text-left">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {t("2. Interface Element Types", "2. Typy rozhraní a modulov", "2. Interfész elem típusok")}
                </h4>

                {/* Metric Card */}
                <div className="p-4 border border-slate-100 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex flex-col justify-between shrink-0 shadow-sm w-24 h-16">
                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wide truncate">{t("Total Leads", "Počet leadov", "Leadek száma")}</span>
                    <span className="text-base font-black text-slate-800">142</span>
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">{t("KPI Metric Card", "Metrická karta (KPI)", "KPI Kártya")}</h5>
                    <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                      {t("Best for counts, single sums, or values. Uses sizes 'sm' (1/4 width) or 'md' (1/3 width).", "Ideálne pre počty, celkové sumy. Používa veľkosti 'sm' (1/4 šírky) alebo 'md' (1/3 šírky).", "Ideális összegekhez, darabszámokhoz.")}
                    </p>
                  </div>
                </div>

                {/* Bar Chart */}
                <div className="p-4 border border-slate-100 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
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
                <div className="p-4 border border-slate-100 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
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
                <div className="p-4 border border-slate-100 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
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
                <div className="p-4 border border-slate-100 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
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
                <div className="p-4 border border-slate-100 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
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
                <div className="p-4 border border-slate-100 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
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
                <div className="p-4 border border-slate-100 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
                  <div className="w-24 h-16 rounded-xl bg-white border border-slate-200 p-2.5 flex flex-col justify-center shrink-0 shadow-sm gap-1.5">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 w-3/4 rounded-full" />
                    </div>
                    <span className="text-[8px] font-black text-emerald-600 text-center">{t("75% Goal", "75 % cieľa", "75% cél")}</span>
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">{t("Progress & Goals", "Ukazovatele pokroku (Gauge)", "Célok és Folyamatjelzők")}</h5>
                    <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                      {t("Ideal for tracking target goals (e.g. sales targets, completed tasks, lead pipeline progression).", "Ideálne pre sledovanie finančných cieľov, splnených úloh alebo percentuálneho pokroku.", "Célértékek és elért haladás szemléltetésére tökéletes.")}
                    </p>
                  </div>
                </div>

                {/* Timeline */}
                <div className="p-4 border border-slate-100 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
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
                <div className="p-4 border border-slate-100 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
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
                <div className="p-4 border border-slate-100 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
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
                <div className="p-4 border border-slate-100 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
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
                <div className="p-4 border border-slate-100 rounded-2xl flex gap-3.5 items-start bg-slate-50/50">
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

/* Single-value KPI card. Extracted from the grid so a `tabs` widget can host one. */
const DashboardMetric: React.FC<{
  widget: any;
  data: any;
  localizedTitle: string;
  money: (value: number, opts?: Intl.NumberFormatOptions) => string;
}> = ({ widget, data, localizedTitle, money }) => {
  const value = (() => {
    if (widget.metricValue !== undefined && widget.metricValue !== "") {
      return widget.metricValue;
    }
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
          const titleLower = localizedTitle.toLowerCase();
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
  })();

  return <div className="text-3xl font-black text-slate-800 tracking-tight">{value}</div>;
};

/* Widget Chart Element utilizing global Chart.js */
interface DashboardChartProps {
  widget: any;
  data: any;
  localizedTitle?: string;
}

/* A goal/progress gauge is a plain percentage bar, not a Chart.js controller —
   Chart.js core ships no "gauge" type, so this is rendered natively instead of
   being handed to `new Chart(...)`, which used to throw "gauge is not a
   registered controller" and crash the whole dashboard section. */
const GaugeWidget: React.FC<DashboardChartProps> = ({ widget, data }) => {
  const dataList = Array.isArray(data) ? data : data ? [data] : [];
  const row = dataList[0] || {};
  const valueKey = widget.mapping?.dataKey || widget.mapping?.valueKey || "value";
  const targetKey = widget.mapping?.targetKey;

  const value = Number(row[valueKey] ?? 0);
  const target = Number(
    (targetKey ? row[targetKey] : undefined) ?? widget.target ?? row.target ?? 0
  );
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((value / target) * 100))) : 0;

  const barColor = accentFor(widget.color);

  return (
    <div className="w-full flex flex-col justify-center gap-2 py-4">
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
      <span className="text-xs font-black text-center" style={{ color: barColor }}>
        {pct}%
      </span>
    </div>
  );
};

const DashboardChart: React.FC<DashboardChartProps> = ({ widget, data, localizedTitle }) => {
  // See FinancialReportView in ClientsView.tsx: canvas colours are literals and
  // have to be rebuilt when the appearance changes.
  const appearance = useAppearance();
  const chart = chartTheme(appearance);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<any>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

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

  // "horizontalBar" and "area" are not Chart.js controllers — they are a bar with
  // a swapped index axis and a filled line. Normalising here (rather than passing
  // the AI's word straight to `new Chart`) is what makes them actually render.
  const kind = canonical(widget.chartType) || "bar";

  useEffect(() => {
    if (kind === "gauge") return;
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

    const labels = dataList.map((item: any) => item[labelsKey] ?? "Unknown");
    const chartData = dataList.map((item: any) => Number(item[dataKey] || 0));

    const colorKey = widget.color || "indigo";
    const palette = chartPalettes[colorKey] || chartPalettes.indigo;

    const isPie = ["pie", "doughnut", "polararea"].includes(kind);
    const isRadar = kind === "radar";
    const isScatter = kind === "scatter" || kind === "bubble";
    const isHorizontal = kind === "horizontalbar";
    const isArea = kind === "area";

    // Scatter/bubble take {x, y} points instead of labels + values.
    const xKey = widget.mapping?.xKey || widget.mapping?.labelsKey || "x";
    const yKey = widget.mapping?.yKey || widget.mapping?.dataKey || "y";
    const rKey = widget.mapping?.radiusKey || widget.mapping?.sizeKey;
    const scatterData = dataList.map((item: any) => ({
      x: Number(item[xKey] ?? 0),
      y: Number(item[yKey] ?? 0),
      ...(kind === "bubble" ? { r: Math.max(3, Number(item[rKey ?? ""] ?? 6)) } : {})
    }));

    // Chart.js controller ids are case-sensitive ("polarArea"), and neither
    // "horizontalBar" nor "area" is one — they are a bar with a swapped index
    // axis and a filled line. Anything unmapped is passed through so an
    // AI-invented type still surfaces as this widget's error, not a wrong chart.
    const baseType = CHART_BASE_TYPES[kind] || kind;

    const backgroundColor = isPie
      ? palette
      : isScatter
        ? palette[0]
        : isRadar
          ? palette[0] + "33"
          : palette[0] + "20"; // 20% opacity for bar/line
    const borderColor = isPie ? "#ffffff" : palette[0];

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const cartesianScales = {
      x: {
        // Scatter needs a numeric x axis; every other type keeps Chart.js's own
        // default for its controller (category for bar/line).
        ...(isScatter ? { type: "linear" } : {}),
        grid: { display: isScatter || isHorizontal, color: chart.grid },
        ticks: { color: chart.tick, font: { size: 9, weight: "bold" } }
      },
      y: {
        grid: { display: isHorizontal ? false : true, color: chart.grid },
        ticks: { color: chart.tick, font: { size: 9, weight: "bold" } }
      }
    };

    const radarScales = {
      r: {
        grid: { color: chart.grid },
        angleLines: { color: chart.grid },
        pointLabels: { font: { size: 9, weight: "bold" }, color: chart.tick },
        ticks: { font: { size: 8 }, backdropColor: "transparent" }
      }
    };

    try {
      chartInstanceRef.current = new ChartGlob(ctx, {
        type: baseType,
        data: {
          labels: labels,
          datasets: [
            {
              label: localizedTitle ?? widget.title,
              data: isScatter ? scatterData : chartData,
              backgroundColor,
              borderColor,
              borderWidth: isPie ? 2 : isScatter ? 0 : 3,
              fill: isArea || kind === "line" || isRadar,
              tension: 0.3,
              ...(isScatter ? { pointRadius: 5, pointHoverRadius: 7 } : {}),
              ...(isRadar ? { pointBackgroundColor: palette[0], pointRadius: 3 } : {})
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          // Chart.js v3+ dropped the "horizontalBar" type: a horizontal bar is a
          // normal bar chart whose index axis is y.
          ...(isHorizontal ? { indexAxis: "y" } : {}),
          plugins: {
            legend: {
              display: isPie,
              position: "bottom",
              labels: {
                boxWidth: 10,
                color: chart.label,
                font: { size: 9, weight: "bold" }
              }
            }
          },
          scales: isPie ? undefined : isRadar ? radarScales : cartesianScales
        }
      });
      setRenderError(null);
    } catch (err: any) {
      // A chart type Chart.js core doesn't ship a controller for (an AI-picked
      // value outside the documented enum) used to throw here and take the
      // whole dashboard section down. Contain it to this one widget instead.
      setRenderError(err?.message || "Unsupported chart type.");
    }

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [widget, data, appearance, localizedTitle, kind]);

  if (kind === "gauge") {
    return <GaugeWidget widget={widget} data={data} />;
  }

  if (renderError) {
    return (
      <div className="h-[220px] w-full flex items-center justify-center text-center px-4">
        <span className="text-xs font-semibold text-rose-600">{renderError}</span>
      </div>
    );
  }

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
  systemLanguage: Language;
  localize: (value: any) => string;
}

const DashboardTable: React.FC<DashboardTableProps> = ({ widget, data, t, formatCurrency = (v) => `€${v.toLocaleString()}`, systemLanguage, localize }) => {
  const dataList = Array.isArray(data) ? data : [];
  const columns = widget.columns || [];

  const formatCell = (val: any, format: string) => {
    if (val === null || val === undefined) return "-";
    if (format === "currency") {
      return formatCurrency(Number(val));
    }
    if (format === "date") {
      return new Date(val).toLocaleDateString(localeCodeFor(systemLanguage));
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
                  {localize(c.label)}
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

/* ---------------------------------------------------------------------------
   Layout widgets: timeline, accordion and tabs. These read plain query rows and
   arrange them, so no charting library is involved.
--------------------------------------------------------------------------- */

const EmptyRows: React.FC<{ t: (en: string, sk: string, hu: string) => string }> = ({ t }) => (
  <div className="text-center py-6 text-xs text-slate-400 font-semibold uppercase tracking-wider">
    {t("No records found", "Žiadne záznamy", "Nincs találat")}
  </div>
);

const TITLE_KEY_CANDIDATES = ["title", "name", "subject", "event", "label", "status"];
const DATE_KEY_CANDIDATES = ["date", "timestamp", "created_at", "received_at", "deadline", "due_date", "start_date"];
const BODY_KEY_CANDIDATES = ["description", "content", "notes", "summary", "body", "detail"];

const formatTimestamp = (val: any, lang: Language) => {
  if (val === null || val === undefined || val === "") return "";
  const parsed = new Date(val);
  if (isNaN(parsed.getTime())) return String(val);
  return parsed.toLocaleDateString(localeCodeFor(lang), { year: "numeric", month: "short", day: "numeric" });
};

/* Chronological event list — meeting history, task activity, audit logs. */
const DashboardTimeline: React.FC<{
  widget: any;
  data: any;
  t: (en: string, sk: string, hu: string) => string;
  systemLanguage: Language;
  localize: (value: any) => string;
}> = ({ widget, data, t, systemLanguage }) => {
  const dataList = Array.isArray(data) ? data : [];
  if (dataList.length === 0) return <EmptyRows t={t} />;

  const sample = dataList[0];
  const titleKey = pickKey(sample, widget.mapping?.titleKey, TITLE_KEY_CANDIDATES);
  const dateKey = pickKey(sample, widget.mapping?.dateKey, DATE_KEY_CANDIDATES);
  const bodyKey = pickKey(
    sample,
    widget.mapping?.descriptionKey || widget.mapping?.contentKey,
    BODY_KEY_CANDIDATES
  );
  const accent = accentFor(widget.color);

  return (
    <ol className="w-full relative pl-5 py-1 space-y-4">
      <span className="absolute left-[4px] top-2 bottom-2 w-px bg-slate-200" aria-hidden="true" />
      {dataList.map((row: any, i: number) => (
        <li key={i} className="relative">
          <span
            className="absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full ring-4 ring-white"
            style={{ backgroundColor: i === 0 ? accent : "#cbd5e1" }}
            aria-hidden="true"
          />
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-bold text-slate-800">
              {titleKey ? String(row[titleKey] ?? "-") : "-"}
            </span>
            {dateKey && (
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                {formatTimestamp(row[dateKey], systemLanguage)}
              </span>
            )}
          </div>
          {bodyKey && row[bodyKey] ? (
            <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5 line-clamp-3">
              {String(row[bodyKey])}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
};

/* Collapsible rows — long-form values (notes, summaries) that would blow out a table. */
const DashboardAccordion: React.FC<{
  widget: any;
  data: any;
  t: (en: string, sk: string, hu: string) => string;
  localize: (value: any) => string;
}> = ({ widget, data, t }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const dataList = Array.isArray(data) ? data : [];
  if (dataList.length === 0) return <EmptyRows t={t} />;

  const sample = dataList[0];
  const titleKey = pickKey(sample, widget.mapping?.titleKey, TITLE_KEY_CANDIDATES);
  const contentKey = pickKey(
    sample,
    widget.mapping?.contentKey || widget.mapping?.descriptionKey,
    BODY_KEY_CANDIDATES
  );
  const subtitleKey = pickKey(sample, widget.mapping?.subtitleKey, DATE_KEY_CANDIDATES);

  return (
    <div className="w-full divide-y divide-slate-100">
      {dataList.map((row: any, i: number) => {
        const isOpen = openIndex === i;
        const content = contentKey ? row[contentKey] : null;
        return (
          <div key={i}>
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="w-full flex items-center justify-between gap-3 py-2.5 text-left cursor-pointer group"
            >
              <span className="text-xs font-bold text-slate-700 group-hover:text-slate-900 transition-colors">
                {titleKey ? String(row[titleKey] ?? "-") : "-"}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {subtitleKey && row[subtitleKey] ? (
                  <span className="text-[10px] font-bold text-slate-400">{String(row[subtitleKey])}</span>
                ) : null}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-slate-400 transition-transform duration-200",
                    isOpen && "rotate-180"
                  )}
                />
              </div>
            </button>
            {isOpen && (
              <p className="pb-3 text-[11px] text-slate-500 leading-relaxed whitespace-pre-line animate-in fade-in slide-in-from-top-1 duration-200">
                {content ? String(content) : t("No details.", "Žiadne detaily.", "Nincsenek részletek.")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* Tabbed container — several datasets sharing one card. Each tab carries its own
   query and its own inner widget spec, rendered by the parent's dispatcher. */
const DashboardTabs: React.FC<{
  widget: any;
  localize: (value: any) => string;
  t: (en: string, sk: string, hu: string) => string;
  isTabLoading: (index: number) => boolean;
  renderTab: (tab: any, index: number) => React.ReactNode;
}> = ({ widget, localize, t, isTabLoading, renderTab }) => {
  const [active, setActive] = useState(0);
  const tabs: any[] = Array.isArray(widget.tabs) ? widget.tabs : [];
  if (tabs.length === 0) return <EmptyRows t={t} />;

  const current = Math.min(active, tabs.length - 1);
  const accent = accentFor(widget.color);
  const activeTab = tabs[current];

  return (
    <div className="w-full">
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {tabs.map((tab: any, i: number) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            className={cn(
              "px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
              i === current
                ? "text-white border-transparent shadow-sm"
                : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-700"
            )}
            style={i === current ? { backgroundColor: accent } : undefined}
          >
            {localize(tab?.label ?? tab?.title) || `${t("Tab", "Záložka", "Fül")} ${i + 1}`}
          </button>
        ))}
      </div>

      <div className="relative min-h-[80px] flex flex-col justify-center">
        {isTabLoading(current) ? (
          <div className="flex items-center justify-center py-6">
            <RefreshCw className="h-4 w-4 text-indigo-600 animate-spin" />
          </div>
        ) : (
          // The tab's own label doubles as its title, so a metric tab keeps the
          // currency heuristic that reads the widget title.
          renderTab({ ...activeTab, title: activeTab?.title ?? activeTab?.label }, current)
        )}
      </div>
    </div>
  );
};
