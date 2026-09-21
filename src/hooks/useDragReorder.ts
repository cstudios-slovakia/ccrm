import { useState, type DragEvent } from "react";
import type { DropPosition } from "../utils/reorder";

export interface DragReorderOptions {
  /** False turns every row into a plain one: nothing drags, nothing accepts a drop. */
  enabled: boolean;
  /**
   * Which half of the row under the pointer decides "before" or "after": the
   * top/bottom half for a vertical list, the left/right half for cards that
   * flow along a row.
   */
  axis?: "vertical" | "horizontal";
  /** Called once per drop that lands on a row, with the row it points at. */
  onMove: (dragId: string, targetId: string, position: DropPosition) => void;
}

/**
 * The native HTML5 drag-to-reorder every sortable list here uses. The dragged
 * row is held by id, and the drop marker by the row it points at plus which
 * edge of it, so the marker sits exactly where the row will land.
 *
 * Spread `rowProps(id)` onto each row and draw the marker from `dropAt(id)`.
 */
export function useDragReorder({ enabled, axis = "vertical", onMove }: DragReorderOptions) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition } | null>(null);

  const endDrag = () => {
    setDraggedId(null);
    setDropTarget(null);
  };

  const onDragStart = (e: DragEvent<HTMLElement>, id: string) => {
    if (!enabled) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    setDraggedId(id);
  };

  const onDragOver = (e: DragEvent<HTMLElement>, targetId: string) => {
    if (!draggedId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const after = axis === "horizontal"
      ? rect.width > 0 && e.clientX - rect.left > rect.width / 2
      : rect.height > 0 && e.clientY - rect.top > rect.height / 2;
    const position: DropPosition = after ? "after" : "before";
    if (dropTarget?.id !== targetId || dropTarget?.position !== position) {
      setDropTarget({ id: targetId, position });
    }
  };

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    const dragId = draggedId;
    const drop = dropTarget;
    endDrag();
    if (!enabled || !dragId || !drop || dragId === drop.id) return;
    onMove(dragId, drop.id, drop.position);
  };

  return {
    draggedId,
    /** Where the marker goes on this row while a drag hovers it, or null. */
    dropAt: (id: string): DropPosition | null =>
      draggedId && dropTarget?.id === id ? dropTarget.position : null,
    /** `draggable` false pins a row in place; `droppable` false also refuses drops onto it. */
    rowProps: (id: string, draggable = true, droppable = true) => ({
      draggable: enabled && draggable,
      onDragStart: (e: DragEvent<HTMLElement>) => (draggable ? onDragStart(e, id) : e.preventDefault()),
      onDragEnd: endDrag,
      onDragOver: (e: DragEvent<HTMLElement>) => { if (droppable) onDragOver(e, id); },
      onDrop,
    }),
  };
}
