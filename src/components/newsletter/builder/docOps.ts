/**
 * Pure, immutable operations on an EmailDoc. Nothing here mutates its input; an operation
 * that changes nothing returns the SAME document reference, so callers (the undo history)
 * can detect a no-op with `===`.
 *
 * Positions are "gaps": the insertion index in the list BEFORE the move. Moving item A
 * to gap g of the same list therefore ends at g-1 when g is after A's current index.
 */
import type { EmailBlock, EmailColumn, EmailDoc, EmailRow, RowLayout } from './types.ts';
import { LAYOUT_RATIOS, newColumn, newId, newRow } from './defaults.ts';

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

export type BlockLocation = {
  rowIndex: number;
  columnIndex: number;
  blockIndex: number;
  row: EmailRow;
  column: EmailColumn;
  block: EmailBlock;
};

export const findBlock = (doc: EmailDoc, blockId: string): BlockLocation | null => {
  for (let rowIndex = 0; rowIndex < doc.rows.length; rowIndex++) {
    const row = doc.rows[rowIndex];
    for (let columnIndex = 0; columnIndex < row.columns.length; columnIndex++) {
      const column = row.columns[columnIndex];
      const blockIndex = column.blocks.findIndex((b) => b.id === blockId);
      if (blockIndex >= 0) return { rowIndex, columnIndex, blockIndex, row, column, block: column.blocks[blockIndex] };
    }
  }
  return null;
};

export const findRow = (doc: EmailDoc, rowId: string): { row: EmailRow; rowIndex: number } | null => {
  const rowIndex = doc.rows.findIndex((r) => r.id === rowId);
  return rowIndex < 0 ? null : { row: doc.rows[rowIndex], rowIndex };
};

export const findColumn = (
  doc: EmailDoc,
  columnId: string,
): { row: EmailRow; rowIndex: number; column: EmailColumn; columnIndex: number } | null => {
  for (let rowIndex = 0; rowIndex < doc.rows.length; rowIndex++) {
    const row = doc.rows[rowIndex];
    const columnIndex = row.columns.findIndex((c) => c.id === columnId);
    if (columnIndex >= 0) return { row, rowIndex, column: row.columns[columnIndex], columnIndex };
  }
  return null;
};

export const allBlocks = (doc: EmailDoc): EmailBlock[] =>
  doc.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks));

export const blockCount = (doc: EmailDoc): number => allBlocks(doc).length;

const withRows = (doc: EmailDoc, rows: EmailRow[]): EmailDoc => ({ ...doc, rows });

const mapColumn = (doc: EmailDoc, columnId: string, fn: (c: EmailColumn) => EmailColumn): EmailDoc => {
  const found = findColumn(doc, columnId);
  if (!found) return doc;
  const next = fn(found.column);
  if (next === found.column) return doc;
  const rows = doc.rows.slice();
  rows[found.rowIndex] = { ...found.row, columns: found.row.columns.map((c, i) => (i === found.columnIndex ? next : c)) };
  return withRows(doc, rows);
};

const cloneBlock = (block: EmailBlock): EmailBlock => ({ ...structuredClone(block), id: newId() });

const cloneRow = (row: EmailRow): EmailRow => ({
  ...structuredClone(row),
  id: newId(),
  columns: row.columns.map((c) => ({ ...structuredClone(c), id: newId(), blocks: c.blocks.map(cloneBlock) })),
});

// ---- blocks ------------------------------------------------------------------------------

export const insertBlock = (doc: EmailDoc, columnId: string, index: number, block: EmailBlock): EmailDoc =>
  mapColumn(doc, columnId, (c) => {
    const at = clamp(index, 0, c.blocks.length);
    const blocks = c.blocks.slice();
    blocks.splice(at, 0, block);
    return { ...c, blocks };
  });

export const removeBlock = (doc: EmailDoc, blockId: string): EmailDoc => {
  const loc = findBlock(doc, blockId);
  if (!loc) return doc;
  return mapColumn(doc, loc.column.id, (c) => ({ ...c, blocks: c.blocks.filter((b) => b.id !== blockId) }));
};

/** Move a block into column `toColumnId` at `gap` (insertion index before the move). */
export const moveBlock = (doc: EmailDoc, blockId: string, toColumnId: string, gap: number): EmailDoc => {
  const loc = findBlock(doc, blockId);
  const target = findColumn(doc, toColumnId);
  if (!loc || !target) return doc;
  let index = clamp(gap, 0, target.column.blocks.length);
  if (loc.column.id === toColumnId) {
    if (index > loc.blockIndex) index -= 1;
    if (index === loc.blockIndex) return doc;
  }
  return insertBlock(removeBlock(doc, blockId), toColumnId, index, loc.block);
};

/** Move a block one place up (-1) or down (+1) inside its column. */
export const shiftBlock = (doc: EmailDoc, blockId: string, delta: -1 | 1): EmailDoc => {
  const loc = findBlock(doc, blockId);
  if (!loc) return doc;
  const to = loc.blockIndex + delta;
  if (to < 0 || to >= loc.column.blocks.length) return doc;
  return mapColumn(doc, loc.column.id, (c) => {
    const blocks = c.blocks.slice();
    [blocks[loc.blockIndex], blocks[to]] = [blocks[to], blocks[loc.blockIndex]];
    return { ...c, blocks };
  });
};

/** Duplicate a block right below the original; `id` is the copy's id. */
export const duplicateBlock = (doc: EmailDoc, blockId: string): { doc: EmailDoc; id: string | null } => {
  const loc = findBlock(doc, blockId);
  if (!loc) return { doc, id: null };
  const copy = cloneBlock(loc.block);
  return { doc: insertBlock(doc, loc.column.id, loc.blockIndex + 1, copy), id: copy.id };
};

/** Merge `patch` into a block. `id` and `type` cannot change; an `undefined` value removes the key. */
export const updateBlock = (doc: EmailDoc, blockId: string, patch: Record<string, unknown>): EmailDoc => {
  const loc = findBlock(doc, blockId);
  if (!loc) return doc;
  const next = { ...loc.block } as Record<string, unknown>;
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'id' || key === 'type') continue;
    if (value === undefined) {
      if (key in next) {
        delete next[key];
        changed = true;
      }
    } else if (next[key] !== value) {
      next[key] = value;
      changed = true;
    }
  }
  if (!changed) return doc;
  return mapColumn(doc, loc.column.id, (c) => ({
    ...c,
    blocks: c.blocks.map((b) => (b.id === blockId ? (next as EmailBlock) : b)),
  }));
};

// ---- rows --------------------------------------------------------------------------------

export const insertRow = (doc: EmailDoc, row: EmailRow, index: number): EmailDoc => {
  const rows = doc.rows.slice();
  rows.splice(clamp(index, 0, rows.length), 0, row);
  return withRows(doc, rows);
};

/** Insert a new single-column row holding `block` at row gap `gap`. */
export const insertRowWithBlock = (doc: EmailDoc, block: EmailBlock, gap: number): EmailDoc => {
  const row = newRow('1');
  row.columns[0] = { ...row.columns[0], blocks: [block] };
  return insertRow(doc, row, gap);
};

/** Take an existing block out of its column and put it in a new single-column row at `gap`. */
export const moveBlockToNewRow = (doc: EmailDoc, blockId: string, gap: number): EmailDoc => {
  const loc = findBlock(doc, blockId);
  if (!loc) return doc;
  return insertRowWithBlock(removeBlock(doc, blockId), loc.block, gap);
};

export const removeRow = (doc: EmailDoc, rowId: string): EmailDoc =>
  doc.rows.some((r) => r.id === rowId) ? withRows(doc, doc.rows.filter((r) => r.id !== rowId)) : doc;

/** Move a row to `gap` (insertion index before the move). */
export const moveRow = (doc: EmailDoc, rowId: string, gap: number): EmailDoc => {
  const found = findRow(doc, rowId);
  if (!found) return doc;
  let index = clamp(gap, 0, doc.rows.length);
  if (index > found.rowIndex) index -= 1;
  if (index === found.rowIndex) return doc;
  return insertRow(removeRow(doc, rowId), found.row, index);
};

export const shiftRow = (doc: EmailDoc, rowId: string, delta: -1 | 1): EmailDoc => {
  const found = findRow(doc, rowId);
  if (!found) return doc;
  const to = found.rowIndex + delta;
  if (to < 0 || to >= doc.rows.length) return doc;
  const rows = doc.rows.slice();
  [rows[found.rowIndex], rows[to]] = [rows[to], rows[found.rowIndex]];
  return withRows(doc, rows);
};

/** Duplicate a row right below the original (new ids all the way down); `id` is the copy's id. */
export const duplicateRow = (doc: EmailDoc, rowId: string): { doc: EmailDoc; id: string | null } => {
  const found = findRow(doc, rowId);
  if (!found) return { doc, id: null };
  const copy = cloneRow(found.row);
  return { doc: insertRow(doc, copy, found.rowIndex + 1), id: copy.id };
};

export type RowPatch = Partial<Omit<EmailRow, 'id' | 'columns' | 'layout'>>;

/** Merge `patch` into a row (an `undefined` value removes the key). */
export const updateRow = (doc: EmailDoc, rowId: string, patch: RowPatch): EmailDoc => {
  const found = findRow(doc, rowId);
  if (!found) return doc;
  const next = { ...found.row } as Record<string, unknown>;
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'id' || key === 'columns' || key === 'layout') continue;
    if (value === undefined) {
      if (key in next) {
        delete next[key];
        changed = true;
      }
    } else if (next[key] !== value) {
      next[key] = value;
      changed = true;
    }
  }
  if (!changed) return doc;
  const rows = doc.rows.slice();
  rows[found.rowIndex] = next as EmailRow;
  return withRows(doc, rows);
};

export type ColumnPatch = Partial<Omit<EmailColumn, 'id' | 'blocks'>>;

export const updateColumn = (doc: EmailDoc, columnId: string, patch: ColumnPatch): EmailDoc =>
  mapColumn(doc, columnId, (c) => {
    const next = { ...c } as Record<string, unknown>;
    let changed = false;
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'id' || key === 'blocks') continue;
      if (value === undefined) {
        if (key in next) {
          delete next[key];
          changed = true;
        }
      } else if (next[key] !== value) {
        next[key] = value;
        changed = true;
      }
    }
    return changed ? (next as EmailColumn) : c;
  });

/**
 * Change a row's layout, keeping its blocks. Columns keep their index (and their settings);
 * with fewer columns the blocks of the removed ones are appended to the last remaining one,
 * with more columns new empty ones are added on the right.
 */
export const changeRowLayout = (doc: EmailDoc, rowId: string, layout: RowLayout): EmailDoc => {
  const found = findRow(doc, rowId);
  if (!found || found.row.layout === layout) return doc;
  const want = LAYOUT_RATIOS[layout].length;
  const have = found.row.columns;
  let columns: EmailColumn[];
  if (want >= have.length) {
    columns = [...have, ...Array.from({ length: want - have.length }, newColumn)];
  } else {
    const kept = have.slice(0, want);
    const moved = have.slice(want).flatMap((c) => c.blocks);
    const last = kept[want - 1];
    kept[want - 1] = { ...last, blocks: [...last.blocks, ...moved] };
    columns = kept;
  }
  const rows = doc.rows.slice();
  rows[found.rowIndex] = { ...found.row, layout, columns };
  return withRows(doc, rows);
};
