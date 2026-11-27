import React from "react";
import { cn } from "../../utils/cn";
import { LIST_ICON_SPRITE_VERSION } from "../../utils/listIconCatalog.generated";
import { listIconFor, type ListIconKind } from "../../utils/listIcons";
import { useListIcons } from "../../utils/listIconStore";

const spriteHref = (id: string) => `${import.meta.env.BASE_URL}list-icons.svg?v=${LIST_ICON_SPRITE_VERSION}#${id}`;

/** One icon from the sprite, sized to the surrounding text (1.15em) unless `className` says otherwise. */
export const ListIconGlyph: React.FC<{ id: string; className?: string; title?: string }> = ({ id, className, title }) => (
  <svg
    className={cn("inline-block h-[1.15em] w-[1.15em] shrink-0 align-[-0.2em]", className)}
    role={title ? "img" : undefined}
    aria-hidden={title ? undefined : true}
    aria-label={title}
  >
    <use href={spriteHref(id)} />
  </svg>
);

/**
 * The icon chosen for a list item (Settings → lead sources, divisions, interest
 * categories, price-offer and income/expense categories), or `fallback` when it has none.
 * Drop it in front of the label wherever the label shows.
 */
export const ListIcon: React.FC<{
  kind: ListIconKind;
  /** The item's name (name lists) or id (category trees). */
  itemKey: string | null | undefined;
  className?: string;
  fallback?: React.ReactNode;
}> = ({ kind, itemKey, className, fallback = null }) => {
  const id = listIconFor(useListIcons(), kind, itemKey);
  return id ? <ListIconGlyph id={id} className={className} /> : <>{fallback}</>;
};
