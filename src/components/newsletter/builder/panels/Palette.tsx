import React from 'react';
import { Code2, Heading, Image as ImageIcon, MousePointerClick, MoveVertical, SeparatorHorizontal, Share2, Type } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import type { BlockType, RowLayout } from '../types.ts';
import { BLOCK_TYPES, LAYOUT_RATIOS, ROW_LAYOUTS } from '../defaults.ts';
import { dragPayload, type DragInfo } from '../dnd.ts';
import { useBuilder } from '../builderContext.ts';
import { blockLabel, layoutLabel } from '../labels.ts';

export type PaletteTab = 'blocks' | 'rows';

const ICONS: Record<BlockType, React.ComponentType<{ className?: string }>> = {
  text: Type,
  heading: Heading,
  image: ImageIcon,
  button: MousePointerClick,
  divider: SeparatorHorizontal,
  spacer: MoveVertical,
  social: Share2,
  html: Code2,
};

const Tile: React.FC<{ info: DragInfo; label: string; onAdd: () => void; children: React.ReactNode }> = ({ info, label, onAdd, children }) => {
  const { act } = useBuilder();
  return (
    // A div, not a <button>: Firefox does not start a drag from a button.
    <div
      role="button"
      tabIndex={0}
      draggable
      title={label}
      onClick={onAdd}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAdd();
        }
      }}
      onDragStart={(e) => {
        const { mime, value } = dragPayload(info);
        e.dataTransfer.setData(mime, value);
        e.dataTransfer.effectAllowed = 'copyMove';
        act.beginDrag(info);
      }}
      onDragEnd={act.endDrag}
      className="flex cursor-grab flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-3 text-ui font-semibold text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 active:cursor-grabbing"
    >
      {children}
      <span className="max-w-full truncate">{label}</span>
    </div>
  );
};

export const LayoutGlyph: React.FC<{ layout: RowLayout }> = ({ layout }) => (
  <span className="flex h-5 w-full max-w-16 items-stretch gap-0.5">
    {LAYOUT_RATIOS[layout].map((r, i) => (
      <span key={i} style={{ flex: r }} className="rounded-xs bg-slate-300" />
    ))}
  </span>
);

export const Palette: React.FC<{ tab: PaletteTab; onTab: (t: PaletteTab) => void }> = ({ tab, onTab }) => {
  const { t, act } = useBuilder();
  const tabs: { id: PaletteTab; label: string }[] = [
    { id: 'blocks', label: t('Blocks', 'Bloky', 'Blokkok') },
    { id: 'rows', label: t('Rows', 'Riadky', 'Sorok') },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" className="flex shrink-0 border-b border-slate-200">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => onTab(x.id)}
            className={cn(
              'flex-1 cursor-pointer border-b-2 px-3 py-2.5 text-ui font-semibold transition-colors',
              tab === x.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="mb-3 text-caption text-slate-400">
          {tab === 'blocks'
            ? t('Drag a block into a column, or click it to add it.', 'Presuňte blok do stĺpca alebo naň kliknite.', 'Húzza a blokkot egy oszlopba, vagy kattintson rá.')
            : t('Drag a row between the rows, or click it to add it.', 'Presuňte riadok medzi riadky alebo naň kliknite.', 'Húzza a sort a sorok közé, vagy kattintson rá.')}
        </p>
        {tab === 'blocks' ? (
          <div className="grid grid-cols-2 gap-2">
            {BLOCK_TYPES.map((type) => {
              const Icon = ICONS[type];
              return (
                <Tile key={type} info={{ kind: 'block-new', type }} label={blockLabel(t, type)} onAdd={() => act.addBlock(type)}>
                  <Icon className="h-5 w-5" />
                </Tile>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {ROW_LAYOUTS.map((layout) => (
              <Tile key={layout} info={{ kind: 'row-new', layout }} label={layoutLabel(t, layout)} onAdd={() => act.addRow(layout)}>
                <LayoutGlyph layout={layout} />
              </Tile>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
