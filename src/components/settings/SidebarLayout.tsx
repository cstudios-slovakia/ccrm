import React from "react";
import { cn } from "../../utils/cn";
import { getTranslation } from "../../utils/translations";
import type { Language } from "../../utils/translations";
import {
  SETTINGS_TINTS, categoryKey, groupLabelKey, sectionKey, settingsPath,
} from "./settingsRegistry.ts";
import type { SettingsGroupId, VisibleCategory } from "./settingsRegistry.ts";
import type { SearchEntry } from "./settingsSearch.ts";
import { SectionList, useSectionScroll } from "./SectionList";
import type { SectionNode } from "./SectionList";
import { SettingsNavSearch } from "./SettingsSearchCard";
import { SettingsHeader } from "./SettingsHome";
import type { SettingsLayout } from "./SettingsHome";
import { RelatedList } from "./CategoryPage";
import { ScrollFade } from "./ScrollFade";

/**
 * The sidebar layout (wide screens): a grouped navigation on the left — search on top,
 * the active category expanded with its sections as sub-links — and the category's
 * sections stacked on the right.
 */
export const SidebarLayout: React.FC<{
  lang: Language;
  groups: { id: SettingsGroupId; categories: VisibleCategory[] }[];
  catalog: VisibleCategory[];
  category: VisibleCategory;
  sections: SectionNode[];
  routeSectionId: string | null;
  layout: SettingsLayout;
  onLayoutChange: (next: SettingsLayout) => void;
  query: string;
  setQuery: (q: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  canSee: (ref: string) => boolean;
  onOpenSearchHit: (entry: SearchEntry) => void;
  onOpenRef: (ref: string) => void;
  onOpenCategory: (categoryId: string) => void;
}> = ({
  lang, groups, catalog, category, sections, routeSectionId, layout, onLayoutChange, query, setQuery, searchRef,
  canSee, onOpenSearchHit, onOpenRef, onOpenCategory,
}) => {
  const t = (k: string) => getTranslation(lang, k);
  const def = category.def;
  const tint = SETTINGS_TINTS[def.tint];
  const Icon = def.icon;
  const sectionIds = sections.map((s) => s.id);
  const { activeId, flashId, goTo } = useSectionScroll(def.id, sectionIds, routeSectionId);

  return (
    <div className="flex flex-col gap-7" data-testid="settings-sidebar-layout">
      <SettingsHeader lang={lang} layout={layout} onLayoutChange={onLayoutChange} phone={false} />

      <div className="flex flex-wrap items-start gap-7">
        <nav
          aria-label={t("settings.nav.ui.categories_nav")}
          data-testid="settings-nav"
          className="glass-panel flex min-w-60 max-w-75 flex-[1_1_16.5rem] flex-col rounded-3xl border border-white/60 bg-white/95 p-3.5 shadow-glass ws-lg:sticky ws-lg:top-20"
        >
          <SettingsNavSearch lang={lang} catalog={catalog} query={query} setQuery={setQuery} inputRef={searchRef} onOpen={onOpenSearchHit}>
            <ScrollFade axis="y" className="max-h-[calc(100vh-14rem)]">
              <div className="flex flex-col gap-0.5">
                {groups.map((group) => (
                  <div key={group.id} className="flex flex-col gap-0.5">
                    <span className="type-overline px-3 pb-1 pt-3.5 text-slate-500 first:pt-1.5">{t(groupLabelKey(group.id))}</span>
                    {group.categories.map((c) => {
                      const on = c.def.id === def.id;
                      const CIcon = c.def.icon;
                      const ctint = SETTINGS_TINTS[c.def.tint];
                      return (
                        <React.Fragment key={c.def.id}>
                          <a
                            href={"#" + settingsPath(c.def.id)}
                            aria-current={on ? "page" : undefined}
                            onClick={() => onOpenCategory(c.def.id)}
                            data-testid={`settings-nav-${c.def.id}`}
                            className={cn(
                              "flex min-h-10.5 items-center gap-3 rounded-xl px-3 text-body font-semibold no-underline transition-colors",
                              on ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                            )}
                          >
                            <CIcon className={cn("size-4.5 shrink-0", on ? "text-white" : ctint.fg)} aria-hidden="true" />
                            {t(categoryKey(c.def.id, "title"))}
                          </a>
                          {on && c.sections.length > 1 && (
                            <ul className="mb-1.5 ml-5.5 mt-1 flex flex-col gap-px border-l-2 border-indigo-100 pl-3">
                              {c.sections.map((s) => {
                                const cur = activeId === s.id;
                                return (
                                  <li key={s.id}>
                                    <a
                                      href={"#" + settingsPath(c.def.id, s.id)}
                                      aria-current={cur ? "true" : undefined}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        onOpenRef(`${c.def.id}/${s.id}`);
                                        goTo(s.id);
                                      }}
                                      className={cn(
                                        "flex min-h-8.5 items-center rounded-lg px-2.5 text-ui no-underline transition-colors",
                                        cur ? "bg-indigo-50 font-bold text-indigo-700" : "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                                      )}
                                    >
                                      {t(sectionKey(c.def.id, s.id, "title"))}
                                    </a>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                ))}
              </div>
            </ScrollFade>
          </SettingsNavSearch>
        </nav>

        <div className="flex min-w-0 flex-[999_1_36rem] flex-col gap-6" data-testid="settings-category" data-category={def.id}>
          <div className="flex items-center gap-3.5">
            <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", tint.bg, tint.fg)}>
              <Icon className="size-6" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="type-page-title text-slate-900">{t(categoryKey(def.id, "title"))}</h2>
              <p className="type-body text-slate-500">{t(categoryKey(def.id, "subtitle"))}</p>
            </div>
          </div>
          <SectionList categoryId={def.id} sections={sections} flashId={flashId} />
          <RelatedList lang={lang} category={category} canSee={canSee} onOpen={onOpenRef} variant="list" />
        </div>
      </div>
    </div>
  );
};
