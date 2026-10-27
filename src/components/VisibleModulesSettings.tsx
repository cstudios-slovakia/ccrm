import React, { useState, useMemo } from "react";
import {
  EyeOff,
  Search,
  Check,
  X,
  CheckCheck,
  Filter,
  WandSparkles
} from "lucide-react";
import type { Language } from "../utils/translations";
import { getTranslation } from "../utils/translations";
import type { CustomDashboard, UnifiedEntryRegistry } from "../types";
import { getModuleCategories, useModuleCatalog } from "../utils/moduleCatalog";
import type { ModuleItemConfig } from "../utils/moduleCatalog";
import { SectionCard } from "./settings/SectionCard";
import { ScrollFade } from "./settings/ScrollFade";

export interface VisibleModulesSettingsProps {
  language: Language;
  canEdit: boolean;
  disabledModules: string[];
  onChangeDisabledModules: (nextDisabled: string[]) => void;
  customDashboards?: CustomDashboard[];
  unifiedEntries?: UnifiedEntryRegistry[];
  /** Opens the module setup wizard. When omitted, the launch button is not shown. */
  onRunSetupWizard?: () => void;
}

export const VisibleModulesSettings: React.FC<VisibleModulesSettingsProps> = ({
  language,
  canEdit,
  disabledModules = [],
  onChangeDisabledModules,
  customDashboards = [],
  unifiedEntries = [],
  onRunSetupWizard
}) => {
  const t = (en: string, sk: string, hu: string) =>
    language === "sk" ? sk : language === "hu" ? hu : en;

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("all");

  // The same list the module setup wizard shows — see utils/moduleCatalog.ts.
  const allModuleItems = useModuleCatalog(language, customDashboards, unifiedEntries);

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
  const categories = useMemo(() => getModuleCategories(language), [language]);

  const pill = (active: boolean) =>
    `inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-ui font-bold transition-colors ${
      active ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <SectionCard
        title={getTranslation(language, "settings.modules.title")}
        description={getTranslation(language, "settings.modules.subtitle")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50 px-3 text-ui font-bold text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {activeCount} {getTranslation(language, "settings.modules.active_stats")}
            </span>
            {hiddenCount > 0 && (
              <span className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50 px-3 text-ui font-bold text-amber-800">
                <EyeOff className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                {hiddenCount} {getTranslation(language, "settings.modules.hidden_stats")}
              </span>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-3 ws-sm:flex-row ws-sm:items-center ws-sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={getTranslation(language, "settings.modules.search_placeholder")}
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2 pl-10 pr-9 text-ui font-medium text-slate-800 placeholder-slate-400 transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label={t("Clear search", "Vymazať hľadanie", "Keresés törlése")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canEdit && onRunSetupWizard && (
              <button
                type="button"
                data-testid="run-module-setup-wizard"
                onClick={onRunSetupWizard}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl bg-indigo-600 px-5 text-ui font-bold text-white shadow-md shadow-indigo-600/20 transition-colors hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              >
                <WandSparkles className="h-4 w-4" aria-hidden="true" />
                <span>{t("Run module setup wizard", "Spustiť sprievodcu modulmi", "Modulvarázsló indítása")}</span>
              </button>
            )}
            {hiddenCount > 0 && (
              <button
                type="button"
                disabled={!canEdit}
                onClick={handleEnableAll}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-ui font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCheck className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                <span>{getTranslation(language, "settings.modules.enable_all")}</span>
              </button>
            )}
          </div>
        </div>

        <ScrollFade axis="x">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setActiveCategoryFilter("all")} className={pill(activeCategoryFilter === "all")}>
              {t("All Categories", "Všetky kategórie", "Minden kategória")} ({totalCount})
            </button>
            {categories.map((cat) => {
              const countInCat = allModuleItems.filter((i) => i.category === cat.id).length;
              const hiddenInCat = allModuleItems.filter((i) => i.category === cat.id && disabledModules.includes(i.id)).length;
              const isSelected = activeCategoryFilter === cat.id;
              return (
                <button key={cat.id} type="button" onClick={() => setActiveCategoryFilter(cat.id)} className={pill(isSelected)}>
                  <span>{cat.title}</span>
                  <span className={`rounded-md px-1.5 text-micro ${isSelected ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"}`}>{countInCat}</span>
                  {hiddenInCat > 0 && !isSelected && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                </button>
              );
            })}
          </div>
        </ScrollFade>
      </SectionCard>

      {categories.map((category) => {
        const itemsInCat = filteredModules.filter((i) => i.category === category.id);
        if (itemsInCat.length === 0) return null;

        const totalCatItems = allModuleItems.filter((i) => i.category === category.id).length;
        const catHiddenCount = allModuleItems.filter((i) => i.category === category.id && disabledModules.includes(i.id)).length;
        const catActiveCount = totalCatItems - catHiddenCount;

        return (
          <SectionCard
            key={category.id}
            title={category.title}
            description={`${catActiveCount} / ${totalCatItems} ${t("visible", "viditeľných", "látható")}`}
            action={
              canEdit ? (
                <div className="flex items-center gap-1">
                  {catHiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => handleToggleCategory(category.id, true)}
                      className="min-h-9 cursor-pointer rounded-xl px-3 text-ui font-bold text-indigo-600 transition-colors hover:bg-indigo-50"
                    >
                      {getTranslation(language, "settings.modules.show_category")}
                    </button>
                  )}
                  {catActiveCount > 0 && (
                    <button
                      type="button"
                      onClick={() => handleToggleCategory(category.id, false)}
                      className="min-h-9 cursor-pointer rounded-xl px-3 text-ui font-bold text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                      {getTranslation(language, "settings.modules.hide_category")}
                    </button>
                  )}
                </div>
              ) : undefined
            }
          >
            <div className="grid grid-cols-1 gap-3.5 ws-md:grid-cols-2">
              {itemsInCat.map((module) => {
                const isVisible = !disabledModules.includes(module.id);
                const ModIcon = module.icon;

                return (
                  <div
                    key={module.id}
                    className={`flex select-none items-center justify-between gap-3 rounded-2xl border p-4 transition-all duration-200 ${
                      isVisible
                        ? "border-slate-200/90 bg-white hover:border-indigo-300 hover:shadow-md hover:shadow-indigo-500/5"
                        : "border-dashed border-slate-300 bg-slate-50/70 opacity-60 hover:opacity-90"
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3.5">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform ${
                          isVisible ? "scale-100 shadow-sm" : "grayscale"
                        }`}
                        style={{ backgroundColor: module.bgColor || `${module.color}18`, color: module.color }}
                      >
                        <ModIcon className="h-5 w-5" aria-hidden="true" />
                      </div>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`truncate text-ui font-bold ${isVisible ? "text-slate-900" : "text-slate-600 line-through decoration-slate-400"}`}>
                            {module.title}
                          </span>
                          {module.badge && (
                            <span
                              className={`type-overline rounded px-1.5 py-0.5 ${
                                module.isCustom ? "border border-indigo-200 bg-indigo-50 text-indigo-700" : "border border-slate-200 bg-slate-100 text-slate-600"
                              }`}
                            >
                              {module.badge}
                            </span>
                          )}
                          {!isVisible && (
                            <span className="type-overline flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-700">
                              <EyeOff className="h-2.5 w-2.5" aria-hidden="true" />
                              {getTranslation(language, "settings.modules.status.hidden")}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-caption leading-tight text-slate-500">{module.description}</p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isVisible}
                        disabled={!canEdit}
                        onClick={() => handleToggleModule(module.id, isVisible, module.title)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                          isVisible ? "bg-indigo-600" : "bg-slate-300"
                        }`}
                      >
                        <span className="sr-only">Toggle {module.title}</span>
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-flex h-5 w-5 shrink-0 transform items-center justify-center rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            isVisible ? "translate-x-5" : "translate-x-0"
                          }`}
                        >
                          {isVisible ? <Check className="h-3 w-3 stroke-[3] text-indigo-600" /> : <X className="h-3 w-3 stroke-[2.5] text-slate-400" />}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        );
      })}

      {filteredModules.length === 0 && (
        <SectionCard title={getTranslation(language, "settings.modules.no_results")}>
          <div className="flex items-center gap-4">
            <Filter className="h-8 w-8 shrink-0 text-slate-300" aria-hidden="true" />
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActiveCategoryFilter("all");
              }}
              className="min-h-11 cursor-pointer rounded-2xl bg-indigo-50 px-5 text-ui font-bold text-indigo-700 transition-colors hover:bg-indigo-100"
            >
              {t("Clear filters", "Zrušiť filtre", "Szűrők törlése")}
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  );
};
