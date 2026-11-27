import React, { useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { sanitizeRichHtml } from '../../../utils/safeHtml';
import type { EmailBlock, EmailColumn, EmailRow } from './types.ts';
import { useBuilder } from './builderContext.ts';
import { renderBlockHtml } from './renderBlocks.ts';
import { MIME_MOVE, hasFiles } from './dnd.ts';
import { blockLabel } from './labels.ts';
import { ActionBar, CHROME, Chip, DropLine } from './canvasChrome.tsx';
import { InlineTextEditor } from './InlineTextEditor.tsx';

const HtmlFrame: React.FC<{ html: string }> = ({ html }) => {
  const [height, setHeight] = useState(80);
  return (
    <iframe
      title="HTML"
      // No scripts. Same-origin is allowed only so the frame can be measured; without
      // allow-scripts nothing inside can run.
      sandbox="allow-same-origin"
      srcDoc={`<!doctype html><meta charset="utf-8"><base target="_blank"><body style="margin:0;font-family:Arial,Helvetica,sans-serif">${html}</body>`}
      style={{ width: '100%', height, border: 0, display: 'block', background: '#ffffff' }}
      onLoad={(e) => {
        try {
          const d = e.currentTarget.contentDocument;
          if (d) setHeight(Math.max(24, d.documentElement.scrollHeight));
        } catch {
          // Cross-origin frame: keep the default height.
        }
      }}
    />
  );
};

const Placeholder: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ padding: '8px 0' }}>
    <div
      className="flex flex-col items-center justify-center gap-2 text-ui"
      style={{ minHeight: 96, border: `2px dashed ${CHROME.line}`, background: '#f8fafc', color: CHROME.muted, fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      {children}
    </div>
  </div>
);

export const BlockView: React.FC<{
  block: EmailBlock;
  row: EmailRow;
  column: EmailColumn;
  index: number;
  count: number;
  innerWidth: number;
  readOnly?: boolean;
}> = ({ block, column, index, count, innerWidth, readOnly }) => {
  const { t, theme, assetBaseUrl, selection, editingId, target, uploading, act } = useBuilder();
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileOver, setFileOver] = useState(false);

  const selected = !readOnly && selection?.kind === 'block' && selection.id === block.id;
  const isText = block.type === 'text' || block.type === 'heading';
  const editing = selected && editingId === block.id && isText;
  const busy = uploading.has(block.id);

  const markup = useMemo(() => {
    if (block.type === 'html') return '';
    if (block.type === 'image' && !block.src.trim()) return '';
    // The renderer trusts text html; the canvas sanitises it again, as the doc may come from anywhere.
    const safe = block.type === 'text' || block.type === 'heading' ? { ...block, html: sanitizeRichHtml(block.html, 'newsletter') } : block;
    return renderBlockHtml(safe, { theme, assetBaseUrl, innerWidth });
  }, [block, theme, assetBaseUrl, innerWidth]);

  const isEmptyText = isText && !(block as { html: string }).html.replace(/<[^>]*>/g, '').trim();
  const lineTop = target?.kind === 'block' && target.columnId === column.id && target.index === index;
  const lineBottom = target?.kind === 'block' && target.columnId === column.id && index === count - 1 && target.index === count;

  const pickFile = (files: FileList | File[] | null | undefined) => {
    const file = files && files[0];
    if (file && block.type === 'image') void act.uploadImage(block.id, file);
  };

  let content: React.ReactNode;
  if (editing && isText) {
    content = <InlineTextEditor block={block as Extract<EmailBlock, { type: 'text' | 'heading' }>} onExit={act.stopEditing} />;
  } else if (block.type === 'html') {
    content = (
      <div className="relative">
        {block.html.trim() ? <HtmlFrame html={block.html} /> : <Placeholder>HTML</Placeholder>}
        <div className="absolute inset-0" />
      </div>
    );
  } else if (block.type === 'image' && !block.src.trim()) {
    content = (
      <Placeholder>
        <ImagePlus className="h-6 w-6" />
        <span>{t('Drop an image here', 'Sem presuňte obrázok', 'Húzza ide a képet')}</span>
        {!readOnly && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              act.select({ kind: 'block', id: block.id });
              fileRef.current?.click();
            }}
            className="cursor-pointer rounded-md px-3 py-1 text-ui font-semibold"
            style={{ background: CHROME.accent, color: CHROME.white }}
          >
            {t('Upload image', 'Nahrať obrázok', 'Kép feltöltése')}
          </button>
        )}
      </Placeholder>
    );
  } else if (isEmptyText) {
    content = (
      <div style={{ padding: '8px 0', color: '#94a3b8', fontFamily: 'Arial, Helvetica, sans-serif', fontStyle: 'italic' }}>
        {block.type === 'heading' ? t('Empty heading: click to write', 'Prázdny nadpis: kliknite a píšte', 'Üres címsor: kattintson az íráshoz') : t('Empty text: click to write', 'Prázdny text: kliknite a píšte', 'Üres szöveg: kattintson az íráshoz')}
      </div>
    );
  } else {
    content = <div dangerouslySetInnerHTML={{ __html: markup }} />;
  }

  return (
    <div
      ref={wrapRef}
      data-nl-block={block.id}
      className={`group/block relative ${readOnly ? '' : 'hover:outline hover:outline-[#a5b4fc]'}`}
      style={{ outlineOffset: '-1px', ...(selected ? { outline: `2px solid ${CHROME.accent}` } : null), ...(fileOver ? { background: '#eef2ff' } : null) }}
      onClick={(e) => {
        if (readOnly) return;
        e.stopPropagation();
        act.select({ kind: 'block', id: block.id });
        if (isText) act.startEditing(block.id);
      }}
      // Links inside the e-mail must not navigate the editor away.
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest?.('a')) e.preventDefault();
      }}
      onDragOver={(e) => {
        if (readOnly || block.type !== 'image' || !hasFiles(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        setFileOver(true);
      }}
      onDragLeave={() => setFileOver(false)}
      onDrop={(e) => {
        if (readOnly || block.type !== 'image' || !hasFiles(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        setFileOver(false);
        pickFile(e.dataTransfer.files);
      }}
    >
      {content}
      {busy && (
        <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.7)' }}>
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: CHROME.accent }} />
        </div>
      )}
      {lineTop && <DropLine edge="top" />}
      {lineBottom && <DropLine edge="bottom" />}
      {!readOnly && (
        <>
          {/* While typing, the text toolbar owns the top-left corner. */}
          {!editing && (
            <Chip
              label={blockLabel(t, block.type)}
              selected={selected}
              group="block"
              title={t('Drag to move', 'Presuňte na premiestnenie', 'Húzza az áthelyezéshez')}
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData(MIME_MOVE, `block:${block.id}`);
                e.dataTransfer.effectAllowed = 'move';
                if (wrapRef.current) e.dataTransfer.setDragImage(wrapRef.current, 12, 12);
                act.beginDrag({ kind: 'block-move', id: block.id });
              }}
              onDragEnd={act.endDrag}
            />
          )}
          {selected && (
            <ActionBar
              className={editing ? 'bottom-0 right-0 translate-y-full' : undefined}
              canUp={index > 0}
              canDown={index < count - 1}
              onUp={() => act.shiftBlock(block.id, -1)}
              onDown={() => act.shiftBlock(block.id, 1)}
              onDuplicate={() => act.duplicateBlock(block.id)}
              onDelete={() => act.removeBlock(block.id)}
            />
          )}
          {block.type === 'image' && (
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                pickFile(e.target.files);
                e.target.value = '';
              }}
            />
          )}
        </>
      )}
    </div>
  );
};
