import { useCallback } from "react";
import type { FavoriteItem, FavoriteEntityType } from "../types";
import { useUserPref } from "./userPrefs.ts";

/**
 * Calculates if a given hex color is dark, based on perceived luminance.
 */
export function isColorDark(colorStr?: string): boolean {
  if (!colorStr) return false;
  let hex = colorStr.replace("#", "").trim();
  if (hex.length === 3) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  if (hex.length !== 6) return false;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return false;
  // Perceived luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.65;
}

/**
 * Returns localized label for favorite entity types.
 */
export function getFavoriteTypeLabel(
  type: FavoriteEntityType,
  lang: "en" | "sk" | "hu" = "en"
): string {
  switch (type) {
    case "project":
      return lang === "sk" ? "Projekt" : lang === "hu" ? "Projekt" : "Project";
    case "client":
      return lang === "sk" ? "Klient" : lang === "hu" ? "Ügyfél" : "Client";
    case "lead":
      return lang === "sk" ? "Lead" : lang === "hu" ? "Érdeklődő" : "Lead";
    case "entry":
      return lang === "sk" ? "Entita" : lang === "hu" ? "Entitás" : "Entity";
    default:
      return type;
  }
}

/**
 * Default fallback colors per entity type if none is configured.
 */
export const DEFAULT_ENTITY_COLORS: Record<FavoriteEntityType, string> = {
  project: "#3b82f6", // Blue
  client: "#10b981",  // Emerald
  lead: "#f59e0b",    // Amber
  entry: "#8b5cf6",   // Violet
};

/**
 * Hook to manage favorites tied to the active user's preferences.
 */
export function useFavorites() {
  const [storedFavorites, setStoredFavorites] = useUserPref("favorites");
  const favorites: FavoriteItem[] = Array.isArray(storedFavorites) ? storedFavorites : [];

  const isFavorite = useCallback(
    (id: string): boolean => {
      if (!id) return false;
      return favorites.some((fav) => fav.id === id);
    },
    [favorites]
  );

  const toggleFavorite = useCallback(
    (item: Omit<FavoriteItem, "addedAt">) => {
      if (!item || !item.id) return;
      const exists = favorites.some((f) => f.id === item.id);
      if (exists) {
        setStoredFavorites(favorites.filter((f) => f.id !== item.id));
      } else {
        const newItem: FavoriteItem = {
          ...item,
          addedAt: new Date().toISOString(),
        };
        setStoredFavorites([newItem, ...favorites]);
      }
    },
    [favorites, setStoredFavorites]
  );

  const removeFavorite = useCallback(
    (id: string) => {
      if (!id) return;
      setStoredFavorites(favorites.filter((f) => f.id !== id));
    },
    [favorites, setStoredFavorites]
  );

  const addFavorite = useCallback(
    (item: Omit<FavoriteItem, "addedAt">) => {
      if (!item || !item.id) return;
      if (favorites.some((f) => f.id === item.id)) return;
      const newItem: FavoriteItem = {
        ...item,
        addedAt: new Date().toISOString(),
      };
      setStoredFavorites([newItem, ...favorites]);
    },
    [favorites, setStoredFavorites]
  );

  return {
    favorites,
    favoritesCount: favorites.length,
    isFavorite,
    toggleFavorite,
    removeFavorite,
    addFavorite,
  };
}
