import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Eye, Monitor, Redo2, Smartphone, Undo2, X } from 'lucide-react';
import type { Language } from '../../../utils/translations';
import { makeT } from '../../../utils/timeTracking';
import { cn } from '../../../utils/cn';
import type { EmailDoc, NewsletterTheme } from './types.ts';
import { findBlock, findRow } from './docOps.ts';
import { BuilderContext, type BuilderCtx, type Device } from './builderContext.ts';
import { useBuilderState } from './useBuilderState.ts';
import { renderEmail } from './renderEmail.ts';
import { sampleMergeValues } from './mergeTags.ts';
import { blockLabel } from './labels.ts';
import { Canvas } from './Canvas.tsx';
import { EmailPreview, EmailPreviewModal } from './EmailPreview.tsx';
import { Palette, type PaletteTab } from './panels/Palette.tsx';
import { BlockPanel } from './panels/BlockPanel.tsx';
import { RowPanel } from './panels/RowPanel.tsx';

export type EmailBuilderProps = {
  doc: EmailDoc;
  onChange: (doc: EmailDoc) => void;
  mode: 'body' | 'header' | 'footer';
  theme: NewsletterTheme;
  language: Language;
  /** Body mode: shown above the body, not editable. */
  lockedHeader?: EmailDoc | null;
  lockedFooter?: EmailDoc | null;
  onEditLocked?: (part: 'header' | 'footer') => void;
  /** Resolves to an absolute URL. */
  onUploadImage: (file: File) => Promise<string>;
  listImages?: () => Promise<{ url: string; name: string }[]>;
  /** Values shown in the preview (merge tags without a value stay visible). */
  sampleMerge: Record<string, string>;
  assetBaseUrl: string;
  /** The host's save status, Send test, ... */
  toolbarExtra?: React.ReactNode;
};

const usePhoneWidth = (): boolean => {
  const query = '(max-width: 767.98px)';
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
};

const ToolbarButton: React.FC<{ title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({ title, onClick, disabled, children }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    disabled={disabled}
    onClick={onClick}
    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent"
  >
    {children}
  </button>
);

export const EmailBuilder: React.FC<EmailBuilderProps> = ({
  doc: docProp,
  onChange,
  mode,
  theme,
  language,
  lockedHeader,
  lockedFooter,
  onEditLocked,
  onUploadImage,
  listImages,
  sampleMerge,
  assetBaseUrl,
  toolbarExtra,
}) => {
  const t = useMemo(() => makeT(language), [language]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [tab, setTab] = useState<PaletteTab>('blocks');
  const [previewOpen, setPreviewOpen] = useState(false);
  const phone = usePhoneWidth();

  const s = useBuilderState({
    doc: docProp,
    onChange,
    t,
    lang: language,
    onUploadImage,
    focusRoot: () => rootRef.current?.focus({ preventScroll: true }),
  });
  const { doc, selection, act } = s;

  const ctx = useMemo<BuilderCtx>(
    () => ({ doc, theme, language, t, device, assetBaseUrl, selection, editingId: s.editingId, drag: s.drag, target: s.target, uploading: s.uploading, act }),
    [doc, theme, language, t, device, assetBaseUrl, selection, s.editingId, s.drag, s.target, s.uploading, act],
  );

  // The real e-mail, for the preview (rendered only when somebody looks at it).
  const wantRender = previewOpen || phone;
  const rendered = useMemo(() => {
    if (!wantRender) return null;
    const result = renderEmail({
      header: mode === 'body' ? lockedHeader : null,
      body: doc,
      footer: mode === 'body' ? lockedFooter : null,
      theme,
      subject: '',
      assetBaseUrl,
      lang: language,
    });
    // A header or footer is part of an e-mail, not one: only the checks that make sense for it.
    const warnings = result.warnings.filter((w) => {
      if (mode === 'body') return true;
      if (w.code === 'empty_body') return false;
      if (w.code === 'missing_unsubscribe' && mode === 'header') return false;
      return true;
    });
    return { html: result.html, warnings };
  }, [wantRender, mode, lockedHeader, lockedFooter, doc, theme, assetBaseUrl, language]);

  const mergedSample = useMemo(() => ({ ...sampleMergeValues(), ...sampleMerge }), [sampleMerge]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const inField = target.matches?.('input, textarea, select') ?? false;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey) {
      const key = e.key.toLowerCase();
      // In a panel field the browser's own undo handles the field; everywhere else (the canvas,
      // the text being typed) this is the document's undo.
      if (key === 'z' && !inField) {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (key === 'y' && !inField) {
        e.preventDefault();
        s.redo();
        return;
      }
    }
    if (inField || target.isContentEditable) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection?.kind === 'block') {
      e.preventDefault();
      act.removeBlock(selection.id);
    } else if (e.key === 'Escape') {
      act.select(null);
    }
  };

  if (phone) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <p className="shrink-0 border-b border-slate-200 bg-amber-50 px-3 py-2.5 text-ui text-amber-800">
          {t('Edit the design on a larger screen.', 'Dizajn upravujte na väčšej obrazovke.', 'A dizájnt nagyobb képernyőn szerkessze.')}
        </p>
        {toolbarExtra && <div className="shrink-0 border-b border-slate-200 px-3 py-2">{toolbarExtra}</div>}
        {rendered && <EmailPreview html={rendered.html} warnings={rendered.warnings} language={language} sampleMerge={mergedSample} defaultDevice="mobile" />}
      </div>
    );
  }

  const selectedBlock = selection?.kind === 'block' ? findBlock(doc, selection.id)?.block : undefined;
  const selectedRow = selection?.kind === 'row' ? findRow(doc, selection.id)?.row : undefined;

  return (
    <BuilderContext.Provider value={ctx}>
      <div
        ref={rootRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative flex h-full min-h-[34rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white outline-none"
      >
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
          <ToolbarButton title={t('Undo (Ctrl+Z)', 'Späť (Ctrl+Z)', 'Visszavonás (Ctrl+Z)')} onClick={s.undo} disabled={!s.canUndo}>
            <Undo2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton title={t('Redo (Ctrl+Shift+Z)', 'Znova (Ctrl+Shift+Z)', 'Ismétlés (Ctrl+Shift+Z)')} onClick={s.redo} disabled={!s.canRedo}>
            <Redo2 className="h-4 w-4" />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <div role="group" aria-label={t('Canvas width', 'Šírka plátna', 'Vászon szélessége')} className="inline-flex overflow-hidden rounded-lg border border-slate-200">
            {(['desktop', 'mobile'] as const).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={device === d}
                title={d === 'desktop' ? t('Desktop', 'Počítač', 'Asztali') : t('Phone', 'Telefón', 'Telefon')}
                aria-label={d === 'desktop' ? t('Desktop', 'Počítač', 'Asztali') : t('Phone', 'Telefón', 'Telefon')}
                onClick={() => setDevice(d)}
                className={cn('flex h-8 w-9 cursor-pointer items-center justify-center transition-colors', device === d ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
              >
                {d === 'desktop' ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-ui font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Eye className="h-4 w-4" />
            {t('Preview', 'Náhľad', 'Előnézet')}
          </button>
          <div className="ml-auto flex items-center gap-2">{toolbarExtra}</div>
        </div>

        <div className="flex min-h-0 flex-1">
          <Canvas lockedHeader={mode === 'body' ? lockedHeader : null} lockedFooter={mode === 'body' ? lockedFooter : null} onEditLocked={onEditLocked} />
          <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
            {selectedBlock || selectedRow ? (
              <>
                <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => act.select(null)}
                    title={t('Back', 'Späť', 'Vissza')}
                    aria-label={t('Back', 'Späť', 'Vissza')}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <h3 className="type-card-title text-slate-800">
                    {selectedBlock ? blockLabel(t, selectedBlock.type) : t('Row', 'Riadok', 'Sor')}
                  </h3>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {selectedBlock ? <BlockPanel key={selectedBlock.id} block={selectedBlock} listImages={listImages} /> : selectedRow ? <RowPanel key={selectedRow.id} row={selectedRow} /> : null}
                </div>
              </>
            ) : (
              <Palette tab={tab} onTab={setTab} />
            )}
          </aside>
        </div>

        {s.toast && (
          <div
            role="alert"
            className="absolute bottom-4 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-start gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-ui font-medium text-white shadow-lg"
          >
            <span>{s.toast.message}</span>
            <button type="button" onClick={s.dismissToast} aria-label={t('Close', 'Zavrieť', 'Bezárás')} className="cursor-pointer text-white/80 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {rendered && (
          <EmailPreviewModal
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            html={rendered.html}
            warnings={rendered.warnings}
            language={language}
            sampleMerge={mergedSample}
          />
        )}
      </div>
    </BuilderContext.Provider>
  );
};
