import { createContext, useContext } from 'react';
import type { BlockType, EmailDoc, NewsletterTheme, RowLayout } from './types.ts';
import type { ColumnPatch, RowPatch } from './docOps.ts';
import type { DragInfo, DropTarget } from './dnd.ts';
import type { StarterKind } from './defaults.ts';
import type { TFn } from '../../../utils/timeTracking';
import type { Language } from '../../../utils/translations';

export type Device = 'desktop' | 'mobile';
export type Selection = { kind: 'block' | 'row'; id: string };

export type BuilderActions = {
  select: (sel: Selection | null) => void;
  startEditing: (blockId: string) => void;
  stopEditing: () => void;
  beginDrag: (d: DragInfo) => void;
  endDrag: () => void;
  setTarget: (t: DropTarget | null) => void;
  drop: () => void;
  patchBlock: (id: string, patch: Record<string, unknown>, coalesceKey?: string) => void;
  patchRow: (id: string, patch: RowPatch) => void;
  patchColumn: (id: string, patch: ColumnPatch) => void;
  setLayout: (rowId: string, layout: RowLayout) => void;
  shiftBlock: (id: string, delta: -1 | 1) => void;
  duplicateBlock: (id: string) => void;
  removeBlock: (id: string) => void;
  shiftRow: (id: string, delta: -1 | 1) => void;
  duplicateRow: (id: string) => void;
  removeRow: (id: string) => void;
  addBlock: (type: BlockType) => void;
  addRow: (layout: RowLayout) => void;
  addStarter: (kind: StarterKind) => void;
  uploadImage: (blockId: string, file: File) => Promise<void>;
  reportError: (message: string) => void;
  focusRoot: () => void;
};

export type BuilderCtx = {
  doc: EmailDoc;
  theme: NewsletterTheme;
  language: Language;
  t: TFn;
  device: Device;
  assetBaseUrl: string;
  selection: Selection | null;
  editingId: string | null;
  drag: DragInfo | null;
  target: DropTarget | null;
  uploading: ReadonlySet<string>;
  act: BuilderActions;
};

export const BuilderContext = createContext<BuilderCtx | null>(null);

export const useBuilder = (): BuilderCtx => {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error('useBuilder must be used inside <EmailBuilder>');
  return ctx;
};
