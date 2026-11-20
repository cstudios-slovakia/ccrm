import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Filter } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { EMPTY_LIST_FILTER, NO_PROJECT, activeFilterCount, filterOptions, toggleIn, type BillableFilter, type ListFilter } from "../../utils/timeListFilter.ts";
import type { TimeEntry } from "../../utils/timeTracking.ts";

interface Ctx {
  filter: ListFilter;
  setFilter: (f: ListFilter) => void;
}

const FilterContext = createContext<Ctx | null>(null);

/** Holds the List filter for the session: it survives week and tab changes, not a reload. */
export function TimeListFilterProvider({ children }: { children: ReactNode }) {
  const [filter, setFilterState] = useState<ListFilter>(EMPTY_LIST_FILTER);
  const setFilter = useCallback((f: ListFilter) => setFilterState(f), []);
  const value = useMemo(() => ({ filter, setFilter }), [filter, setFilter]);
  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

/** Outside a provider the filter is simply off. */
export function useTimeListFilter(): Ctx {
  return useContext(FilterContext) ?? { filter: EMPTY_LIST_FILTER, setFilter: () => {} };
}

const chip = (on: boolean) =>
  `inline-flex min-h-9 items-center rounded-full border px-3 text-ui font-semibold cursor-pointer ${on ? "border-primary bg-primary text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`;

/** The funnel button and its popover. `entries` are the shown week's loaded entries (the options come from them). */
export function TimeListFilterButton({ entries }: { entries: readonly TimeEntry[] }) {
  const { t } = useTimeTracking();
  const { filter, setFilter } = useTimeListFilter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const options = useMemo(() => filterOptions(entries), [entries]);
  const count = activeFilterCount(filter);

  useEffect(() => {
    if (!open) return;
    popRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      btnRef.current?.focus();
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && e.target instanceof Node && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const billableItems: { key: BillableFilter; label: string }[] = [
    { key: "any", label: t("Any", "Všetky", "Mind") },
    { key: "billable", label: t("Billable", "Fakturovateľné", "Számlázható") },
    { key: "not-billable", label: t("Not billable", "Nefakturovateľné", "Nem számlázható") },
  ];
  const label = t("Filter entries", "Filtrovať záznamy", "Bejegyzések szűrése");

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
        data-testid="time-filter-button"
        className={`relative inline-flex size-9 items-center justify-center rounded-xl border cursor-pointer ${count > 0 ? "border-primary bg-primary/10 text-primary" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}
      >
        <Filter className="size-4" />
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex size-4 items-center justify-center rounded-full bg-primary text-micro font-bold text-white" data-testid="time-filter-count">{count}</span>
        )}
      </button>
      {open && (
        <div
          ref={popRef}
          tabIndex={-1}
          role="dialog"
          aria-label={label}
          data-testid="time-filter-popover"
          className="fixed inset-x-4 bottom-4 z-50 grid max-h-[70vh] gap-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl outline-none ws-sm:absolute ws-sm:inset-x-auto ws-sm:bottom-auto ws-sm:right-0 ws-sm:top-full ws-sm:mt-2 ws-sm:w-80 ws-sm:max-h-96"
        >
          <fieldset className="grid gap-2">
            <legend className="mb-1 type-meta font-semibold text-slate-500">{t("Project", "Projekt", "Projekt")}</legend>
            <div className="flex flex-wrap gap-2">
              {options.projects.map((p) => (
                <button key={p.id} type="button" aria-pressed={filter.projects.includes(p.id)} onClick={() => setFilter({ ...filter, projects: toggleIn(filter.projects, p.id) })} className={chip(filter.projects.includes(p.id))} data-testid="time-filter-project">
                  {p.name}
                </button>
              ))}
              {options.hasNoProject && (
                <button type="button" aria-pressed={filter.projects.includes(NO_PROJECT)} onClick={() => setFilter({ ...filter, projects: toggleIn(filter.projects, NO_PROJECT) })} className={chip(filter.projects.includes(NO_PROJECT))} data-testid="time-filter-project">
                  {t("No project", "Bez projektu", "Projekt nélkül")}
                </button>
              )}
            </div>
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="mb-1 type-meta font-semibold text-slate-500">{t("Billable", "Fakturovateľnosť", "Számlázhatóság")}</legend>
            <div role="group" className="inline-flex flex-wrap gap-2">
              {billableItems.map((b) => (
                <button key={b.key} type="button" aria-pressed={filter.billable === b.key} onClick={() => setFilter({ ...filter, billable: b.key })} className={chip(filter.billable === b.key)} data-testid={`time-filter-billable-${b.key}`}>
                  {b.label}
                </button>
              ))}
            </div>
          </fieldset>
          {options.tags.length > 0 && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 type-meta font-semibold text-slate-500">{t("Tags", "Štítky", "Címkék")}</legend>
              <div className="flex flex-wrap gap-2">
                {options.tags.map((tag) => (
                  <button key={tag} type="button" aria-pressed={filter.tags.includes(tag)} onClick={() => setFilter({ ...filter, tags: toggleIn(filter.tags, tag) })} className={chip(filter.tags.includes(tag))} data-testid="time-filter-tag">
                    {tag}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <button type="button" onClick={() => setFilter(EMPTY_LIST_FILTER)} disabled={count === 0} data-testid="time-filter-clear" className="justify-self-start text-ui font-semibold text-primary hover:underline disabled:opacity-40 disabled:no-underline cursor-pointer disabled:cursor-default">
            {t("Clear filters", "Zrušiť filtre", "Szűrők törlése")}
          </button>
        </div>
      )}
    </div>
  );
}
