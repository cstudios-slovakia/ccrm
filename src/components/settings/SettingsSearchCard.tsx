import React from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { cn } from "../../utils/cn";
import { formatTranslation, getTranslation } from "../../utils/translations";
import type { Language } from "../../utils/translations";
import { SETTINGS_TINTS, categoryKey, findCategory, findSection, settingsPath } from "./settingsRegistry.ts";
import type { VisibleCategory } from "./settingsRegistry.ts";
import { buildSearchIndex, highlightSegments, searchSettings } from "./settingsSearch.ts";
import type { SearchEntry, SearchGroup } from "./settingsSearch.ts";
import { ScrollFade } from "./ScrollFade";

// Inline settings search. It is never a dialog: the results sit directly under the
// field, in the same card, and replace the category tiles while the query is not
// empty. Esc or the clear button empties the field and the tiles come back.

export const useSettingsSearch = (catalog: VisibleCategory[], lang: Language, query: string) => {
  const index = React.useMemo(
    () => buildSearchIndex(catalog, (key) => getTranslation(lang, key)),
    [catalog, lang],
  );
  return React.useMemo(() => {
    const groups = searchSettings(index, query);
    const flat: SearchEntry[] = groups.flatMap((g) => g.hits);
    return { groups, flat };
  }, [index, query]);
};

/** Wraps the part of `text` that matches the query in <mark>. */
const Highlighted: React.FC<{ text: string; query: string }> = ({ text, query }) => (
  <>
    {highlightSegments(text, query).map((seg, i) =>
      seg.match ? (
        <mark key={i} className="rounded-sm bg-amber-100 px-0.5 text-inherit">{seg.text}</mark>
      ) : (
        <React.Fragment key={i}>{seg.text}</React.Fragment>
      ),
    )}
  </>
);

/** Arrow keys move, Enter opens, Esc clears. Shared by the home card and the sidebar's search. */
export const handleSearchKeys = (
  e: React.KeyboardEvent<HTMLInputElement>,
  opts: {
    flat: SearchEntry[];
    active: number;
    setActive: (n: number) => void;
    open: (entry: SearchEntry) => void;
    clear: () => void;
  },
) => {
  const { flat, active, setActive, open, clear } = opts;
  if (e.key === "Escape") {
    e.preventDefault();
    clear();
  } else if (e.key === "ArrowDown" && flat.length) {
    e.preventDefault();
    setActive((active + 1) % flat.length);
  } else if (e.key === "ArrowUp" && flat.length) {
    e.preventDefault();
    setActive((active - 1 + flat.length) % flat.length);
  } else if (e.key === "Enter" && flat[active]) {
    e.preventDefault();
    open(flat[active]);
  }
};

export const SearchResults: React.FC<{
  lang: Language;
  groups: SearchGroup[];
  flat: SearchEntry[];
  query: string;
  active: number;
  setActive: (n: number) => void;
  onPick: (entry: SearchEntry) => void;
  /** `phone` rows are taller; `nav` is the compact list inside the sidebar. */
  density: "wide" | "phone" | "nav";
  listId: string;
}> = ({ lang, groups, flat, query, active, setActive, onPick, density, listId }) => {
  const t = (k: string) => getTranslation(lang, k);

  if (groups.length === 0) {
    return (
      <div className="settings-results-in px-4 py-8 text-center" role="status">
        <p className="text-body font-bold text-slate-800">{formatTranslation(lang, "settings.nav.ui.no_match", { query })}</p>
        <p className="mt-1 text-ui text-slate-500">{t("settings.nav.ui.no_match_hint")}</p>
      </div>
    );
  }

  return (
    <ScrollFade
      axis="y"
      className={cn("settings-results-in", density === "nav" ? "max-h-[60vh]" : "max-h-[70vh]")}
    >
      <ul id={listId} role="listbox" aria-label={t("settings.nav.ui.search_label")} className={cn("flex flex-col gap-0.5", density === "nav" ? "py-1" : "p-1.5 ws-sm:p-2.5")}>
        {groups.map((group) => {
          const cat = findCategory(group.categoryId)!;
          const tint = SETTINGS_TINTS[cat.tint];
          const CatIcon = cat.icon;
          return (
            <li key={group.categoryId} role="presentation" className="flex flex-col gap-0.5">
              <span className={cn("type-overline text-slate-500", density === "nav" ? "px-3 pb-1 pt-2.5" : "px-3 pb-1 pt-3")}>
                {t(categoryKey(group.categoryId, "title"))}
              </span>
              {group.hits.map((hit) => {
                const idx = flat.indexOf(hit);
                const isActive = idx === active;
                const SecIcon = findSection(hit.categoryId, hit.sectionId)?.icon ?? CatIcon;
                return (
                  <a
                    key={hit.ref}
                    id={`${listId}-${idx}`}
                    role="option"
                    aria-selected={isActive}
                    href={"#" + settingsPath(hit.categoryId, hit.sectionId)}
                    onClick={() => onPick(hit)}
                    onMouseEnter={() => setActive(idx)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-3 no-underline transition-colors",
                      density === "wide" ? "min-h-15 gap-3.5 py-2" : density === "phone" ? "min-h-16 py-1.5" : "min-h-12 py-1.5",
                      isActive ? "bg-indigo-50 outline outline-2 -outline-offset-2 outline-indigo-200" : "hover:bg-slate-50",
                    )}
                  >
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tint.bg, tint.fg)}>
                      <SecIcon className="size-4.5" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-px">
                      <span className="text-body font-bold text-slate-900"><Highlighted text={hit.title} query={query} /></span>
                      {density !== "nav" && (
                        <span className="text-ui text-slate-600"><Highlighted text={hit.hint} query={query} /></span>
                      )}
                    </span>
                    {density === "wide" && isActive && (
                      <span className="shrink-0 text-ui font-semibold text-indigo-700">{t("settings.nav.ui.open_enter")}</span>
                    )}
                    {density === "phone" && <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden="true" />}
                  </a>
                );
              })}
            </li>
          );
        })}
      </ul>
    </ScrollFade>
  );
};

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-px font-sans text-caption font-semibold text-slate-600">{children}</kbd>
);

/**
 * The home screen's search: the field on top, results below it in the same card,
 * keyboard hints in the card's footer (wide) — never a popup.
 */
export const SettingsSearchCard: React.FC<{
  lang: Language;
  catalog: VisibleCategory[];
  query: string;
  setQuery: (q: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  density: "wide" | "phone";
  onOpen: (entry: SearchEntry) => void;
}> = ({ lang, catalog, query, setQuery, inputRef, density, onOpen }) => {
  const t = (k: string) => getTranslation(lang, k);
  const { groups, flat } = useSettingsSearch(catalog, lang, query);
  const [active, setActive] = React.useState(0);
  const listId = React.useId();
  const searching = query.trim().length > 0;

  React.useEffect(() => setActive(0), [query]);

  const wide = density === "wide";
  const count = flat.length;

  return (
    <section
      aria-label={t("settings.nav.ui.search_label")}
      className={cn(
        "overflow-hidden border bg-white transition-shadow",
        wide ? "rounded-3xl" : "rounded-2xl",
        searching
          ? "border-indigo-200 shadow-glass ring-4 ring-indigo-50"
          : "border-slate-200 shadow-glass focus-within:border-indigo-200 focus-within:ring-4 focus-within:ring-indigo-50",
      )}
    >
      <div className={cn("flex items-center", wide ? "min-h-15 gap-3.5 pl-5 pr-3" : "min-h-13 gap-2.5 pl-4 pr-1", searching && "border-b border-slate-100")}>
        <Search className={cn("shrink-0 text-indigo-600", wide ? "size-5" : "size-4.5")} aria-hidden="true" />
        <label htmlFor={listId + "-q"} className="sr-only">{t("settings.nav.ui.search_label")}</label>
        <input
          ref={inputRef}
          id={listId + "-q"}
          type="search"
          role="combobox"
          aria-expanded={searching}
          aria-controls={listId}
          aria-activedescendant={searching && flat[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(wide ? "settings.nav.ui.search_placeholder" : "settings.nav.ui.search_placeholder_short")}
          onKeyDown={(e) =>
            handleSearchKeys(e, { flat, active, setActive, open: onOpen, clear: () => setQuery("") })
          }
          className={cn(
            "min-h-11 min-w-0 flex-1 appearance-none border-0 bg-transparent text-slate-900 outline-none placeholder:text-slate-500 [&::-webkit-search-cancel-button]:hidden",
            wide ? "text-body" : "text-body",
          )}
        />
        {searching ? (
          <>
            {wide && <span className="shrink-0 text-ui text-slate-500" aria-live="polite">
              {count === 0 ? "" : count === 1 ? t("settings.nav.ui.results_one") : formatTranslation(lang, "settings.nav.ui.results_many", { count })}
            </span>}
            <button
              type="button"
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              aria-label={t("settings.nav.ui.search_clear")}
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="size-4.5" aria-hidden="true" />
            </button>
          </>
        ) : (
          wide && <Kbd>/</Kbd>
        )}
      </div>

      {searching && (
        <>
          <SearchResults
            lang={lang}
            groups={groups}
            flat={flat}
            query={query}
            active={active}
            setActive={setActive}
            onPick={onOpen}
            density={density}
            listId={listId}
          />
          {wide && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 bg-slate-50 px-5 py-3 text-ui text-slate-500">
              <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> {t("settings.nav.ui.kbd_move")}</span>
              <span><Kbd>↵</Kbd> {t("settings.nav.ui.kbd_open")}</span>
              <span><Kbd>Esc</Kbd> {t("settings.nav.ui.kbd_clear")}</span>
            </div>
          )}
        </>
      )}
    </section>
  );
};

/** The sidebar's own search: a compact field that swaps the navigation for inline results. */
export const SettingsNavSearch: React.FC<{
  lang: Language;
  catalog: VisibleCategory[];
  query: string;
  setQuery: (q: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onOpen: (entry: SearchEntry) => void;
  /** The navigation shown while the query is empty. */
  children: React.ReactNode;
}> = ({ lang, catalog, query, setQuery, inputRef, onOpen, children }) => {
  const t = (k: string) => getTranslation(lang, k);
  const { groups, flat } = useSettingsSearch(catalog, lang, query);
  const [active, setActive] = React.useState(0);
  const listId = React.useId();
  const searching = query.trim().length > 0;
  React.useEffect(() => setActive(0), [query]);

  return (
    <>
      <div className="mb-2.5 flex min-h-11 items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-1 text-slate-500 focus-within:border-indigo-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100">
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <label htmlFor={listId + "-q"} className="sr-only">{t("settings.nav.ui.search_label")}</label>
        <input
          ref={inputRef}
          id={listId + "-q"}
          type="search"
          role="combobox"
          aria-expanded={searching}
          aria-controls={listId}
          aria-activedescendant={searching && flat[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("settings.nav.ui.search_placeholder_short")}
          onKeyDown={(e) => handleSearchKeys(e, { flat, active, setActive, open: onOpen, clear: () => setQuery("") })}
          className="min-w-0 flex-1 appearance-none border-0 bg-transparent text-ui text-slate-900 outline-none placeholder:text-slate-500 [&::-webkit-search-cancel-button]:hidden"
        />
        {searching ? (
          <button
            type="button"
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            aria-label={t("settings.nav.ui.search_clear")}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <Kbd>/</Kbd>
        )}
      </div>
      {searching ? (
        <SearchResults lang={lang} groups={groups} flat={flat} query={query} active={active} setActive={setActive} onPick={onOpen} density="nav" listId={listId} />
      ) : (
        children
      )}
    </>
  );
};
