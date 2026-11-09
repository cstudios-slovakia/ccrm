/**
 * Drag and drop helpers for the builder. Native HTML5 drag and drop; the payload of a
 * drag cannot be read while it is over a target (only on drop), so the builder keeps the
 * `DragInfo` of the running drag in state and uses the MIME types only to start the drag
 * (Firefox needs data) and to tell our drags from file drags. Pure.
 */
import type { BlockType, RowLayout } from './types.ts';

export const MIME_BLOCK = 'application/x-nl-block';
export const MIME_ROW = 'application/x-nl-row';
export const MIME_MOVE = 'application/x-nl-move';

export type DragInfo =
  | { kind: 'block-new'; type: BlockType }
  | { kind: 'row-new'; layout: RowLayout }
  | { kind: 'block-move'; id: string }
  | { kind: 'row-move'; id: string };

export type DropTarget = { kind: 'block'; columnId: string; index: number } | { kind: 'row'; index: number };

export const isBlockDrag = (d: DragInfo | null): boolean => d?.kind === 'block-new' || d?.kind === 'block-move';
export const isRowDrag = (d: DragInfo | null): boolean => d?.kind === 'row-new' || d?.kind === 'row-move';

/** The drop index in a list whose items have vertical midpoints `mids`: before the first item whose midpoint is below `y`. */
export const indexFromMids = (mids: number[], y: number): number => {
  const i = mids.findIndex((m) => y < m);
  return i < 0 ? mids.length : i;
};

/** The row gap for a pointer over row number `rowIndex` (top half: before it, bottom half: after it). */
export const rowGapFromPointer = (rowIndex: number, top: number, height: number, y: number): number =>
  y < top + height / 2 ? rowIndex : rowIndex + 1;

export const sameTarget = (a: DropTarget | null, b: DropTarget | null): boolean => {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'row' && b.kind === 'row') return a.index === b.index;
  if (a.kind === 'block' && b.kind === 'block') return a.columnId === b.columnId && a.index === b.index;
  return false;
};

/** True when the drag carries files from the desktop (an image dropped on an image block). */
export const hasFiles = (dt: { types?: ArrayLike<string> } | null | undefined): boolean =>
  !!dt?.types && Array.prototype.includes.call(dt.types, 'Files');

/** The data to set on dragstart for a given drag. */
export const dragPayload = (d: DragInfo): { mime: string; value: string } => {
  switch (d.kind) {
    case 'block-new':
      return { mime: MIME_BLOCK, value: d.type };
    case 'row-new':
      return { mime: MIME_ROW, value: d.layout };
    case 'block-move':
      return { mime: MIME_MOVE, value: `block:${d.id}` };
    case 'row-move':
      return { mime: MIME_MOVE, value: `row:${d.id}` };
  }
};
