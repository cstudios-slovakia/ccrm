import React from "react";
import { ArrowLeft, ChevronRight, Info, Search } from "lucide-react";
import { cn } from "../../utils/cn";
import { getTranslation } from "../../utils/translations";
import type { Language } from "../../utils/translations";
import {
  SETTINGS_TINTS, categoryKey, resolveSectionRef, sectionKey, settingsPath,
} from "./settingsRegistry.ts";
import type { VisibleCategory } from "./settingsRegistry.ts";
import { SectionPanel, SectionTabs, openSectionTab, useScrollTopOnTab } from "./SectionList";
import { MobileSectionMenu } from "./MobileSectionMenu";
import { LayoutSwitch } from "./SettingsHome";
import type { SettingsLayout } from "./SettingsHome";

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-px font-sans text-caption font-semibold text-slate-600">{children}</kbd>
);

/** Cross-links where an old tab was split: only the targets the user may see. */
export const RelatedList: React.FC<{
  lang: Language;
  category: VisibleCategory;
  canSee: (ref: string) => boolean;
  onOpen: (ref: string) => void;
  /** `card` is the desktop aside; `list` runs on the page itself (phone, sidebar layout). */
  variant: "card" | "list";
}> = ({ lang, category, canSee, onOpen, variant }) => {
  const t = (k: string) => getTranslation(lang, k);
  const links = category.def.related.filter((r) => canSee(r.to));
  if (links.length === 0) return null;
  return (
    <section
      aria-labelledby={`settings-related-${category.def.id}`}
      data-testid="settings-related"
      className={cn(
        "flex flex-col gap-1.5 border border-slate-200 bg-white",
        variant === "card" ? "rounded-3xl p-5" : "rounded-3xl p-4",
      )}
    >
      <h2 id={`settings-related-${category.def.id}`} className="type-overline mb-1.5 text-slate-500">{t("settings.nav.ui.related")}</h2>
      {links.map((r) => {
        const hit = resolveSectionRef(r.to)!;
        const tint = SETTINGS_TINTS[hit.category.tint];
        const SecIcon = hit.section.icon;
        return (
          <a
            key={r.to}
            href={"#" + settingsPath(hit.category.id, hit.section.id)}
            onClick={() => onOpen(r.to)}
            className="flex min-h-14 items-center gap-3 rounded-2xl px-2.5 py-1.5 no-underline transition-colors hover:bg-slate-50"
          >
            <span className={cn("flex size-8.5 shrink-0 items-center justify-center rounded-xl", tint.bg, tint.fg)}>
              <SecIcon className="size-4" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-ui font-bold text-slate-900">{t(r.labelKey)}</span>
              <span className="truncate text-caption text-slate-500">
                {t(categoryKey(hit.category.id, "title"))} › {t(sectionKey(hit.category.id, hit.section.id, "title"))}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
          </a>
        );
      })}
    </section>
  );
};

const HelpCard: React.FC<{ lang: Language; categoryId: string }> = ({ lang, categoryId }) => (
  <section aria-labelledby={`settings-help-${categoryId}`} className="flex flex-col gap-2.5 rounded-3xl border border-indigo-100 bg-indigo-50 p-5">
    <div className="flex items-center gap-2.5 text-indigo-700">
      <Info className="size-4.5 shrink-0" aria-hidden="true" />
      <h2 id={`settings-help-${categoryId}`} className="type-card-title text-indigo-950">{getTranslation(lang, categoryKey(categoryId, "help_title"))}</h2>
    </div>
    <p className="type-body text-indigo-900">{getTranslation(lang, categoryKey(categoryId, "help_body"))}</p>
  </section>
);

/**
 * A category on a wide screen in tile mode, or on a phone: back button and breadcrumb,
 * the category header, a sticky row of section tabs (a dropdown on phones), the one
 * open section, and an aside with related settings and a help card.
 */
export const CategoryPage: React.FC<{
  lang: Language;
  phone: boolean;
  category: VisibleCategory;
  sectionIds: string[];
  /** The open tab. */
  activeId: string;
  /** What the open tab shows. */
  body: React.ReactNode;
  canSee: (ref: string) => boolean;
  layout: SettingsLayout;
  onLayoutChange: (next: SettingsLayout) => void;
  onSearch: () => void;
  onOpenRef: (ref: string) => void;
}> = ({ lang, phone, category, sectionIds, activeId, body, canSee, layout, onLayoutChange, onSearch, onOpenRef }) => {
  const t = (k: string) => getTranslation(lang, k);
  const def = category.def;
  const tint = SETTINGS_TINTS[def.tint];
  const Icon = def.icon;
  useScrollTopOnTab(def.id, activeId);

  const open = (id: string) => {
    onOpenRef(`${def.id}/${id}`);
    openSectionTab(def.id, id);
  };

  if (phone) {
    return (
      <div className="flex flex-col" data-testid="settings-category" data-category={def.id}>
        <div
          data-testid="settings-sticky-bar"
          className="sticky top-[calc(var(--gutter)*-1)] z-20 -mx-(--gutter) -mt-(--gutter) flex flex-col gap-3 border-b border-slate-200 bg-slate-50/95 px-(--gutter) pb-2.5 pt-3.5 backdrop-blur"
        >
          <div className="flex items-center gap-2.5">
            <a
              href="#settings"
              aria-label={t("settings.nav.ui.back")}
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 no-underline"
            >
              <ArrowLeft className="size-4.5" aria-hidden="true" />
            </a>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-ui font-semibold text-slate-500">{t("settings.nav.ui.title")}</span>
              <h1 className="type-panel-title truncate font-heading text-slate-900">{t(categoryKey(def.id, "title"))}</h1>
            </div>
            <button
              type="button"
              onClick={onSearch}
              aria-label={t("settings.nav.ui.search_label")}
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600"
            >
              <Search className="size-4.5" aria-hidden="true" />
            </button>
          </div>
          <MobileSectionMenu lang={lang} categoryId={def.id} sectionIds={sectionIds} activeId={activeId} onPick={open} />
        </div>

        <div className="flex flex-col gap-4 pt-4">
          <SectionPanel lang={lang} categoryId={def.id} sectionId={activeId} className="gap-4">{body}</SectionPanel>
          <RelatedList lang={lang} category={category} canSee={canSee} onOpen={onOpenRef} variant="list" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="settings-category" data-category={def.id}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t("settings.nav.ui.title")} className="flex items-center gap-2.5">
          <a
            href="#settings"
            aria-label={t("settings.nav.ui.back")}
            data-testid="settings-back"
            className="flex size-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 no-underline transition-colors hover:bg-slate-50"
          >
            <ArrowLeft className="size-4.5" aria-hidden="true" />
          </a>
          <a href="#settings" className="text-body font-semibold text-slate-500 no-underline hover:text-slate-800">{t("settings.nav.ui.title")}</a>
          <ChevronRight className="size-4 text-slate-400" aria-hidden="true" />
          <span aria-current="page" className="text-body font-semibold text-slate-900">{t(categoryKey(def.id, "title"))}</span>
        </nav>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onSearch}
            className="inline-flex min-h-11 min-w-60 cursor-pointer items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3.5 text-ui text-slate-500 transition-colors hover:bg-slate-50"
          >
            <Search className="size-4" aria-hidden="true" />
            <span className="flex-1 text-left">{t("settings.nav.ui.search_label")}</span>
            <Kbd>/</Kbd>
          </button>
          <LayoutSwitch lang={lang} layout={layout} onChange={onLayoutChange} iconOnly />
        </div>
      </div>

      <header className="flex items-center gap-4">
        <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-3xl", tint.bg, tint.fg)}>
          <Icon className="size-7" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="type-page-title text-slate-900">{t(categoryKey(def.id, "title"))}</h1>
          <p className="type-body text-slate-500">{t(categoryKey(def.id, "subtitle"))}</p>
        </div>
      </header>

      {sectionIds.length > 1 && (
        <SectionTabs lang={lang} categoryId={def.id} sectionIds={sectionIds} activeId={activeId} onPick={open} />
      )}

      <div className="flex flex-wrap items-start gap-6">
        <SectionPanel lang={lang} categoryId={def.id} sectionId={activeId} className="flex-[999_1_40rem]">{body}</SectionPanel>
        <aside className="flex min-w-0 flex-[1_1_18rem] flex-col gap-4.5 ws-lg:sticky ws-lg:top-[calc(5rem_-_var(--gutter))]">
          <RelatedList lang={lang} category={category} canSee={canSee} onOpen={onOpenRef} variant="card" />
          <HelpCard lang={lang} categoryId={def.id} />
        </aside>
      </div>
    </div>
  );
};
