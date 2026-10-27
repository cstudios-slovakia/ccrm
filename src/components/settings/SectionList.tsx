import React from "react";
import { cn } from "../../utils/cn";
import { getTranslation } from "../../utils/translations";
import type { Language } from "../../utils/translations";
import { sectionKey, settingsPath } from "./settingsRegistry.ts";
import { ScrollFade } from "./ScrollFade";

/** DOM id of a section's panel; one category is on screen at a time, so this is unique. */
export const sectionDomId = (categoryId: string, sectionId: string) => `settings-${categoryId}-${sectionId}`;
export const tabDomId = (categoryId: string, sectionId: string) => `settings-tab-${categoryId}-${sectionId}`;

/** The address of a section's tab. Every tab, menu entry and sidebar link goes through it. */
export const sectionHash = (categoryId: string, sectionId: string) => "#" + settingsPath(categoryId, sectionId);

/** Opens a tab by moving the address, which keeps every section deep-linkable and Back working. */
export const openSectionTab = (categoryId: string, sectionId: string) => {
  const target = sectionHash(categoryId, sectionId);
  if (window.location.hash !== target) window.location.hash = target;
};

/**
 * Every section is its own tab: only the open one is rendered. Switching tabs (or
 * category) starts the page from the top, so the new tab never opens half way down.
 */
export const useScrollTopOnTab = (categoryId: string, sectionId: string) => {
  React.useEffect(() => {
    document.querySelector<HTMLElement>("main.workspace")?.scrollTo({ top: 0, behavior: "auto" });
  }, [categoryId, sectionId]);
};

/** The one open section of a category, as the panel of its tab. */
export const SectionPanel: React.FC<{
  lang: Language;
  categoryId: string;
  sectionId: string;
  children: React.ReactNode;
  className?: string;
}> = ({ lang, categoryId, sectionId, children, className }) => (
  <section
    key={sectionId}
    id={sectionDomId(categoryId, sectionId)}
    role="tabpanel"
    aria-label={getTranslation(lang, sectionKey(categoryId, sectionId, "title"))}
    data-settings-section={sectionId}
    data-testid={`settings-section-${categoryId}-${sectionId}`}
    className={cn("settings-panel-in flex min-w-0 flex-col gap-6", className)}
  >
    {children}
  </section>
);

/**
 * The tab strip of a category (wide screens, tile layout): real tabs — one per
 * section, arrow keys move between them, the chosen one is the only one shown.
 */
export const SectionTabs: React.FC<{
  lang: Language;
  categoryId: string;
  sectionIds: string[];
  activeId: string;
  onPick: (sectionId: string) => void;
}> = ({ lang, categoryId, sectionIds, activeId, onPick }) => {
  const t = (k: string) => getTranslation(lang, k);
  const listRef = React.useRef<HTMLUListElement | null>(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = Math.max(0, sectionIds.indexOf(activeId));
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? sectionIds.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + sectionIds.length) % sectionIds.length;
    onPick(sectionIds[next]);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-tab="${sectionIds[next]}"]`)?.focus());
  };

  return (
    <nav
      aria-label={t("settings.nav.ui.sections")}
      data-testid="settings-section-tabs"
      className="sticky top-[calc(0.5rem_-_var(--gutter))] z-10 rounded-3xl border border-slate-200 bg-white/90 p-1.5 shadow-glass-sm backdrop-blur"
    >
      <ScrollFade axis="x">
        <ul ref={listRef} role="tablist" aria-orientation="horizontal" onKeyDown={onKeyDown} className="flex gap-1">
          {sectionIds.map((id) => {
            const current = activeId === id;
            return (
              <li key={id} role="presentation" className="shrink-0">
                <a
                  id={tabDomId(categoryId, id)}
                  role="tab"
                  data-tab={id}
                  aria-selected={current}
                  aria-controls={sectionDomId(categoryId, id)}
                  tabIndex={current ? 0 : -1}
                  href={sectionHash(categoryId, id)}
                  onClick={(e) => {
                    e.preventDefault();
                    onPick(id);
                  }}
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-2xl px-4 text-ui no-underline transition-colors",
                    current ? "bg-indigo-50 font-bold text-indigo-700" : "font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  {t(sectionKey(categoryId, id, "title"))}
                </a>
              </li>
            );
          })}
        </ul>
      </ScrollFade>
    </nav>
  );
};
