import React, { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { Grip, MENU_EDIT_LAYER_ATTR } from "./primitives";

/**
 * The lifted card that follows the pointer while a module is dragged (the
 * "Presúvanie a pripnutie" artboard): white, indigo-200 border, large shadow,
 * an indigo grip, the module's icon and label, and a "+ Pripnúť" chip while it
 * hovers the sidebar and is not pinned there yet.
 *
 * HTML5 drag and drop paints a static snapshot as its drag image, which can
 * neither restyle nor change mid-drag. So the native image is replaced by a
 * transparent pixel and this card is drawn instead, positioned from the
 * document-level `dragover` events.
 *
 * One store for the whole app, because a drag starts in the Start menu dialog
 * and ends over the sidebar; <DragGhostLayer/> is mounted once (in Sidebar).
 *
 *   onDragStart={(e) => startDragGhost(e, { label, icon, color, pinned })}
 *   onDragEnd={endDragGhost}
 */
export interface DragGhostItem {
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color?: string;
  /** Already pinned in the sidebar: no "Pin" chip over the sidebar. */
  pinned?: boolean;
}

interface GhostState {
  item: DragGhostItem | null;
  x: number;
  y: number;
  overSidebar: boolean;
}

let state: GhostState = { item: null, x: 0, y: 0, overSidebar: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (next: Partial<GhostState>) => {
  state = { ...state, ...next };
  emit();
};

let transparentPixel: HTMLImageElement | null = null;
if (typeof Image !== "undefined") {
  transparentPixel = new Image();
  transparentPixel.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
}

export function startDragGhost(e: React.DragEvent, item: DragGhostItem): void {
  try {
    if (transparentPixel) e.dataTransfer.setDragImage(transparentPixel, 0, 0);
  } catch {
    /* some browsers refuse setDragImage outside dragstart; the native image is then shown */
  }
  set({ item, x: e.clientX, y: e.clientY, overSidebar: false });
}

export function endDragGhost(): void {
  if (state.item) set({ item: null, overSidebar: false });
}

export function isDragGhostActive(): boolean {
  return state.item !== null;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => state;

/** Mount once. Draws the ghost while a drag started with startDragGhost is in flight. */
export const DragGhostLayer: React.FC<{ pinLabel: string }> = ({ pinLabel }) => {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!s.item) return;
    const onOver = (e: DragEvent) => {
      // Some browsers report 0,0 on the last event before drop; ignore it.
      if (e.clientX === 0 && e.clientY === 0) return;
      const overSidebar = e.target instanceof Element && !!e.target.closest("[data-sidebar]");
      set({ x: e.clientX, y: e.clientY, overSidebar });
    };
    const onEnd = () => endDragGhost();
    document.addEventListener("dragover", onOver, true);
    document.addEventListener("drop", onEnd, true);
    document.addEventListener("dragend", onEnd, true);
    return () => {
      document.removeEventListener("dragover", onOver, true);
      document.removeEventListener("drop", onEnd, true);
      document.removeEventListener("dragend", onEnd, true);
    };
  }, [s.item]);

  if (!s.item) return null;
  const Icon = s.item.icon;
  const showPin = s.overSidebar && !s.item.pinned;

  return createPortal(
    <div
      {...{ [MENU_EDIT_LAYER_ATTR]: "" }}
      aria-hidden="true"
      className="view-size-fixed fixed z-[100070] pointer-events-none w-59 h-11 pl-2.5 pr-3 rounded-xl bg-white border border-indigo-200 flex items-center gap-2 cursor-grabbing shadow-[0_20px_25px_-5px_rgb(15_23_42/0.18),0_8px_10px_-6px_rgb(15_23_42/0.12)]"
      style={{ left: s.x - 16, top: s.y - 22 }}
    >
      <Grip active />
      <Icon className="size-4 shrink-0" style={{ color: s.item.color }} />
      <span className="flex-1 min-w-0 truncate text-ui font-medium text-slate-800">{s.item.label}</span>
      {showPin && (
        <span className="inline-flex items-center gap-1 h-5.5 px-2 rounded-full bg-indigo-50 text-indigo-700 text-micro font-semibold shrink-0">
          <Plus className="size-3" aria-hidden="true" />
          {pinLabel}
        </span>
      )}
    </div>,
    document.body
  );
};
