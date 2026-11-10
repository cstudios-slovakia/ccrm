import React from 'react';
import { Lock } from 'lucide-react';
import type { EmailDoc } from './types.ts';
import type { StarterKind } from './defaults.ts';
import { useBuilder } from './builderContext.ts';
import { hasFiles, isBlockDrag, isRowDrag, sameTarget } from './dnd.ts';
import { CHROME } from './canvasChrome.tsx';
import { RowGap, RowView } from './RowView.tsx';

const LockedPart: React.FC<{ doc: EmailDoc; part: 'header' | 'footer'; onEdit?: (part: 'header' | 'footer') => void }> = ({ doc, part, onEdit }) => {
  const { t } = useBuilder();
  const label =
    part === 'header'
      ? t('Global header: edit in Settings › Newsletter', 'Globálna hlavička: upravte v Nastavenia › Newsletter', 'Globális fejléc: szerkesztés a Beállítások › Hírlevél alatt')
      : t('Global footer: edit in Settings › Newsletter', 'Globálna pätička: upravte v Nastavenia › Newsletter', 'Globális lábléc: szerkesztés a Beállítások › Hírlevél alatt');
  return (
    <div>
      <div className="flex items-center justify-center gap-2 py-1.5 text-caption" style={{ background: '#e2e8f0', color: CHROME.muted, fontFamily: 'Arial, Helvetica, sans-serif' }}>
        <Lock className="h-3 w-3" />
        <span>{label}</span>
        {onEdit && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(part); }} className="cursor-pointer font-semibold underline" style={{ color: CHROME.accent }}>
            {t('Edit', 'Upraviť', 'Szerkesztés')}
          </button>
        )}
      </div>
      <div className="pointer-events-none select-none" style={{ opacity: 0.55 }} aria-hidden>
        {doc.rows.map((row, i) => (
          <RowView key={row.id} row={row} index={i} count={doc.rows.length} readOnly />
        ))}
      </div>
    </div>
  );
};

const EmptyDoc: React.FC = () => {
  const { t, drag, target, act } = useBuilder();
  const droppable = isBlockDrag(drag) || isRowDrag(drag);
  const over = target?.kind === 'row' && target.index === 0;
  const starters: { kind: StarterKind; label: string }[] = [
    { kind: 'text', label: t('Text', 'Text', 'Szöveg') },
    { kind: 'imageText', label: t('Image and text', 'Obrázok a text', 'Kép és szöveg') },
    { kind: 'twoColumns', label: t('Two columns', 'Dva stĺpce', 'Két oszlop') },
  ];
  return (
    <div
      className="mx-4 my-6 flex flex-col items-center gap-4 px-6 py-12 text-center"
      style={{ border: `2px dashed ${over ? CHROME.accent : CHROME.line}`, background: over ? '#eef2ff' : '#f8fafc', color: CHROME.muted, fontFamily: 'Arial, Helvetica, sans-serif' }}
      onDragOver={(e) => {
        if (!droppable) return;
        e.preventDefault();
        e.stopPropagation();
        const next = { kind: 'row' as const, index: 0 };
        if (!sameTarget(target, next)) act.setTarget(next);
      }}
      onDrop={(e) => {
        if (!droppable) return;
        e.preventDefault();
        e.stopPropagation();
        act.drop();
      }}
    >
      <p className="text-body font-semibold" style={{ color: CHROME.ink }}>
        {t('Drag a row or a block here', 'Presuňte sem riadok alebo blok', 'Húzzon ide egy sort vagy blokkot')}
      </p>
      <p className="text-ui">{t('or start from one of these', 'alebo začnite jedným z týchto', 'vagy kezdje ezek egyikével')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {starters.map((s) => (
          <button
            key={s.kind}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              act.addStarter(s.kind);
            }}
            className="cursor-pointer rounded-lg px-3 py-1.5 text-ui font-semibold"
            style={{ background: CHROME.white, border: `1px solid ${CHROME.line}`, color: CHROME.ink }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export const Canvas: React.FC<{
  lockedHeader?: EmailDoc | null;
  lockedFooter?: EmailDoc | null;
  onEditLocked?: (part: 'header' | 'footer') => void;
}> = ({ lockedHeader, lockedFooter, onEditLocked }) => {
  const { doc, theme, device, act } = useBuilder();
  const mobile = device === 'mobile';
  return (
    <div
      className="min-h-0 flex-1 overflow-auto bg-slate-200 px-4 pb-10 pt-12"
      onClick={() => act.select(null)}
      // A file dropped anywhere but on an image block must not make the browser open it.
      onDragOver={(e) => {
        if (hasFiles(e.dataTransfer)) e.preventDefault();
      }}
      onDrop={(e) => {
        if (hasFiles(e.dataTransfer)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) act.setTarget(null);
      }}
    >
      {/* The e-mail itself: paper, so it ignores the view size and stays light in dark mode. */}
      <div
        className="view-size-fixed mx-auto"
        style={{ width: mobile ? 375 : theme.contentWidth + 64, maxWidth: '100%', background: theme.pageBackground, color: theme.textColor, fontFamily: theme.fontFamily }}
      >
        {lockedHeader && lockedHeader.rows.length > 0 && <LockedPart doc={lockedHeader} part="header" onEdit={onEditLocked} />}
        {/* data-nl-body: the campaign's own rows, apart from the locked header and footer (QA counts blocks inside it). */}
        <div data-nl-body="">
        {doc.rows.length === 0 ? (
          <EmptyDoc />
        ) : (
          <>
            <RowGap index={0} />
            {doc.rows.map((row, i) => (
              <React.Fragment key={row.id}>
                <RowView row={row} index={i} count={doc.rows.length} />
                <RowGap index={i + 1} />
              </React.Fragment>
            ))}
          </>
        )}
        </div>
        {lockedFooter && lockedFooter.rows.length > 0 && <LockedPart doc={lockedFooter} part="footer" onEdit={onEditLocked} />}
      </div>
    </div>
  );
};
