/**
 * The editing chrome drawn over the e-mail on the canvas: type chip (also the drag
 * handle), the small move/duplicate/delete bar, and drop lines. The canvas is the
 * e-mail, so it stays light in dark mode: these use fixed colours, not the app palette.
 */
import React from 'react';
import { ChevronDown, ChevronUp, Copy, GripVertical, Trash2 } from 'lucide-react';
import { useBuilder } from './builderContext.ts';

export const CHROME = {
  accent: '#4f46e5',
  accentSoft: '#a5b4fc',
  white: '#ffffff',
  ink: '#334155',
  line: '#cbd5e1',
  muted: '#64748b',
  danger: '#e11d48',
} as const;

export const Chip: React.FC<{
  label: string;
  selected: boolean;
  /** Names the hover group that shows the chip, e.g. 'block' or 'row'. */
  group: 'block' | 'row';
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  title: string;
}> = ({ label, selected, group, onDragStart, onDragEnd, title }) => (
  <span
    draggable
    title={title}
    onDragStart={onDragStart}
    onDragEnd={onDragEnd}
    className={`${group === 'block' ? 'group-hover/block:opacity-100' : 'group-hover/row:opacity-100'} absolute left-0 top-0 z-30 inline-flex -translate-y-full cursor-grab items-center gap-0.5 rounded-t-md px-1.5 py-0.5 text-caption font-semibold leading-none transition-opacity active:cursor-grabbing ${selected ? 'opacity-100' : 'opacity-0'}`}
    style={{ background: CHROME.accent, color: CHROME.white }}
  >
    <GripVertical className="h-3 w-3" />
    {label}
  </span>
);

const BarButton: React.FC<{ title: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }> = ({ title, onClick, disabled, danger, children }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    disabled={disabled}
    // Keep the focus where it is, so a text selection survives a click here.
    onMouseDown={(e) => e.preventDefault()}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md disabled:cursor-default disabled:opacity-30"
    style={{ color: danger ? CHROME.danger : CHROME.ink }}
  >
    {children}
  </button>
);

export const ActionBar: React.FC<{
  onUp: () => void;
  onDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canUp: boolean;
  canDown: boolean;
  /** Where to put the bar, relative to its parent. */
  className?: string;
}> = ({ onUp, onDown, onDuplicate, onDelete, canUp, canDown, className = 'right-0 top-0 -translate-y-full' }) => {
  const { t } = useBuilder();
  return (
    <div
      className={`absolute z-30 flex items-center rounded-t-md px-0.5 shadow-sm ${className}`}
      style={{ background: CHROME.white, border: `1px solid ${CHROME.line}` }}
      onClick={(e) => e.stopPropagation()}
    >
      <BarButton title={t('Move up', 'Posunúť vyššie', 'Feljebb')} onClick={onUp} disabled={!canUp}>
        <ChevronUp className="h-3.5 w-3.5" />
      </BarButton>
      <BarButton title={t('Move down', 'Posunúť nižšie', 'Lejjebb')} onClick={onDown} disabled={!canDown}>
        <ChevronDown className="h-3.5 w-3.5" />
      </BarButton>
      <BarButton title={t('Duplicate', 'Duplikovať', 'Másolás')} onClick={onDuplicate}>
        <Copy className="h-3.5 w-3.5" />
      </BarButton>
      <BarButton title={t('Delete', 'Zmazať', 'Törlés')} onClick={onDelete} danger>
        <Trash2 className="h-3.5 w-3.5" />
      </BarButton>
    </div>
  );
};

/** A line that shows where a drop will land. `edge` is the side of its parent it sits on. */
export const DropLine: React.FC<{ edge: 'top' | 'bottom' }> = ({ edge }) => (
  <span
    aria-hidden
    className={`pointer-events-none absolute inset-x-0 z-40 h-1 rounded-full ${edge === 'top' ? '-top-0.5' : '-bottom-0.5'}`}
    style={{ background: CHROME.accent }}
  />
);
