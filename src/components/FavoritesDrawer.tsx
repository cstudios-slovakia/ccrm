import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
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
  isColorDark,
  getFavoriteTypeLabel,
  DEFAULT_ENTITY_COLORS,
} from "../utils/favorites";

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

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 pointer-events-auto">
      {/* Backdrop scrim */}
      <div
        className="fixed inset-0 top-[57px] sm:top-[65px] bg-slate-950/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Top Roll-Down Card / Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Favorites Drawer", "Panel obľúbených položiek", "Kedvencek panel")}
        className="fixed top-[57px] sm:top-[65px] left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-b border-slate-200/80 shadow-2xl animate-in slide-in-from-top-6 fade-in duration-300 max-h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Top Control Bar */}
        <div className="px-4 sm:px-8 py-4 border-b border-slate-200/60 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 bg-slate-50/70">
          {/* Title & Count */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center text-white shadow-md shadow-rose-500/20">
              <Heart className="h-5 w-5 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-heading font-extrabold text-slate-900 tracking-tight">
                  {t("Favorites", "Moje obľúbené", "Kedvenceim")}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-700">
                  {favorites.length}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-semibold">
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
              className={`px-3 py-1.5 rounded-xl text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
                selectedFilter === "all"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60"
              }`}
            >
              {t("All", "Všetko", "Összes")} ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter("project")}
              className={`px-3 py-1.5 rounded-xl text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                selectedFilter === "project"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60"
              }`}
            >
              <FolderKanban className="h-3.5 w-3.5" />
              {t("Projects", "Projekty", "Projektek")} ({counts.project})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter("client")}
              className={`px-3 py-1.5 rounded-xl text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                selectedFilter === "client"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60"
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              {t("Clients", "Klienti", "Ügyfelek")} ({counts.client})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter("lead")}
              className={`px-3 py-1.5 rounded-xl text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                selectedFilter === "lead"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60"
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              {t("Leads", "Leady", "Érdeklődők")} ({counts.lead})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter("entry")}
              className={`px-3 py-1.5 rounded-xl text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                selectedFilter === "entry"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60"
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
                className="w-full pl-8 pr-7 py-1.5 text-xs font-semibold rounded-xl bg-white border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
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
        <div className="p-4 sm:p-6 overflow-y-auto max-h-[60vh]">
          {filteredFavorites.length === 0 ? (
            <div className="py-12 px-4 text-center flex flex-col items-center justify-center">
              <div className="h-16 w-16 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-500 mb-3 animate-pulse">
                <Heart className="h-8 w-8" />
              </div>
              {favorites.length === 0 ? (
                <>
                  <h4 className="text-sm font-heading font-extrabold text-slate-800 uppercase tracking-wider">
                    {t("No favorites yet", "Zatiaľ žiadne obľúbené", "Még nincsenek kedvencek")}
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mt-1 leading-relaxed">
                    {t(
                      "Click the heart icon on any project, client, lead, or custom entity to pin it here for instant one-click access.",
                      "Kliknutím na ikonu srdca pri akomkoľvek projekte, klientovi, leade alebo entite si položku pripnete sem pre rýchly prístup.",
                      "Kattintson a szív ikonra bármely projekt, ügyfél, érdeklődő vagy entitás mellett a gyors eléréshez."
                    )}
                  </p>
                </>
              ) : (
                <>
                  <h4 className="text-sm font-heading font-extrabold text-slate-800 uppercase tracking-wider">
                    {t("No matches found", "Žiadna zhoda", "Nincs találat")}
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mt-1">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
              {filteredFavorites.map((item) => {
                const entityColor = item.color || DEFAULT_ENTITY_COLORS[item.type] || "#4f46e5";
                const dark = isColorDark(entityColor);
                const DefaultIcon = getEntityDefaultIcon(item.type);
                const CustomIcon = item.icon ? (Icons as any)[item.icon] : null;
                const IconComponent = CustomIcon || DefaultIcon;

                return (
                  <div
                    key={`${item.type}-${item.id}`}
                    onClick={() => handleCardClick(item.url)}
                    style={{ backgroundColor: entityColor }}
                    className={`group relative rounded-2xl p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between shadow-md hover:shadow-xl hover:-translate-y-1 active:scale-[0.98] border select-none overflow-hidden ${
                      dark
                        ? "text-white border-white/20 shadow-slate-900/20"
                        : "text-slate-900 border-black/10 shadow-slate-400/20"
                    }`}
                  >
                    {/* Top glass sheen & decorative circle */}
                    <div className="absolute -top-12 -right-12 w-28 h-28 rounded-full bg-white/10 blur-xl pointer-events-none" />

                    {/* Card Header: Type Badge + Icon + Remove Button */}
                    <div className="flex items-center justify-between gap-2 mb-3 relative z-10">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`p-1.5 rounded-xl backdrop-blur-md flex items-center justify-center shrink-0 ${
                            dark
                              ? "bg-white/20 text-white"
                              : "bg-black/10 text-slate-900"
                          }`}
                        >
                          <IconComponent className="h-4 w-4" />
                        </div>
                        <span
                          className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md truncate backdrop-blur-md ${
                            dark
                              ? "bg-black/25 text-white/90"
                              : "bg-white/40 text-slate-900"
                          }`}
                        >
                          {getFavoriteTypeLabel(item.type, systemLanguage)}
                        </span>
                      </div>

                      {/* Remove Favorite Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFavorite(item.id);
                        }}
                        className={`p-1.5 rounded-xl transition-all duration-200 cursor-pointer shrink-0 opacity-80 group-hover:opacity-100 hover:scale-110 active:scale-95 ${
                          dark
                            ? "bg-black/20 hover:bg-rose-600 text-white"
                            : "bg-white/40 hover:bg-rose-500 hover:text-white text-slate-800"
                        }`}
                        title={t("Remove from favorites", "Odstrániť z obľúbených", "Eltávolítás a kedvencek közül")}
                      >
                        <Heart className="h-3.5 w-3.5 fill-current" />
                      </button>
                    </div>

                    {/* Card Body: Title & Subtitle */}
                    <div className="mb-4 relative z-10 text-left">
                      <h4
                        className="font-heading font-extrabold text-sm leading-snug line-clamp-2 drop-shadow-xs"
                        title={item.title}
                      >
                        {item.title}
                      </h4>
                      {item.subtitle && (
                        <p
                          className={`text-[11px] font-medium mt-1 line-clamp-1 ${
                            dark ? "text-white/80" : "text-slate-700 font-semibold"
                          }`}
                          title={item.subtitle}
                        >
                          {item.subtitle}
                        </p>
                      )}
                    </div>

                    {/* Card Footer: Open link prompt */}
                    <div
                      className={`pt-2.5 border-t flex items-center justify-between text-[10px] font-bold uppercase tracking-wider relative z-10 ${
                        dark
                          ? "border-white/20 text-white/90"
                          : "border-black/10 text-slate-800"
                      }`}
                    >
                      <span className="flex items-center gap-1 group-hover:underline">
                        {t("Open", "Otvoriť", "Megnyitás")}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
