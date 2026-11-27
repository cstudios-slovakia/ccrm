import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Monitor, Smartphone, X, XCircle } from 'lucide-react';
import type { Language } from '../../../utils/translations';
import { makeT } from '../../../utils/timeTracking';
import type { RenderWarning } from './types.ts';
import { sampleMergeValues, substituteMergeTags } from './mergeTags.ts';
import { cn } from '../../../utils/cn';

export type EmailPreviewProps = {
  /** The `html` of renderEmail(). */
  html: string;
  warnings?: RenderWarning[];
  language: Language;
  /** Merge-tag values; tags without a value stay visible. Defaults to the C9 samples. */
  sampleMerge?: Record<string, string>;
  /** Desktop frame width (default 700). */
  desktopWidth?: number;
  defaultDevice?: 'desktop' | 'mobile';
  className?: string;
};

const warningText = (w: RenderWarning, language: Language): string => w.message[language] || w.message.en;

/** The real rendered e-mail in a sandboxed iframe, at desktop or phone width, with its warnings. */
export const EmailPreview: React.FC<EmailPreviewProps> = ({ html, warnings = [], language, sampleMerge, desktopWidth = 700, defaultDevice = 'desktop', className }) => {
  const t = makeT(language);
  const [device, setDevice] = useState<'desktop' | 'mobile'>(defaultDevice);
  const srcDoc = useMemo(
    () => substituteMergeTags(html, sampleMerge ?? sampleMergeValues(), { context: 'html', mode: 'preview' }),
    [html, sampleMerge],
  );
  const errors = warnings.filter((w) => w.level === 'error').length;

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
        <div role="group" aria-label={t('Preview width', 'Šírka náhľadu', 'Előnézet szélessége')} className="inline-flex overflow-hidden rounded-lg border border-slate-200">
          {(['desktop', 'mobile'] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={device === d}
              onClick={() => setDevice(d)}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-ui font-semibold transition-colors',
                device === d ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {d === 'desktop' ? <Monitor className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
              {d === 'desktop' ? t('Desktop', 'Počítač', 'Asztali') : t('Phone', 'Telefón', 'Telefon')}
            </button>
          ))}
        </div>
        {warnings.length > 0 && (
          <span className={cn('text-ui font-semibold', errors > 0 ? 'text-rose-600' : 'text-amber-600')}>
            {t(`${warnings.length} warning(s)`, `Upozornení: ${warnings.length}`, `Figyelmeztetések: ${warnings.length}`)}
          </span>
        )}
      </div>
      {/* Light on purpose: this is the e-mail, not the app. */}
      <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-slate-200 p-4">
        <iframe
          title={t('E-mail preview', 'Náhľad e-mailu', 'E-mail előnézet')}
          sandbox=""
          srcDoc={srcDoc}
          style={{ width: device === 'mobile' ? 375 : desktopWidth, maxWidth: '100%', border: 0, background: '#ffffff', flex: 'none' }}
        />
      </div>
      {warnings.length > 0 && (
        <ul className="max-h-40 shrink-0 space-y-1 overflow-y-auto border-t border-slate-200 px-3 py-2">
          {warnings.map((w, i) => (
            <li key={`${w.code}-${w.blockId ?? ''}-${i}`} className={cn('flex items-start gap-1.5 text-ui', w.level === 'error' ? 'text-rose-700' : 'text-amber-700')}>
              {w.level === 'error' ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span>{warningText(w, language)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** The same preview in a full-screen dialog. Escape and the backdrop close it. */
export const EmailPreviewModal: React.FC<EmailPreviewProps & { open: boolean; onClose: () => void; title?: string }> = ({ open, onClose, title, ...preview }) => {
  const t = makeT(preview.language);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[100010] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title ?? t('Preview', 'Náhľad', 'Előnézet')} className="flex h-full max-h-[56rem] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="type-card-title text-slate-800">{title ?? t('Preview', 'Náhľad', 'Előnézet')}</h3>
          <button type="button" onClick={onClose} aria-label={t('Close', 'Zavrieť', 'Bezárás')} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <EmailPreview {...preview} />
      </div>
    </div>,
    document.body,
  );
};
