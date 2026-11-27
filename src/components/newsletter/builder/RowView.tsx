import React, { useRef } from 'react';
import type { EmailColumn, EmailRow } from './types.ts';
import { LAYOUT_RATIOS } from './defaults.ts';
import { useBuilder } from './builderContext.ts';
import { MIME_MOVE, hasFiles, indexFromMids, isBlockDrag, isRowDrag, rowGapFromPointer, sameTarget, type DropTarget } from './dnd.ts';
import { columnPaddingX, columnWidths, reactStyle, rowContentBackground, rowPaddingBottom, rowPaddingTop, rowStacks } from './styles.ts';
import { ActionBar, CHROME, Chip, DropLine } from './canvasChrome.tsx';
import { BlockView } from './BlockView.tsx';

const JUSTIFY = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;

const ColumnView: React.FC<{
  row: EmailRow;
  column: EmailColumn;
  columnIndex: number;
  /** Column width in px in the current device mode. */
  width: number;
  stack: boolean;
  readOnly?: boolean;
}> = ({ row, column, columnIndex, width, stack, readOnly }) => {
  const { t, drag, target, act } = useBuilder();
  const ref = useRef<HTMLDivElement>(null);
  const padX = columnPaddingX(column);
  const over = target?.kind === 'block' && target.columnId === column.id;

  const aim = (e: React.DragEvent) => {
    if (readOnly || !isBlockDrag(drag)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = drag?.kind === 'block-new' ? 'copy' : 'move';
    const blocks = Array.from(ref.current?.querySelectorAll(':scope > [data-nl-block]') ?? []);
    const mids = blocks.map((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    const next: DropTarget = { kind: 'block', columnId: column.id, index: indexFromMids(mids, e.clientY) };
    if (!sameTarget(target, next)) act.setTarget(next);
  };

  return (
    <div
      ref={ref}
      data-nl-column={column.id}
      onDragOver={aim}
      onDrop={(e) => {
        if (readOnly || !isBlockDrag(drag)) return;
        e.preventDefault();
        e.stopPropagation();
        act.drop();
      }}
      style={{
        flex: stack ? 'none' : `${LAYOUT_RATIOS[row.layout][columnIndex] ?? 1} 1 0`,
        width: stack ? '100%' : undefined,
        minWidth: 0,
        padding: `0 ${padX}px`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: JUSTIFY[column.verticalAlign ?? 'top'],
      }}
    >
      {column.blocks.length === 0 ? (
        <div
          className="relative flex items-center justify-center text-ui"
          style={{
            minHeight: 64,
            margin: '8px 0',
            border: `2px dashed ${over ? CHROME.accent : CHROME.line}`,
            background: over ? '#eef2ff' : '#f8fafc',
            color: CHROME.muted,
            fontFamily: 'Arial, Helvetica, sans-serif',
          }}
        >
          {readOnly ? '' : t('Drop content here', 'Sem presuňte obsah', 'Húzza ide a tartalmat')}
        </div>
      ) : (
        column.blocks.map((block, i) => (
          <BlockView
            key={block.id}
            block={block}
            row={row}
            column={column}
            index={i}
            count={column.blocks.length}
            innerWidth={Math.max(1, width - 2 * padX)}
            readOnly={readOnly}
          />
        ))
      )}
    </div>
  );
};

export const RowView: React.FC<{ row: EmailRow; index: number; count: number; readOnly?: boolean }> = ({ row, index, count, readOnly }) => {
  const { t, theme, device, selection, drag, target, act } = useBuilder();
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = !readOnly && selection?.kind === 'row' && selection.id === row.id;
  const mobile = device === 'mobile';
  const width = mobile ? 375 : theme.contentWidth;
  const stack = mobile && rowStacks(row);
  const widths = stack ? row.columns.map(() => width) : columnWidths(row.layout, width);

  return (
    <div
      data-nl-row={row.id}
      className="group/row relative"
      style={{ background: row.background || undefined }}
      onClick={(e) => {
        if (readOnly) return;
        e.stopPropagation();
        act.select({ kind: 'row', id: row.id });
      }}
      onDragOver={(e) => {
        if (readOnly || !isRowDrag(drag) || hasFiles(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = drag?.kind === 'row-new' ? 'copy' : 'move';
        const r = e.currentTarget.getBoundingClientRect();
        const next: DropTarget = { kind: 'row', index: rowGapFromPointer(index, r.top, r.height, e.clientY) };
        if (!sameTarget(target, next)) act.setTarget(next);
      }}
      onDrop={(e) => {
        if (readOnly || !isRowDrag(drag)) return;
        e.preventDefault();
        e.stopPropagation();
        act.drop();
      }}
    >
      <div
        ref={wrapRef}
        className={`relative ${readOnly ? '' : 'hover:outline hover:outline-[#a5b4fc]'}`}
        style={{
          width,
          maxWidth: '100%',
          margin: '0 auto',
          paddingTop: rowPaddingTop(row),
          paddingBottom: rowPaddingBottom(row),
          background: rowContentBackground(row, theme),
          outlineOffset: '-1px',
          ...(selected ? { outline: `2px solid ${CHROME.accent}` } : null),
        }}
      >
        <div style={reactStyle({ display: 'flex', 'flex-direction': stack ? 'column' : 'row' })}>
          {row.columns.map((column, i) => (
            <ColumnView key={column.id} row={row} column={column} columnIndex={i} width={widths[i] ?? width} stack={stack} readOnly={readOnly} />
          ))}
        </div>
        {!readOnly && (
          <>
            <Chip
              label={t('Row', 'Riadok', 'Sor')}
              selected={selected}
              group="row"
              title={t('Drag to move', 'Presuňte na premiestnenie', 'Húzza az áthelyezéshez')}
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData(MIME_MOVE, `row:${row.id}`);
                e.dataTransfer.effectAllowed = 'move';
                if (wrapRef.current) e.dataTransfer.setDragImage(wrapRef.current, 12, 12);
                act.beginDrag({ kind: 'row-move', id: row.id });
              }}
              onDragEnd={act.endDrag}
            />
            {selected && (
              <ActionBar
                canUp={index > 0}
                canDown={index < count - 1}
                onUp={() => act.shiftRow(row.id, -1)}
                onDown={() => act.shiftRow(row.id, 1)}
                onDuplicate={() => act.duplicateRow(row.id)}
                onDelete={() => act.removeRow(row.id)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

/**
 * A drop zone between two rows (or above the first, below the last). It takes up no
 * space; while something is being dragged its hit area overlaps the neighbouring rows'
 * edges, and it shows the drop line when it is the target.
 */
export const RowGap: React.FC<{ index: number }> = ({ index }) => {
  const { drag, target, act } = useBuilder();
  const active = isBlockDrag(drag) || isRowDrag(drag);
  const here = target?.kind === 'row' && target.index === index;
  return (
    <div className="relative h-0" data-nl-gap={index}>
      {here && <DropLine edge="top" />}
      {active && (
        <div
          className="absolute inset-x-0 -top-2 z-30 h-4"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = drag?.kind === 'block-new' || drag?.kind === 'row-new' ? 'copy' : 'move';
            const next: DropTarget = { kind: 'row', index };
            if (!sameTarget(target, next)) act.setTarget(next);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            act.drop();
          }}
        />
      )}
    </div>
  );
};
