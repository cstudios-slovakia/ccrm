import React, { useState, useMemo } from "react";
import * as Icons from "lucide-react";
import {
  Eye,
  EyeOff,
  Search,
  Check,
  X,
  Sparkles,
  CheckCheck,
  Filter,
  ListTodo,
  Briefcase,
  TableProperties,
  Users,
  Package,
  FileText,
  Coins,
  LayoutDashboard,
  BarChart3,
  PencilLine,
  FolderOpen,
  Mail,
  Brain,
  Workflow,
  Globe,
  Sliders
} from "lucide-react";
import type { Language } from "../utils/translations";
import { getTranslation } from "../utils/translations";
import type { CustomDashboard, UnifiedEntryRegistry } from "../types";
import { SOCIAL_MEDIA_ENABLED } from "../utils/featureFlags";
import { FlockIcon } from "./icons/FlockIcon";
import { isHomeDashboard } from "../utils/dashboardWidgets";

export interface VisibleModulesSettingsProps {
  language: Language;
  canEdit: boolean;
  disabledModules: string[];
  onChangeDisabledModules: (nextDisabled: string[]) => void;
  customDashboards?: CustomDashboard[];
  unifiedEntries?: UnifiedEntryRegistry[];
}

interface ModuleItemConfig {
  id: string;
  category: "operations" | "analytics" | "collaboration" | "system";
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  bgColor?: string;
  badge?: string;
  isCustom?: boolean;
}

export const VisibleModulesSettings: React.FC<VisibleModulesSettingsProps> = ({
  language,
  canEdit,
  disabledModules = [],
  onChangeDisabledModules,
  customDashboards = [],
  unifiedEntries = []
}) => {
  const t = (en: string, sk: string, hu: string) =>
    language === "sk" ? sk : language === "hu" ? hu : en;

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("all");

  // Build the list of all available modules in the CRM
  const allModuleItems: ModuleItemConfig[] = useMemo(() => {
    const list: ModuleItemConfig[] = [
      // 1. OPERATIONS & CRM
      {
        id: "tasks",
        category: "operations",
        title: getTranslation(language, "sidebar.tasks"),
        description: t("Kanban workflow, sprints & team tasks", "Kanban nástenka, šprinty a tímové úlohy", "Kanban tábla, sprintek és feladatok"),
        icon: ListTodo,
        color: "#ff5d00",
        bgColor: "rgba(255, 93, 0, 0.12)",
        badge: t("Core", "Hlavné", "Alap")
      },
      {
        id: "projects",
        category: "operations",
        title: t("Projects", "Projekty", "Projektek"),
        description: t("Project timelines, budget & milestones", "Časové osy, rozpočty a míľniky projektov", "Projekt ütemtervek, költségvetések"),
        icon: Briefcase,
        color: "#a855f7",
        bgColor: "rgba(168, 85, 247, 0.12)"
      },
      {
        id: "leads",
        category: "operations",
        title: getTranslation(language, "sidebar.leads"),
        description: t("Pipeline stages, conversions & leads datagrid", "Fázy predaja, konverzie a datagrid leadov", "Értékesítési tölcsér és leadek"),
        icon: TableProperties,
        color: "#2563eb",
        bgColor: "rgba(37, 99, 235, 0.12)"
      },
      {
        id: "clients",
        category: "operations",
        title: getTranslation(language, "sidebar.clients"),
        description: t("Client profiles, address book & contract history", "Profily klientov, adresár a história zmlúv", "Ügyfélprofilok és előzmények"),
        icon: Users,
        color: "#059669",
        bgColor: "rgba(5, 150, 105, 0.12)"
      },
      {
        id: "warehouse",
        category: "operations",
        title: getTranslation(language, "sidebar.warehouse"),
        description: t("Inventory stock, FEFO batches & material movements", "Skladové zásoby, FEFO šarže a pohyby materiálu", "Raktárkészlet, FEFO tételek és mozgások"),
        icon: Package,
        color: "#1e3a8a",
        bgColor: "rgba(30, 58, 138, 0.12)"
      },
      {
        id: "invoices",
        category: "operations",
        title: t("Invoices & Price Offers", "Cenové ponuky & Faktúry", "Ajánlatok és számlák"),
        description: t("Price offers, PDF templates & accounting sync", "Cenové ponuky, PDF šablóny a fakturácia", "Árajánlatok, PDF sablonok és számlázás"),
        icon: FileText,
        color: "#6366f1",
        bgColor: "rgba(99, 102, 241, 0.12)"
      },
      {
        id: "financial",
        category: "operations",
        title: getTranslation(language, "sidebar.financial"),
        description: t("Cash flow trend, matrix table, ledger & recurring rules", "Trend cashflow, tabuľka, pohyby a trvalé príkazy", "Cashflow trend, mátrix tábla, mozgások"),
        icon: Coins,
        color: "#10b981",
        bgColor: "rgba(16, 185, 129, 0.12)"
      },

      // 2. ANALYTICS & REGISTRIES
      {
        id: "dashboard",
        category: "analytics",
        title: getTranslation(language, "sidebar.dashboard"),
        description: t("Widget board of live metrics, charts & tables", "Nástenka so živými metrikami, grafmi a tabuľkami", "Élő mutatók, diagramok és táblázatok"),
        icon: LayoutDashboard,
        color: "#4f46e5",
        bgColor: "rgba(79, 70, 229, 0.12)",
        badge: t("Start Screen", "Úvodná obrazovka", "Kezdőképernyő")
      },
      {
        id: "overview",
        category: "analytics",
        title: getTranslation(language, "sidebar.analytics"),
        description: t("Executive BI overview & marketing funnel metrics", "Manažérske BI reporty a marketingové metriky", "Vezetői BI és marketing mutatók"),
        icon: BarChart3,
        color: "#0891b2",
        bgColor: "rgba(8, 145, 178, 0.12)"
      },

      // Dynamic custom dashboards
      ...customDashboards
        .filter((d) => !d.archived && !isHomeDashboard(d.id))
        .map((d) => {
          const IconComp = (Icons as any)[d.icon] || LayoutDashboard;
          return {
            id: `dash_${d.id}`,
            category: "analytics" as const,
            title: d.name,
            description: t("Custom AI & Widget Dashboard", "Vlastná AI nástenka", "Egyéni AI irányítópult"),
            icon: IconComp,
            color: d.color || "#4f46e5",
            bgColor: `${d.color || "#4f46e5"}1f`,
            badge: "Custom",
            isCustom: true
          };
        }),

      // Dynamic unified entry custom database registries
      ...unifiedEntries
        .filter((ue) => !ue.archived)
        .map((ue) => {
          const IconComp = (Icons as any)[ue.icon] || FolderOpen;
          return {
            id: `ue_${ue.id}`,
            category: "analytics" as const,
            title: ue.name,
            description: t("Custom Database Registry", "Vlastná databázová evidencia", "Egyéni adatbázis-nyilvántartás"),
            icon: IconComp,
            color: ue.color || "#6366f1",
            bgColor: `${ue.color || "#6366f1"}1f`,
            badge: "DB",
            isCustom: true
          };
        }),

      // 3. COLLABORATION & AI
      {
        id: "meetings",
        category: "collaboration",
        title: getTranslation(language, "sidebar.meetings"),
        description: t("Voice recordings, AI notes & meeting minutes", "Hlasové nahrávky, AI poznámky a zápisy zo stretnutí", "Hangfelvételek, AI jegyzetek és memók"),
        icon: PencilLine,
        color: "#4f46e5",
        bgColor: "rgba(79, 70, 229, 0.12)"
      },
      {
        id: "files",
        category: "collaboration",
        title: getTranslation(language, "sidebar.files"),
        description: t("Central cloud document repository & attachments", "Centrálne úložisko dokumentov a príloh", "Központi dokumentumtár és csatolmányok"),
        icon: FolderOpen,
        color: "#b45309",
        bgColor: "rgba(180, 83, 9, 0.12)"
      },
      {
        id: "email",
        category: "collaboration",
        title: t("Mail Client", "Pošta", "Levelezés"),
        description: t("Integrated IMAP/SMTP corporate email client", "Integrovaná firemná pošta a schránka", "Integrált vállalati levelezőkliens"),
        icon: Mail,
        color: "#db2777",
        bgColor: "rgba(219, 39, 119, 0.12)"
      },
      {
        id: "rag_ai",
        category: "collaboration",
        title: t("RAG AI Assistant", "RAG AI Asistent", "RAG AI Asszisztens"),
        description: t("Vector-indexed company knowledge AI chat", "Firemný znalostný AI asistent s vektorovou DB", "Vállalati tudásbázis AI asszisztens"),
        icon: Brain,
        color: "#8b5cf6",
        bgColor: "rgba(139, 92, 246, 0.12)",
        badge: "AI"
      },
      {
        id: "sai",
        category: "collaboration",
        title: "SAI",
        description: t("Swarm AI predictive market rehearsals & strategic simulation", "Prediktívna simulácia trhu a strategický nácvik so Swarm AI", "Prediktív szimuláció és stratégiai próba Swarm AI-val"),
        icon: FlockIcon,
        color: "#8b5cf6",
        bgColor: "rgba(139, 92, 246, 0.12)",
        badge: "Swarm AI"
      },
      {
        id: "automation",
        category: "collaboration",
        title: t("Automation", "Automatizácia", "Automatizálás"),
        description: t("Event triggers, webhook integrations & rule builder", "Udalosťové spúšťače, webhooky a automatické pravidlá", "Eseményvezérelt munkafolyamatok és webhookok"),
        icon: Workflow,
        color: "#6b21a8",
        bgColor: "rgba(107, 33, 168, 0.12)"
      }
    ];

    if (SOCIAL_MEDIA_ENABLED) {
      list.push({
        id: "social_media",
        category: "collaboration",
        title: t("Social Media", "Sociálne siete", "Közösségi média"),
        description: t("Social post scheduling & cross-platform publishing", "Plánovanie príspevkov a publikovanie na sociálne siete", "Közösségi média bejegyzések időzítése"),
        icon: Globe,
        color: "#f43f5e",
        bgColor: "rgba(244, 63, 94, 0.12)"
      });
    }

    // 4. SYSTEM & TOOLS
    list.push({
      id: "updates",
      category: "system",
      title: t("Updates & What's New", "Novinky a verzie", "Újdonságok"),
      description: t("System changelog, release notes & improvements", "História verzií, novinky a vylepšenia systému", "Verziótörténet és újdonságok"),
      icon: Sparkles,
      color: "#d97706",
      bgColor: "rgba(217, 119, 6, 0.12)"
    });

    return list;
  }, [language, customDashboards, unifiedEntries, t]);

  // Statistics
  const totalCount = allModuleItems.length;
  const hiddenCount = allModuleItems.filter((item) => disabledModules.includes(item.id)).length;
  const activeCount = totalCount - hiddenCount;

  // Toggle single module
  const handleToggleModule = (id: string, currentVisible: boolean, moduleTitle: string) => {
    if (!canEdit) return;

    let nextDisabled: string[];
    if (currentVisible) {
      // Hide module
      nextDisabled = Array.from(new Set([...disabledModules, id]));
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(
          `${moduleTitle}: ${getTranslation(language, "settings.modules.toast.hidden")}`
        );
      }
    } else {
      // Show module
      nextDisabled = disabledModules.filter((m) => m !== id);
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(
          `${moduleTitle}: ${getTranslation(language, "settings.modules.toast.visible")}`
        );
      }
    }
    onChangeDisabledModules(nextDisabled);
  };

  // Toggle all in category
  const handleToggleCategory = (categoryKey: ModuleItemConfig["category"], makeVisible: boolean) => {
    if (!canEdit) return;
    const categoryItemIds = allModuleItems.filter((i) => i.category === categoryKey).map((i) => i.id);

    let nextDisabled: string[];
    if (makeVisible) {
      nextDisabled = disabledModules.filter((id) => !categoryItemIds.includes(id));
    } else {
      nextDisabled = Array.from(new Set([...disabledModules, ...categoryItemIds]));
    }
    onChangeDisabledModules(nextDisabled);

    if (typeof (window as any).showToast === "function") {
      (window as any).showToast(
        makeVisible
          ? t("All modules in section are now visible.", "Všetky moduly v sekcii sú teraz viditeľné.", "A kategória összes modulja mostantól látható.")
          : t("All modules in section are now hidden.", "Všetky moduly v sekcii sú teraz skryté.", "A kategória összes modulja mostantól rejtve van.")
      );
    }
  };

  // Enable all modules
  const handleEnableAll = () => {
    if (!canEdit) return;
    onChangeDisabledModules([]);
    if (typeof (window as any).showToast === "function") {
      (window as any).showToast(
        t("All modules enabled and visible across navigation.", "Všetky moduly boli zapnuté a sú viditeľné v navigácii.", "Minden modul bekapcsolva és látható a navigációban.")
      );
    }
  };

  // Filter modules based on search and category
  const filteredModules = useMemo(() => {
    return allModuleItems.filter((item) => {
      if (activeCategoryFilter !== "all" && item.category !== activeCategoryFilter) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
      );
    });
  }, [allModuleItems, activeCategoryFilter, searchQuery]);

  // Categories config
  const categories: Array<{
    id: ModuleItemConfig["category"];
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
  }> = [
    {
      id: "operations",
      title: getTranslation(language, "settings.modules.cat.operations"),
      icon: Briefcase,
      color: "#6366f1",
      bgColor: "bg-indigo-50/80 text-indigo-700 border-indigo-200"
    },
    {
      id: "analytics",
      title: getTranslation(language, "settings.modules.cat.analytics"),
      icon: BarChart3,
      color: "#0891b2",
      bgColor: "bg-cyan-50/80 text-cyan-700 border-cyan-200"
    },
    {
      id: "collaboration",
      title: getTranslation(language, "settings.modules.cat.collaboration"),
      icon: Brain,
      color: "#8b5cf6",
      bgColor: "bg-purple-50/80 text-purple-700 border-purple-200"
    },
    {
      id: "system",
      title: getTranslation(language, "settings.modules.cat.system"),
      icon: Sliders,
      color: "#475569",
      bgColor: "bg-slate-100 text-slate-700 border-slate-200"
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner & Header Card */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
          <div className="flex items-start gap-4">
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-lg shadow-indigo-500/25 shrink-0">
              <Eye className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-lg sm:text-xl font-heading font-extrabold text-slate-900 tracking-tight">
                  {getTranslation(language, "settings.modules.title")}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                  {getTranslation(language, "settings.modules.admin_badge")}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 font-medium max-w-2xl leading-relaxed">
                {getTranslation(language, "settings.modules.subtitle")}
              </p>
            </div>
          </div>

          {/* Quick Counter Pills */}
          <div className="flex items-center gap-2 self-start md:self-center shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-bold">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{activeCount} {getTranslation(language, "settings.modules.active_stats")}</span>
            </div>
            {hiddenCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-800 text-xs font-bold">
                <EyeOff className="h-3.5 w-3.5 text-amber-600" />
                <span>{hiddenCount} {getTranslation(language, "settings.modules.hidden_stats")}</span>
              </div>
            )}
          </div>
        </div>

        {/* Global Action Bar & Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={getTranslation(language, "settings.modules.search_placeholder")}
              className="w-full pl-10 pr-9 py-2 rounded-xl text-xs font-medium bg-slate-50/80 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {hiddenCount > 0 && (
              <button
                type="button"
                disabled={!canEdit}
                onClick={handleEnableAll}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCheck className="h-3.5 w-3.5 text-indigo-600" />
                <span>{getTranslation(language, "settings.modules.enable_all")}</span>
              </button>
            )}
          </div>
        </div>

        {/* Category Pill Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => setActiveCategoryFilter("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeCategoryFilter === "all"
                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t("All Categories", "Všetky kategórie", "Minden kategória")} ({totalCount})
          </button>
          {categories.map((cat) => {
            const countInCat = allModuleItems.filter((i) => i.category === cat.id).length;
            const hiddenInCat = allModuleItems.filter((i) => i.category === cat.id && disabledModules.includes(i.id)).length;
            const isSelected = activeCategoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryFilter(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  isSelected
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <span>{cat.title}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                    isSelected ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {countInCat}
                </span>
                {hiddenInCat > 0 && !isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Module Categories Grid */}
      <div className="space-y-8">
        {categories.map((category) => {
          const itemsInCat = filteredModules.filter((i) => i.category === category.id);
          if (itemsInCat.length === 0) return null;

          const totalCatItems = allModuleItems.filter((i) => i.category === category.id).length;
          const catHiddenCount = allModuleItems.filter((i) => i.category === category.id && disabledModules.includes(i.id)).length;
          const catActiveCount = totalCatItems - catHiddenCount;
          const CategoryIcon = category.icon;

          return (
            <div
              key={category.id}
              className="glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4"
            >
              {/* Category Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl border ${category.bgColor}`}>
                    <CategoryIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider">
                      {category.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 font-medium">
                      {catActiveCount} / {totalCatItems} {t("visible", "viditeľných", "látható")}
                    </p>
                  </div>
                </div>

                {/* Section Batch Actions */}
                {canEdit && (
                  <div className="flex items-center gap-1 self-end sm:self-auto">
                    {catHiddenCount > 0 && (
                      <button
                        type="button"
                        onClick={() => handleToggleCategory(category.id, true)}
                        className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                      >
                        {getTranslation(language, "settings.modules.show_category")}
                      </button>
                    )}
                    {catActiveCount > 0 && (
                      <button
                        type="button"
                        onClick={() => handleToggleCategory(category.id, false)}
                        className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        {getTranslation(language, "settings.modules.hide_category")}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Module Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {itemsInCat.map((module) => {
                  const isVisible = !disabledModules.includes(module.id);
                  const ModIcon = module.icon;

                  return (
                    <div
                      key={module.id}
                      className={`p-4 rounded-2xl border transition-all duration-200 flex items-center justify-between gap-3 select-none ${
                        isVisible
                          ? "bg-white border-slate-200/90 hover:border-indigo-300 hover:shadow-md hover:shadow-indigo-500/5"
                          : "bg-slate-50/70 border-dashed border-slate-300 opacity-60 hover:opacity-90"
                      }`}
                    >
                      {/* Left: Icon & Meta */}
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div
                          className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 transition-transform ${
                            isVisible ? "scale-100 shadow-sm" : "grayscale"
                          }`}
                          style={{
                            backgroundColor: module.bgColor || `${module.color}18`,
                            color: module.color
                          }}
                        >
                          <ModIcon className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-xs sm:text-sm font-bold truncate ${
                                isVisible ? "text-slate-900" : "text-slate-600 line-through decoration-slate-400"
                              }`}
                            >
                              {module.title}
                            </span>
                            {module.badge && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                  module.isCustom
                                    ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                    : "bg-slate-100 text-slate-600 border border-slate-200"
                                }`}
                              >
                                {module.badge}
                              </span>
                            )}
                            {!isVisible && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                                <EyeOff className="h-2.5 w-2.5" />
                                {getTranslation(language, "settings.modules.status.hidden")}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 truncate leading-tight">
                            {module.description}
                          </p>
                        </div>
                      </div>

                      {/* Right: Modern iOS Switch */}
                      <div className="shrink-0 flex items-center">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isVisible}
                          disabled={!canEdit}
                          onClick={() => handleToggleModule(module.id, isVisible, module.title)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                            isVisible ? "bg-indigo-600" : "bg-slate-300"
                          }`}
                        >
                          <span className="sr-only">Toggle {module.title}</span>
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out flex items-center justify-center ${
                              isVisible ? "translate-x-5" : "translate-x-0"
                            }`}
                          >
                            {isVisible ? (
                              <Check className="h-3 w-3 text-indigo-600 stroke-[3]" />
                            ) : (
                              <X className="h-3 w-3 text-slate-400 stroke-[2.5]" />
                            )}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Empty state if search finds nothing */}
        {filteredModules.length === 0 && (
          <div className="glass-panel p-12 rounded-3xl border border-white/60 bg-white/95 shadow-glass text-center space-y-3">
            <Filter className="h-8 w-8 text-slate-300 mx-auto" />
            <h4 className="text-sm font-bold text-slate-700">
              {getTranslation(language, "settings.modules.no_results")}
            </h4>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActiveCategoryFilter("all");
              }}
              className="px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors cursor-pointer"
            >
              {t("Clear filters", "Zrušiť filtre", "Szűrők törlése")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
