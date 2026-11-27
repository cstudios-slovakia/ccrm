import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Heart,
  X,
  Search,
  ChevronRight,
  FolderKanban,
  Building2,
  UserCheck,
  FileBox,
} from "lucide-react";
import * as Icons from "lucide-react";
import type { FavoriteEntityType } from "../types";
import {
  useFavorites,
  getFavoriteTypeLabel,
  DEFAULT_ENTITY_COLORS,
} from "../utils/favorites";
import { entityAccentStyle } from "../utils/entityAccent";
import { EntityBadge } from "./tremor/EntityBadge";

interface FavoritesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  systemLanguage?: "en" | "sk" | "hu";
}

export const FavoritesDrawer: React.FC<FavoritesDrawerProps> = ({
  isOpen,
  onClose,
  systemLanguage = "en",
}) => {
  const { favorites, removeFavorite } = useFavorites();
  const [selectedFilter, setSelectedFilter] = useState<"all" | FavoriteEntityType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Focus search input when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setSearchQuery("");
      setSelectedFilter("all");
    }
  }, [isOpen]);

  // Filtered favorites
  const filteredFavorites = useMemo(() => {
    return favorites.filter((fav) => {
      if (selectedFilter !== "all" && fav.type !== selectedFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = fav.title?.toLowerCase().includes(q);
        const matchesSubtitle = fav.subtitle?.toLowerCase().includes(q);
        return matchesTitle || matchesSubtitle;
      }
      return true;
    });
  }, [favorites, selectedFilter, searchQuery]);

  // Counts by type
  const counts = useMemo(() => {
    const c: Record<"all" | FavoriteEntityType, number> = {
      all: favorites.length,
      project: 0,
      client: 0,
      lead: 0,
      entry: 0,
    };
    favorites.forEach((f) => {
      if (c[f.type] !== undefined) {
        c[f.type]++;
      }
    });
    return c;
  }, [favorites]);

  const handleCardClick = (url: string) => {
    onClose();
    if (url.startsWith("#")) {
      window.location.hash = url.substring(1);
    } else {
      window.location.href = url;
    }
  };

  const getEntityDefaultIcon = (type: FavoriteEntityType) => {
    switch (type) {
      case "project":
        return FolderKanban;
      case "client":
        return Building2;
      case "lead":
        return UserCheck;
      case "entry":
        return FileBox;
      default:
        return FileBox;
    }
  };

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="favorites-drawer-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-50 pointer-events-none"
        >
          {/* Backdrop scrim */}
          <div
            className="fixed inset-0 top-14.25 sm:top-16.25 bg-slate-950/60 backdrop-blur-xs pointer-events-auto"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Top Roll-Down Card / Drawer with rounded corners and margins */}
          <motion.div
            key="favorites-card"
            role="dialog"
            aria-modal="true"
            aria-label={t("Favorites Drawer", "Panel obľúbených položiek", "Kedvencek panel")}
            initial={{ opacity: 0, y: -120, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -120, scale: 0.98 }}
            transition={{
              type: "spring",
              damping: 28,
              stiffness: 300,
              mass: 0.8,
            }}
            className="fixed top-15.5 sm:top-18 inset-x-3 sm:inset-x-6 lg:inset-x-8 max-w-(--drawer-xl) mx-auto z-50 rounded-lg bg-white border border-gray-200 shadow-2xl flex flex-col overflow-hidden max-h-[calc(100vh-85px)] sm:max-h-[calc(100vh-100px)] pointer-events-auto"
          >
        {/* Top Control Bar */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-3.5 shrink-0 bg-gray-50/90">
          {/* Title & Count */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="h-9 w-9 rounded-md bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-2xs">
              <Heart className="h-4.5 w-4.5 fill-rose-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-title-sm font-heading font-bold text-gray-900 tracking-tight">
                  {t("Favorites", "Moje obľúbené", "Kedvenceim")}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-caption font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                  {favorites.length}
                </span>
              </div>
              <p className="text-caption text-gray-500 font-medium">
                {t(
                  "Quick access to your pinned entities",
                  "Rýchly prístup k pripnutým položkám",
                  "Gyors hozzáférés a rögzített elemekhez"
                )}
              </p>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none select-none">
            <button
              type="button"
              onClick={() => setSelectedFilter("all")}
              className={`px-3 py-1.5 rounded-md text-ui font-semibold transition-all cursor-pointer shrink-0 border ${
                selectedFilter === "all"
                  ? "bg-gray-900 border-gray-900 text-white shadow-2xs"
                  : "bg-white text-gray-600 hover:bg-gray-50 border-gray-300"
              }`}
            >
              {t("All", "Všetko", "Összes")} ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter("project")}
              style={entityAccentStyle("project") as React.CSSProperties}
              className={`px-3 py-1.5 rounded-md text-ui font-semibold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 border ${
                selectedFilter === "project"
                  ? "bg-entity-solid border-transparent text-white shadow-2xs"
                  : "bg-white text-gray-600 hover:bg-entity-subtle hover:text-entity-text border-gray-300"
              }`}
            >
              <FolderKanban className="h-3.5 w-3.5" />
              {t("Projects", "Projekty", "Projektek")} ({counts.project})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter("client")}
              style={entityAccentStyle("client") as React.CSSProperties}
              className={`px-3 py-1.5 rounded-md text-ui font-semibold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 border ${
                selectedFilter === "client"
                  ? "bg-entity-solid border-transparent text-white shadow-2xs"
                  : "bg-white text-gray-600 hover:bg-entity-subtle hover:text-entity-text border-gray-300"
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              {t("Clients", "Klienti", "Ügyfelek")} ({counts.client})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter("lead")}
              style={entityAccentStyle("lead") as React.CSSProperties}
              className={`px-3 py-1.5 rounded-md text-ui font-semibold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 border ${
                selectedFilter === "lead"
                  ? "bg-entity-solid border-transparent text-white shadow-2xs"
                  : "bg-white text-gray-600 hover:bg-entity-subtle hover:text-entity-text border-gray-300"
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              {t("Leads", "Leady", "Érdeklődők")} ({counts.lead})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter("entry")}
              style={entityAccentStyle("unified_entry") as React.CSSProperties}
              className={`px-3 py-1.5 rounded-md text-ui font-semibold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 border ${
                selectedFilter === "entry"
                  ? "bg-entity-solid border-transparent text-white shadow-2xs"
                  : "bg-white text-gray-600 hover:bg-entity-subtle hover:text-entity-text border-gray-300"
              }`}
            >
              <FileBox className="h-3.5 w-3.5" />
              {t("Entities", "Entity", "Entitások")} ({counts.entry})
            </button>
          </div>

          {/* Search & Close */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative w-full sm:w-56">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("Filter favorites...", "Filtrovať...", "Keresés...")}
                className="w-full pl-8 pr-7 py-1.5 text-ui font-semibold rounded-xl bg-white border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="h-8.5 w-8.5 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title={t("Close", "Zavrieť", "Bezárás")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content Body / Cards Grid */}
        <div className="p-3.5 sm:p-5 overflow-y-auto max-h-[65vh]">
          {filteredFavorites.length === 0 ? (
            <div className="py-12 px-4 text-center flex flex-col items-center justify-center">
              <div className="h-16 w-16 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-500 mb-3 animate-pulse">
                <Heart className="h-8 w-8" />
              </div>
              {favorites.length === 0 ? (
                <>
                  <h4 className="text-body font-heading font-extrabold text-slate-800">
                    {t("No favorites yet", "Zatiaľ žiadne obľúbené", "Még nincsenek kedvencek")}
                  </h4>
                  <p className="text-ui text-slate-400 max-w-sm mt-1 leading-relaxed">
                    {t(
                      "Click the heart icon on any project, client, lead, or custom entity to pin it here for instant one-click access.",
                      "Kliknutím na ikonu srdca pri akomkoľvek projekte, klientovi, leade alebo entite si položku pripnete sem pre rýchly prístup.",
                      "Kattintson a szív ikonra bármely projekt, ügyfél, érdeklődő vagy entitás mellett a gyors eléréshez."
                    )}
                  </p>
                </>
              ) : (
                <>
                  <h4 className="text-body font-heading font-extrabold text-slate-800">
                    {t("No matches found", "Žiadna zhoda", "Nincs találat")}
                  </h4>
                  <p className="text-ui text-slate-400 max-w-sm mt-1">
                    {t(
                      'No favorite items matched your search query or filter.',
                      'Žiadne obľúbené položky nezodpovedajú vášmu vyhľadávaniu.',
                      'Egyetlen kedvenc elem sem felel meg a keresési feltételnek.'
                    )}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2.5">
              {filteredFavorites.map((item) => {
                const entityColor = item.color || DEFAULT_ENTITY_COLORS[item.type] || "#4f46e5";
                const entityRefKey = item.type === "entry" ? "unified_entry" : item.type;
                const DefaultIcon = getEntityDefaultIcon(item.type);
                const CustomIcon = item.icon ? (Icons as any)[item.icon] : null;
                const IconComponent = CustomIcon || DefaultIcon;

                return (
                  <div
                    key={`${item.type}-${item.id}`}
                    onClick={() => handleCardClick(item.url)}
                    style={{
                      ...(entityAccentStyle(entityRefKey, item.color || entityColor) as React.CSSProperties),
                      borderTopColor: "var(--entity-accent-solid)",
                    }}
                    className="group relative rounded-lg p-3 transition-all duration-150 cursor-pointer flex flex-col justify-between bg-white border border-gray-200 border-t-2 shadow-xs hover:shadow-md hover:border-entity-border active:scale-[0.98] select-none overflow-hidden"
                  >
                    {/* Card Header: Type Badge + Icon + Remove Button */}
                    <div className="flex items-center justify-between gap-1.5 mb-2.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="p-1.5 rounded-md bg-entity-subtle text-entity-text border border-entity-border flex items-center justify-center shrink-0">
                          <IconComponent className="h-3.5 w-3.5" />
                        </div>
                        <EntityBadge
                          entity={entityRefKey}
                          color={item.color}
                          label={getFavoriteTypeLabel(item.type, systemLanguage)}
                          showIcon={false}
                          size="sm"
                        />
                      </div>

                      {/* Remove Favorite Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFavorite(item.id);
                        }}
                        className="p-1 rounded-md bg-gray-100 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer shrink-0 opacity-80 group-hover:opacity-100"
                        title={t("Remove from favorites", "Odstrániť z obľúbených", "Eltávolítás a kedvencek közül")}
                      >
                        <Heart className="h-3 w-3 fill-current" />
                      </button>
                    </div>

                    {/* Card Body: Title & Subtitle */}
                    <div className="mb-2.5 text-left">
                      <h4
                        className="font-heading font-bold text-ui text-gray-900 leading-snug line-clamp-2"
                        title={item.title}
                      >
                        {item.title}
                      </h4>
                      {item.subtitle && (
                        <p
                          className="text-micro text-gray-500 font-medium mt-0.5 line-clamp-1"
                          title={item.subtitle}
                        >
                          {item.subtitle}
                        </p>
                      )}
                    </div>

                    {/* Card Footer: Open link prompt */}
                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between type-overline text-entity-text">
                      <span className="flex items-center gap-1 group-hover:underline">
                        {t("Open", "Otvoriť", "Megnyitás")}
                      </span>
                      <ChevronRight className="h-3 w-3 transform group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>,
document.body
);
};
