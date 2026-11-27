import React from "react";
import { Eye, Pin } from "lucide-react";
import { cn } from "../../utils/cn";
import type { NavMenuItem } from "../StartMenu";
import { Dots, Grip, HomeBadge, IconButton } from "./primitives";
import type { MenuEditStrings } from "./menuEditStrings";

/**
 * The two row kinds of the Start menu edit dialog (`.row` in Main.dc.html):
 * a module inside a group, and a module inside the Hidden modules card.
 *
 * Both are draggable. While dragged, the same element turns into the dashed
 * "original spot" placeholder: it must stay mounted, because the browser fires
 * `dragend` on the element the drag started on, and a removed node never gets it.
 */

const ROW_HOVER = "hover:bg-white hover:shadow-[0_1px_2px_rgb(15_23_42/0.08)]";
const PLACEHOLDER =
  "min-h-9 rounded-xl border border-dashed border-slate-300 flex items-center px-3 text-caption text-slate-500";

interface DragHandlers {
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver?: (e: React.DragEvent) => void;
}

interface EditRowProps extends DragHandlers {
  item: NavMenuItem;
  strings: MenuEditStrings;
  /** Second line under the label ("Vlastný panel" / "Vlastná tabuľka"). */
  meta?: string;
  isDefault: boolean;
  pinned: boolean;
  canPin: boolean;
  menuOpen: boolean;
  dragging: boolean;
  onTogglePin: () => void;
  onOpenMenu: (anchor: HTMLElement) => void;
  /** Alt+Arrow on the row or one of its buttons. */
  onKeyMove: (direction: -1 | 1) => void;
}

export const EditRow: React.FC<EditRowProps> = ({
  item,
  strings,
  meta,
  isDefault,
  pinned,
  canPin,
  menuOpen,
  dragging,
  onTogglePin,
  onOpenMenu,
  onKeyMove,
  onDragStart,
  onDragEnd,
  onDragOver,
}) => {
  const Icon = item.icon;
  return (
    <div
      data-row-id={item.id}
      draggable
      tabIndex={dragging ? -1 : 0}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onKeyDown={(e) => {
        if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
          e.preventDefault();
          e.stopPropagation();
          onKeyMove(e.key === "ArrowUp" ? -1 : 1);
        }
      }}
      className={cn(
        "flex items-center gap-2 min-h-9 pl-2 pr-1 py-1 rounded-xl outline-none transition-[background-color,box-shadow] duration-150",
        "focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-indigo-500/30",
        dragging
          ? PLACEHOLDER
          : cn(ROW_HOVER, menuOpen && "bg-white shadow-[0_1px_2px_rgb(15_23_42/0.08)]")
      )}
    >
      {dragging ? (
        strings.originalSlot(item.label)
      ) : (
        <>
          <Grip className="cursor-grab active:cursor-grabbing" />
          <Icon className="size-4 shrink-0" style={{ color: item.color }} />
          <span
            className={cn(
              "flex-1 min-w-0 text-ui font-medium leading-snug text-slate-800 break-words",
              isDefault && "flex items-center gap-2 flex-wrap"
            )}
          >
            {item.label}
            {isDefault && <HomeBadge label={strings.homeBadge} />}
            {meta && <small className="block text-caption font-normal text-slate-500">{meta}</small>}
          </span>
          {canPin && (
            <IconButton
              on={pinned}
              aria-pressed={pinned}
              aria-label={pinned ? strings.pinnedAria : strings.pinToSidebar}
              title={pinned ? strings.unpinFromSidebar : strings.pinToSidebar}
              onClick={onTogglePin}
            >
              <Pin className="size-4" aria-hidden="true" />
            </IconButton>
          )}
          <IconButton
            open={menuOpen}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={strings.itemActions(item.label)}
            onClick={(e) => onOpenMenu(e.currentTarget)}
          >
            <Dots />
          </IconButton>
        </>
      )}
    </div>
  );
};

interface HiddenRowProps extends DragHandlers {
  item: NavMenuItem;
  strings: MenuEditStrings;
  dragging: boolean;
  onShow: () => void;
}

export const HiddenRow: React.FC<HiddenRowProps> = ({ item, strings, dragging, onShow, onDragStart, onDragEnd }) => {
  const Icon = item.icon;
  return (
    <div
      data-row-id={item.id}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "flex items-center gap-2 min-h-9 pl-2 pr-1 py-1 rounded-xl",
        dragging ? PLACEHOLDER : "bg-slate-50 transition-colors duration-150 hover:bg-slate-100"
      )}
    >
      {dragging ? (
        strings.originalSlot(item.label)
      ) : (
        <>
          <Grip className="cursor-grab active:cursor-grabbing" />
          <Icon className="size-4 shrink-0" style={{ color: item.color }} />
          <span className="flex-1 min-w-0 text-ui font-medium leading-snug text-slate-800 break-words">
            {item.label}
          </span>
          <button
            type="button"
            onClick={onShow}
            className="h-7 px-2.5 rounded-xl border border-slate-200 bg-white text-ui font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer transition-[background-color,border-color,transform] duration-150 hover:bg-slate-50 hover:border-slate-300 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
          >
            <Eye className="size-4" aria-hidden="true" />
            {strings.show}
          </button>
        </>
      )}
    </div>
  );
};
