import React from "react";
import { Heart } from "lucide-react";
import type { FavoriteEntityType } from "../../types";
import { useFavorites } from "../../utils/favorites";

export interface FavoriteHeartButtonProps {
  entityId: string;
  type: FavoriteEntityType;
  title: string;
  subtitle?: string;
  color?: string;
  icon?: string;
  url: string;
  parentId?: string;
  size?: "xs" | "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
  systemLanguage?: "en" | "sk" | "hu";
}

export const FavoriteHeartButton: React.FC<FavoriteHeartButtonProps> = ({
  entityId,
  type,
  title,
  subtitle,
  color,
  icon,
  url,
  parentId,
  size = "md",
  showLabel = false,
  className = "",
  systemLanguage = "en",
}) => {
  const { isFavorite, toggleFavorite } = useFavorites();
  const isFav = isFavorite(entityId);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    toggleFavorite({
      id: entityId,
      type,
      title,
      subtitle,
      color,
      icon,
      url,
      parentId,
    });
  };

  const getTooltip = () => {
    if (isFav) {
      return systemLanguage === "sk"
        ? "Odstrániť z obľúbených"
        : systemLanguage === "hu"
        ? "Eltávolítás a kedvencek közül"
        : "Remove from favorites";
    }
    return systemLanguage === "sk"
      ? "Pridať do obľúbených"
      : systemLanguage === "hu"
      ? "Hozzáadás a kedvencekhez"
      : "Add to favorites";
  };

  const iconSizes = {
    xs: "h-3 w-3",
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  const buttonPaddings = {
    xs: "p-1",
    sm: "p-1.5",
    md: "p-2",
    lg: "p-2.5",
  };

  return (
    <button
      type="button"
      data-no-modal="true"
      aria-haspopup="false"
      onClick={handleClick}
      title={getTooltip()}
      aria-label={getTooltip()}
      aria-pressed={isFav}
      className={`inline-flex items-center gap-1.5 rounded-xl transition-all duration-200 cursor-pointer select-none active:scale-90 ${
        isFav
          ? "text-rose-500 hover:text-rose-600 bg-rose-50/70 hover:bg-rose-100/80 border border-rose-200/80 shadow-xs"
          : "text-slate-400 hover:text-rose-500 hover:bg-rose-50/50 border border-transparent hover:border-rose-200/50"
      } ${buttonPaddings[size]} ${className}`}
    >
      <Heart
        className={`${iconSizes[size]} transition-transform duration-200 ${
          isFav ? "fill-rose-500 scale-105" : "hover:scale-110"
        }`}
      />
      {showLabel && (
        <span className="text-ui font-bold font-heading">
          {isFav
            ? systemLanguage === "sk"
              ? "Obľúbené"
              : systemLanguage === "hu"
              ? "Kedvenc"
              : "Favorited"
            : systemLanguage === "sk"
            ? "Do obľúbených"
            : systemLanguage === "hu"
            ? "Kedvencekbe"
            : "Favorite"}
        </span>
      )}
    </button>
  );
};
