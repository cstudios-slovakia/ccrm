import React, { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, MoreHorizontal, Pencil, Plus, Star } from "lucide-react";
import type { CustomCalendar } from "../../types";
import type { Language } from "../../utils/translations";
import {
  BUILTIN_CALENDAR_LENSES,
  type BuiltInCalendarLensId,
  type HubCalendarRbac,
} from "../../utils/taskHubCalendars";

interface CalendarLensSwitcherProps {
  activeLens: string;
  onSelectLens: (lensId: string) => void;
  favorites: string[];
  onToggleFavorite: (lensId: string) => void;
  customCalendars: CustomCalendar[];
  rbac: HubCalendarRbac;
  canEditCustom: boolean;
  onNewCustomCalendar: () => void;
  onEditCustomCalendar: (cal: CustomCalendar) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  lang: Language;
}

export const CalendarLensSwitcher: React.FC<CalendarLensSwitcherProps> = ({
  activeLens,
  onSelectLens,
  favorites,
  onToggleFavorite,
  customCalendars,
  rbac,
  canEditCustom,
  onNewCustomCalendar,
  onEditCustomCalendar,
  expanded,
  onToggleExpanded,
  lang,
}) => {
  const t = (en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const visibleBuiltIns = BUILTIN_CALENDAR_LENSES.filter((l) => l.canView(rbac));
  const customById = new Map(customCalendars.map((c) => [`custom:${c.id}`, c]));
  const visibleBuiltInMap = new Map(visibleBuiltIns.map((b) => [b.id, b]));

  const labelFor = (id: string): string => {
    const builtIn = visibleBuiltInMap.get(id as BuiltInCalendarLensId);
    if (builtIn) return builtIn.label[lang] || builtIn.label.en;
    const custom = customById.get(id);
    return custom ? custom.name : id;
  };

  const colorFor = (id: string): string | null => customById.get(id)?.color ?? null;

  const pinnedIds = favorites.filter((id) => {
    if (id === "tasks") return false;
    return visibleBuiltInMap.has(id as BuiltInCalendarLensId) || customById.has(id);
  });

  const activeIsUnpinned = activeLens !== "tasks" && !pinnedIds.includes(activeLens) && (visibleBuiltInMap.has(activeLens as BuiltInCalendarLensId) || customById.has(activeLens));

  const renderTab = (id: string, temporary = false) => {
    const isActive = activeLens === id;
    const dotColor = colorFor(id);
    return (
      <button
        key={id}
        type="button"
        data-testid={`calendar-lens-tab-${id}`}
        onClick={() => onSelectLens(id)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-caption font-semibold transition-all cursor-pointer whitespace-nowrap ${
          isActive
            ? "bg-white text-entity-text shadow-2xs border border-gray-200"
            : "text-gray-600 hover:bg-gray-200/70 hover:text-gray-900"
        }`}
      >
        {dotColor && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />}
        <span>{labelFor(id)}</span>
        {temporary && (
          <span
            role="button"
            tabIndex={0}
            title={t("Pin to calendar bar", "Pripnúť na lištu kalendárov", "Kitűzés a naptársávra")}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onToggleFavorite(id);
              }
            }}
            className="text-amber-500 hover:text-amber-600 p-0.5 -mr-1"
          >
            <Star className="h-3 w-3" />
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
        <div className="inline-flex items-center bg-gray-100 p-0.5 rounded-md border border-gray-200 gap-0.5 max-w-full overflow-x-auto scrollbar-none">
          {renderTab("tasks")}
          {pinnedIds.map((id) => renderTab(id))}
          {activeIsUnpinned && renderTab(activeLens, true)}
        </div>

        {/* 3-dots overflow menu for all other calendars & favorites */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            data-testid="calendar-lens-more-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            title={t("More calendars & favorites", "Ďalšie kalendáre a obľúbené", "További naptárak és kedvencek")}
            className={`inline-flex items-center justify-center h-7 w-7 rounded-md border transition-colors cursor-pointer ${
              menuOpen
                ? "bg-white border-entity-border text-entity-text shadow-2xs"
                : "bg-white border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div
              data-testid="calendar-lens-more-menu"
              className="absolute left-0 top-full mt-1.5 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-[90] py-1.5 text-ui animate-in fade-in slide-in-from-top-1 duration-150"
            >
              <div className="px-3 py-1 type-overline text-gray-400">
                {t("CRM Calendars", "CRM Kalendáre", "CRM Naptárak")}
              </div>
              <div className="max-h-60 overflow-y-auto px-1.5 space-y-0.5">
                {visibleBuiltIns
                  .filter((b) => b.id !== "tasks")
                  .map((b) => {
                    const isFav = favorites.includes(b.id);
                    const isActive = activeLens === b.id;
                    return (
                      <div
                        key={b.id}
                        className={`flex items-center justify-between gap-1 rounded-md px-2 py-1.5 transition-colors ${
                          isActive ? "bg-entity-subtle text-entity-text font-semibold" : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectLens(b.id);
                            setMenuOpen(false);
                          }}
                          className="flex-1 text-left truncate cursor-pointer"
                        >
                          {b.label[lang] || b.label.en}
                        </button>
                        <button
                          type="button"
                          data-testid={`calendar-fav-toggle-${b.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(b.id);
                          }}
                          title={isFav ? t("Unpin from calendar bar", "Odopnúť z lišty", "Levétel a sávról") : t("Pin to calendar bar", "Pripnúť na lištu", "Kitűzés a sávra")}
                          className={`p-1 rounded hover:bg-gray-100 cursor-pointer ${
                            isFav ? "text-amber-500" : "text-gray-300 hover:text-amber-500"
                          }`}
                        >
                          <Star className={`h-3.5 w-3.5 ${isFav ? "fill-current" : ""}`} />
                        </button>
                      </div>
                    );
                  })}
              </div>

              <div className="my-1.5 border-t border-gray-100" />
              <div className="px-3 py-1 type-overline text-gray-400 flex items-center justify-between">
                <span>{t("Custom Calendars", "Vlastné kalendáre", "Egyéni naptárak")}</span>
              </div>
              <div className="max-h-48 overflow-y-auto px-1.5 space-y-0.5">
                {customCalendars.length === 0 ? (
                  <div className="px-2 py-1.5 text-caption text-gray-400">
                    {t("No custom calendars yet.", "Zatiaľ žiadne vlastné kalendáre.", "Még nincsenek egyéni naptárak.")}
                  </div>
                ) : (
                  customCalendars.map((cal) => {
                    const lensId = `custom:${cal.id}`;
                    const isFav = favorites.includes(lensId);
                    const isActive = activeLens === lensId;
                    return (
                      <div
                        key={cal.id}
                        className={`flex items-center justify-between gap-1 rounded-md px-2 py-1.5 transition-colors ${
                          isActive ? "bg-entity-subtle text-entity-text font-semibold" : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectLens(lensId);
                            setMenuOpen(false);
                          }}
                          className="flex-1 flex items-center gap-2 text-left min-w-0 cursor-pointer"
                        >
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                          <span className="truncate">{cal.name}</span>
                        </button>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {canEditCustom && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpen(false);
                                onEditCustomCalendar(cal);
                              }}
                              title={t("Edit calendar", "Upraviť kalendár", "Naptár szerkesztése")}
                              className="p-1 rounded text-gray-400 hover:text-entity-text hover:bg-gray-100 cursor-pointer"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            data-testid={`calendar-fav-toggle-${lensId}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleFavorite(lensId);
                            }}
                            title={isFav ? t("Unpin from calendar bar", "Odopnúť z lišty", "Levétel a sávról") : t("Pin to calendar bar", "Pripnúť na lištu", "Kitűzés a sávra")}
                            className={`p-1 rounded hover:bg-gray-100 cursor-pointer ${
                              isFav ? "text-amber-500" : "text-gray-300 hover:text-amber-500"
                            }`}
                          >
                            <Star className={`h-3.5 w-3.5 ${isFav ? "fill-current" : ""}`} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {canEditCustom && (
                <>
                  <div className="my-1.5 border-t border-gray-100" />
                  <div className="px-1.5">
                    <button
                      type="button"
                      data-testid="new-custom-calendar-btn"
                      onClick={() => {
                        setMenuOpen(false);
                        onNewCustomCalendar();
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-ui font-semibold text-entity-text hover:bg-entity-subtle transition-colors cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{t("New Custom Calendar", "Nový vlastný kalendár", "Új egyéni naptár")}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Expand full-width toggle */}
      <button
        type="button"
        data-testid="calendar-expand-btn"
        onClick={onToggleExpanded}
        title={
          expanded
            ? t("Return to split view", "Späť na rozdelené zobrazenie", "Vissza az osztott nézethez")
            : t("Expand calendar full width", "Rozšíriť kalendár na celú šírku", "Naptár teljes szélességre")
        }
        className="hidden ws-lg:inline-flex items-center justify-center h-7 w-7 rounded-md border border-gray-200 bg-white text-gray-500 hover:text-entity-text hover:border-entity-border transition-colors cursor-pointer shrink-0"
      >
        {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
};
