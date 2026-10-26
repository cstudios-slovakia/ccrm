import React from "react";
import { Info, LayoutGrid, PanelLeft, Settings as SettingsIcon, User } from "lucide-react";
import { cn } from "../../utils/cn";
import { getTranslation } from "../../utils/translations";
import type { Language } from "../../utils/translations";
import {
  SETTINGS_TINTS, categoryKey, groupLabelKey, resolveSectionRef, sectionKey, settingsPath,
} from "./settingsRegistry.ts";
import type { SettingsCategoryDef, SettingsGroupId, VisibleCategory } from "./settingsRegistry.ts";
import type { SearchEntry } from "./settingsSearch.ts";
import { SettingsSearchCard } from "./SettingsSearchCard";
import { ScrollFade } from "./ScrollFade";

export type SettingsLayout = "tiles" | "sidebar";

export interface CategoryBadge {
  label: string;
  tone: "good" | "warn";
}

const PERSONAL_SETTINGS_HREF = "#personal-settings";

/** The Tiles | Sidebar switch. Hidden by the caller below `ws-lg`, where only tiles exist. */
export const LayoutSwitch: React.FC<{
  lang: Language;
  layout: SettingsLayout;
  onChange: (next: SettingsLayout) => void;
  /** Icon-only squares (category page) instead of labelled segments (home). */
  iconOnly?: boolean;
}> = ({ lang, layout, onChange, iconOnly }) => {
  const t = (k: string) => getTranslation(lang, k);
  const options: { id: SettingsLayout; icon: React.ReactNode; label: string; aria: string }[] = [
    { id: "tiles", icon: <LayoutGrid className="size-4" aria-hidden="true" />, label: t("settings.nav.ui.layout_tiles"), aria: t("settings.nav.ui.layout_tiles_aria") },
    { id: "sidebar", icon: <PanelLeft className="size-4" aria-hidden="true" />, label: t("settings.nav.ui.layout_sidebar"), aria: t("settings.nav.ui.layout_sidebar_aria") },
  ];
  return (
    <div role="group" aria-label={t("settings.nav.ui.layout")} data-testid="settings-layout-switch" className="inline-flex gap-1 rounded-2xl border border-slate-200 bg-white p-1">
      {options.map((o) => {
        const on = layout === o.id;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            aria-label={iconOnly ? o.aria : undefined}
            data-testid={`settings-layout-${o.id}`}
            onClick={() => onChange(o.id)}
            className={cn(
              "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl text-ui font-semibold transition-colors",
              iconOnly ? "size-9" : "min-h-9 px-3.5",
              on ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            {o.icon}
            {!iconOnly && o.label}
          </button>
        );
      })}
    </div>
  );
};

export const PrefsLink: React.FC<{ lang: Language; iconOnly?: boolean }> = ({ lang, iconOnly }) => {
  const label = getTranslation(lang, "settings.nav.ui.my_prefs");
  return (
    <a
      href={PERSONAL_SETTINGS_HREF}
      aria-label={iconOnly ? label : undefined}
      data-testid="settings-my-preferences"
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-ui font-semibold text-slate-700 no-underline transition-colors hover:bg-slate-50",
        iconOnly ? "size-11" : "px-4",
      )}
    >
      <User className="size-4" aria-hidden="true" />
      {!iconOnly && label}
    </a>
  );
};

/** Page header of the home and sidebar layouts. */
export const SettingsHeader: React.FC<{
  lang: Language;
  layout: SettingsLayout;
  onLayoutChange: (next: SettingsLayout) => void;
  /** Phones: gear + title + preferences icon only. */
  phone: boolean;
}> = ({ lang, layout, onLayoutChange, phone }) => {
  const t = (k: string) => getTranslation(lang, k);
  if (phone) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-indigo-600">
            <SettingsIcon className="size-5" aria-hidden="true" />
          </span>
          <h1 className="type-page-title truncate text-slate-900">{t("settings.nav.ui.title")}</h1>
        </div>
        <PrefsLink lang={lang} iconOnly />
      </div>
    );
  }
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        <span className="flex size-13 shrink-0 items-center justify-center rounded-3xl border border-slate-200 bg-white text-indigo-600 shadow-glass">
          <SettingsIcon className="size-6.5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="type-page-title text-slate-900">{t("settings.nav.ui.title")}</h1>
          <p className="type-body text-slate-500">{t("settings.nav.ui.subtitle")}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <LayoutSwitch lang={lang} layout={layout} onChange={onLayoutChange} />
        <PrefsLink lang={lang} />
      </div>
    </header>
  );
};

const Badge: React.FC<{ badge: CategoryBadge }> = ({ badge }) => (
  <span
    className={cn(
      "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-caption font-semibold",
      badge.tone === "good" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700",
    )}
  >
    <span className={cn("size-1.5 rounded-full", badge.tone === "good" ? "bg-emerald-500" : "bg-amber-500")} />
    {badge.label}
  </span>
);

const SettingsTile: React.FC<{
  def: SettingsCategoryDef;
  lang: Language;
  phone: boolean;
  badge?: CategoryBadge;
  onOpen: () => void;
}> = ({ def, lang, phone, badge, onOpen }) => {
  const t = (k: string) => getTranslation(lang, k);
  const tint = SETTINGS_TINTS[def.tint];
  const Icon = def.icon;
  const title = t(categoryKey(def.id, "title"));

  if (phone) {
    return (
      <a
        href={"#" + settingsPath(def.id)}
        onClick={onOpen}
        data-testid={`settings-tile-${def.id}`}
        className="settings-tile flex h-41 flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 no-underline shadow-glass-sm hover:border-indigo-200 hover:shadow-glass"
      >
        <span className="flex items-center justify-between">
          <span className={cn("flex size-10 items-center justify-center rounded-2xl", tint.bg, tint.fg)}>
            <Icon className="size-5" aria-hidden="true" />
          </span>
          {badge && (
            <span role="img" aria-label={badge.label} className={cn("size-2.5 rounded-full ring-4", badge.tone === "good" ? "bg-emerald-500 ring-emerald-100" : "bg-amber-500 ring-amber-100")} />
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="type-card-title text-slate-900">{title}</span>
          <span className="line-clamp-2 text-ui leading-snug text-slate-500">{t(categoryKey(def.id, "hint"))}</span>
        </span>
      </a>
    );
  }

  return (
    <a
      href={"#" + settingsPath(def.id)}
      onClick={onOpen}
      data-testid={`settings-tile-${def.id}`}
      className="settings-tile flex h-30 items-start gap-3.5 rounded-3xl border border-slate-200 bg-white p-5.5 no-underline shadow-glass hover:border-indigo-200 hover:shadow-lg"
    >
      <span className={cn("flex size-11.5 shrink-0 items-center justify-center rounded-2xl", tint.bg, tint.fg)}>
        <Icon className="size-5.5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center justify-between gap-2">
          <span className="type-card-title truncate text-slate-900">{title}</span>
          {badge && <Badge badge={badge} />}
        </span>
        <span className="line-clamp-2 text-ui leading-snug text-slate-500">{t(categoryKey(def.id, "desc"))}</span>
      </span>
    </a>
  );
};

/** The "Recently opened" chip row — the only strip on this screen that scrolls sideways. */
const Recents: React.FC<{
  lang: Language;
  recents: string[];
  phone: boolean;
  onOpen: (ref: string) => void;
}> = ({ lang, recents, phone, onOpen }) => {
  if (recents.length === 0) return null;
  const t = (k: string) => getTranslation(lang, k);
  const chips = recents.map((ref) => {
    const hit = resolveSectionRef(ref)!;
    return (
      <a
        key={ref}
        href={"#" + settingsPath(hit.category.id, hit.section.id)}
        onClick={() => onOpen(ref)}
        data-testid="settings-recent-chip"
        className="inline-flex min-h-9 shrink-0 items-center rounded-full border border-slate-200 bg-white px-3 text-ui font-semibold text-slate-700 no-underline transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-800"
      >
        {t(sectionKey(hit.category.id, hit.section.id, "title"))}
      </a>
    );
  });
  if (phone) {
    return (
      <section aria-label={t("settings.nav.ui.recents")} className="-mx-4">
        <ScrollFade axis="x" className="px-4 pb-0.5">
          <div className="flex gap-2">{chips}</div>
        </ScrollFade>
      </section>
    );
  }
  return (
    <section aria-labelledby="settings-recents" className="flex flex-wrap items-center gap-2">
      <h2 id="settings-recents" className="type-overline mr-1.5 text-slate-500">{t("settings.nav.ui.recents")}</h2>
      {chips}
    </section>
  );
};

/** Settings home: header, search, recents and the category tiles in three groups. */
export const SettingsHome: React.FC<{
  lang: Language;
  groups: { id: SettingsGroupId; categories: VisibleCategory[] }[];
  catalog: VisibleCategory[];
  layout: SettingsLayout;
  onLayoutChange: (next: SettingsLayout) => void;
  phone: boolean;
  query: string;
  setQuery: (q: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  recents: string[];
  badges: Record<string, CategoryBadge | undefined>;
  onOpenSearchHit: (entry: SearchEntry) => void;
  onOpenRecent: (ref: string) => void;
  onOpenCategory: (categoryId: string) => void;
}> = ({
  lang, groups, catalog, layout, onLayoutChange, phone, query, setQuery, searchRef, recents, badges,
  onOpenSearchHit, onOpenRecent, onOpenCategory,
}) => {
  const t = (k: string) => getTranslation(lang, k);
  const searching = query.trim().length > 0;
  const [pre, post] = t("settings.nav.ui.personal_note").split("{link}");

  return (
    <div className={cn("flex flex-col", phone ? "gap-4" : "gap-7")} data-testid="settings-home">
      <SettingsHeader lang={lang} layout={layout} onLayoutChange={onLayoutChange} phone={phone} />

      <SettingsSearchCard
        lang={lang}
        catalog={catalog}
        query={query}
        setQuery={setQuery}
        inputRef={searchRef}
        density={phone ? "phone" : "wide"}
        onOpen={onOpenSearchHit}
      />

      {searching ? (
        <p className="flex items-start gap-2.5 px-1 text-ui leading-snug text-slate-500">
          {!phone && <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          {t(phone ? "settings.nav.ui.search_note_mobile" : "settings.nav.ui.search_note")}
        </p>
      ) : (
        <>
          <Recents lang={lang} recents={recents} phone={phone} onOpen={onOpenRecent} />

          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`settings-group-${group.id}`} className={cn("flex flex-col", phone ? "gap-3" : "gap-3.5")}>
              <h2 id={`settings-group-${group.id}`} className={cn("type-overline text-slate-500", phone && "mx-1 mt-1.5")}>
                {t(groupLabelKey(group.id))}
              </h2>
              <div
                data-testid={`settings-group-${group.id}`}
                className={cn("grid gap-4.5", phone ? "grid-cols-2 gap-3" : "grid-cols-[repeat(auto-fill,minmax(21rem,1fr))]")}
              >
                {group.categories.map((c) => (
                  <SettingsTile
                    key={c.def.id}
                    def={c.def}
                    lang={lang}
                    phone={phone}
                    badge={badges[c.def.id]}
                    onOpen={() => onOpenCategory(c.def.id)}
                  />
                ))}
              </div>
            </section>
          ))}

          <p className="flex items-center gap-2.5 px-1 text-ui text-slate-500">
            <Info className="size-4 shrink-0" aria-hidden="true" />
            <span>
              {pre}
              <a href={PERSONAL_SETTINGS_HREF} className="font-semibold text-indigo-600 hover:text-indigo-800">{t("settings.nav.ui.my_prefs")}</a>
              {post}
            </span>
          </p>
        </>
      )}
    </div>
  );
};
