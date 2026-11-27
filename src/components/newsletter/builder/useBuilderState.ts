import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { BlockType, EmailDoc, RowLayout } from './types.ts';
import {
  changeRowLayout,
  duplicateBlock,
  duplicateRow,
  findBlock,
  findColumn,
  findRow,
  insertBlock,
  insertRow,
  insertRowWithBlock,
  moveBlock,
  moveBlockToNewRow,
  moveRow,
  removeBlock,
  removeRow,
  shiftBlock,
  shiftRow,
  updateBlock,
  updateColumn,
  updateRow,
} from './docOps.ts';
import { newBlock, newRow, newStarterRow, type StarterKind } from './defaults.ts';
import { canRedo, canUndo, createHistory, endCoalesce, pushHistory, redo, undo, type History } from './history.ts';
import type { DragInfo, DropTarget } from './dnd.ts';
import type { BuilderActions, Selection } from './builderContext.ts';
import type { TFn } from '../../../utils/timeTracking';
import { shouldRefocusRoot } from './focus.ts';

type Options = {
  doc: EmailDoc;
  onChange: (doc: EmailDoc) => void;
  t: TFn;
  lang: string;
  onUploadImage: (file: File) => Promise<string>;
  focusRoot: () => void;
};

const TOAST_MS = 6000;

/**
 * All the state of the builder: the controlled document with its undo history, the
 * selection, the text being edited, the running drag and the uploads. The actions are
 * stable (they read refs), so the canvas can hold them in a context without re-binding.
 */
export const useBuilderState = (opts: Options) => {
  const histRef = useRef<History<EmailDoc>>(createHistory(opts.doc));
  const lastPropRef = useRef(opts.doc);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  // The host replaced the document (it loaded another campaign): start a fresh history.
  // A document that is merely our own last change coming back (even re-created) is not that.
  if (opts.doc !== lastPropRef.current) {
    lastPropRef.current = opts.doc;
    const present = histRef.current.present;
    if (opts.doc !== present && JSON.stringify(opts.doc) !== JSON.stringify(present)) {
      histRef.current = createHistory(opts.doc);
    }
  }
  const doc = histRef.current.present;

  const optsRef = useRef(opts);
  optsRef.current = opts;

  const selRef = useRef<Selection | null>(null);
  const editRef = useRef<string | null>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const targetRef = useRef<DropTarget | null>(null);
  const [selection, setSelectionState] = useState<Selection | null>(null);
  const [editingId, setEditingState] = useState<string | null>(null);
  const [drag, setDragState] = useState<DragInfo | null>(null);
  const [target, setTargetState] = useState<DropTarget | null>(null);
  const [uploading, setUploading] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const setSel = (sel: Selection | null) => {
    selRef.current = sel;
    setSelectionState(sel);
  };
  const setEdit = (id: string | null) => {
    editRef.current = id;
    setEditingState(id);
  };

  const commit = useCallback((next: EmailDoc, coalesceKey?: string) => {
    const h = pushHistory(histRef.current, next, { coalesceKey });
    if (h === histRef.current) return;
    histRef.current = h;
    optsRef.current.onChange(next);
    rerender();
  }, []);

  const present = () => histRef.current.present;

  const act = useMemo<BuilderActions>(() => {
    const endSession = () => {
      histRef.current = endCoalesce(histRef.current);
    };
    const clearDrag = () => {
      dragRef.current = null;
      targetRef.current = null;
      setDragState(null);
      setTargetState(null);
    };
    const select = (sel: Selection | null) => {
      endSession();
      if (sel?.id !== editRef.current) setEdit(null);
      setSel(sel);
    };
    const selectAndMaybeEdit = (block: { id: string; type: BlockType }) => {
      setSel({ kind: 'block', id: block.id });
      setEdit(block.type === 'text' || block.type === 'heading' ? block.id : null);
    };

    /** Where "add" from the palette goes when the user clicks a tile instead of dragging. */
    const defaultColumn = (d: EmailDoc): { columnId: string; index: number } | null => {
      const sel = selRef.current;
      if (sel?.kind === 'block') {
        const loc = findBlock(d, sel.id);
        if (loc) return { columnId: loc.column.id, index: loc.blockIndex + 1 };
      }
      if (sel?.kind === 'row') {
        const found = findRow(d, sel.id);
        if (found) return { columnId: found.row.columns[0].id, index: found.row.columns[0].blocks.length };
      }
      const last = d.rows[d.rows.length - 1];
      return last ? { columnId: last.columns[0].id, index: last.columns[0].blocks.length } : null;
    };

    const drop = () => {
      const info = dragRef.current;
      const to = targetRef.current;
      clearDrag();
      if (!info || !to) return;
      const d = present();
      const { lang } = optsRef.current;
      if (info.kind === 'block-new') {
        const block = newBlock(info.type, lang);
        commit(to.kind === 'block' ? insertBlock(d, to.columnId, to.index, block) : insertRowWithBlock(d, block, to.index));
        selectAndMaybeEdit(block);
      } else if (info.kind === 'row-new') {
        if (to.kind !== 'row') return;
        const row = newRow(info.layout);
        commit(insertRow(d, row, to.index));
        setEdit(null);
        setSel({ kind: 'row', id: row.id });
      } else if (info.kind === 'block-move') {
        commit(to.kind === 'block' ? moveBlock(d, info.id, to.columnId, to.index) : moveBlockToNewRow(d, info.id, to.index));
      } else if (info.kind === 'row-move' && to.kind === 'row') {
        commit(moveRow(d, info.id, to.index));
      }
    };

    const flash = (message: string) => {
      window.clearTimeout(toastTimer.current);
      setToast({ id: Date.now(), message });
      toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
    };

    return {
      select,
      startEditing: (blockId) => {
        setSel({ kind: 'block', id: blockId });
        setEdit(blockId);
      },
      stopEditing: () => {
        endSession();
        setEdit(null);
      },
      beginDrag: (d) => {
        dragRef.current = d;
        targetRef.current = null;
        setDragState(d);
        setTargetState(null);
      },
      endDrag: clearDrag,
      setTarget: (to) => {
        targetRef.current = to;
        setTargetState(to);
      },
      drop,
      patchBlock: (id, patch, coalesceKey) => commit(updateBlock(present(), id, patch), coalesceKey),
      patchRow: (id, patch) => commit(updateRow(present(), id, patch)),
      patchColumn: (id, patch) => commit(updateColumn(present(), id, patch)),
      setLayout: (rowId, layout) => commit(changeRowLayout(present(), rowId, layout)),
      shiftBlock: (id, delta) => commit(shiftBlock(present(), id, delta)),
      duplicateBlock: (id) => {
        const r = duplicateBlock(present(), id);
        commit(r.doc);
        const copy = r.id ? findBlock(r.doc, r.id)?.block : undefined;
        if (copy) selectAndMaybeEdit({ id: copy.id, type: copy.type });
        setEdit(null);
      },
      removeBlock: (id) => {
        commit(removeBlock(present(), id));
        if (selRef.current?.id === id) setSel(null);
        if (editRef.current === id) setEdit(null);
      },
      shiftRow: (id, delta) => commit(shiftRow(present(), id, delta)),
      duplicateRow: (id) => {
        const r = duplicateRow(present(), id);
        commit(r.doc);
        if (r.id) setSel({ kind: 'row', id: r.id });
        setEdit(null);
      },
      removeRow: (id) => {
        commit(removeRow(present(), id));
        const sel = selRef.current;
        if (sel && !(sel.kind === 'row' ? findRow(present(), sel.id) : findBlock(present(), sel.id))) setSel(null);
        setEdit(null);
      },
      addBlock: (type) => {
        const d = present();
        const block = newBlock(type, optsRef.current.lang);
        const at = defaultColumn(d);
        commit(at && findColumn(d, at.columnId) ? insertBlock(d, at.columnId, at.index, block) : insertRowWithBlock(d, block, d.rows.length));
        selectAndMaybeEdit(block);
      },
      addRow: (layout: RowLayout) => {
        const d = present();
        const row = newRow(layout);
        const sel = selRef.current;
        let index = d.rows.length;
        if (sel?.kind === 'row') index = (findRow(d, sel.id)?.rowIndex ?? d.rows.length - 1) + 1;
        else if (sel?.kind === 'block') index = (findBlock(d, sel.id)?.rowIndex ?? d.rows.length - 1) + 1;
        commit(insertRow(d, row, index));
        setEdit(null);
        setSel({ kind: 'row', id: row.id });
      },
      addStarter: (kind: StarterKind) => {
        const row = newStarterRow(kind, optsRef.current.lang);
        commit(insertRow(present(), row, present().rows.length));
        setEdit(null);
        setSel({ kind: 'row', id: row.id });
      },
      uploadImage: async (blockId, file) => {
        const { t, onUploadImage } = optsRef.current;
        if (!file.type.startsWith('image/')) {
          flash(t('Choose an image file (PNG, JPG, GIF or WebP).', 'Vyberte obrázok (PNG, JPG, GIF alebo WebP).', 'Válasszon képfájlt (PNG, JPG, GIF vagy WebP).'));
          return;
        }
        setUploading((s) => new Set(s).add(blockId));
        try {
          const url = await onUploadImage(file);
          commit(updateBlock(present(), blockId, { src: url }));
        } catch (e) {
          const detail = e instanceof Error && e.message ? ` ${e.message}` : '';
          flash(`${t('The image could not be uploaded.', 'Obrázok sa nepodarilo nahrať.', 'A képet nem sikerült feltölteni.')}${detail}`);
        } finally {
          setUploading((s) => {
            const n = new Set(s);
            n.delete(blockId);
            return n;
          });
        }
      },
      reportError: flash,
      focusRoot: () => optsRef.current.focusRoot(),
    };
    // The actions only read refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit]);

  // Drop a selection whose block or row no longer exists (undo, a delete elsewhere).
  const selectionAlive =
    selection && (selection.kind === 'row' ? findRow(doc, selection.id) : findBlock(doc, selection.id));
  useEffect(() => {
    if (selection && !selectionAlive) {
      selRef.current = null;
      setSelectionState(null);
      if (editRef.current) {
        editRef.current = null;
        setEditingState(null);
      }
    }
  }, [selection, selectionAlive]);

  // Text editing ended (Escape, another block, a delete): the removed editor took the focus
  // with it, so the root takes it back and keeps getting Delete / Escape / Ctrl+Z. An input the
  // user clicked into (a panel field) holds the focus and is left alone.
  const isEditing = selectionAlive ? editingId !== null : false;
  const wasEditingRef = useRef(false);
  useEffect(() => {
    const was = wasEditingRef.current;
    wasEditingRef.current = isEditing;
    if (shouldRefocusRoot(was, isEditing, document.activeElement, document.body, document.documentElement)) {
      optsRef.current.focusRoot();
    }
  }, [isEditing]);

  const doUndo = useCallback(() => {
    if (!canUndo(histRef.current)) return;
    histRef.current = undo(histRef.current);
    optsRef.current.onChange(histRef.current.present);
    rerender();
  }, []);
  const doRedo = useCallback(() => {
    if (!canRedo(histRef.current)) return;
    histRef.current = redo(histRef.current);
    optsRef.current.onChange(histRef.current.present);
    rerender();
  }, []);

  return {
    doc,
    selection: selectionAlive ? selection : null,
    editingId: selectionAlive ? editingId : null,
    drag,
    target,
    uploading,
    toast,
    dismissToast: () => setToast(null),
    canUndo: canUndo(histRef.current),
    canRedo: canRedo(histRef.current),
    undo: doUndo,
    redo: doRedo,
    act,
  };
};
