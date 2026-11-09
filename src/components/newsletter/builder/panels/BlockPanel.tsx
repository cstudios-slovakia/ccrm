import React from 'react';
import type { EmailBlock } from '../types.ts';
import { useBuilder } from '../builderContext.ts';
import { STYLE_DEFAULTS } from '../styles.ts';
import { AlignField, ColorField, Field, Group, NumberField, Segmented, TextField, ToggleField } from './fields.tsx';
import { ImagePanel } from './ImagePanel.tsx';
import { SocialPanel } from './SocialPanel.tsx';

export const BlockPanel: React.FC<{
  block: EmailBlock;
  listImages?: () => Promise<{ url: string; name: string }[]>;
}> = ({ block, listImages }) => {
  const { t, theme, act } = useBuilder();
  // Typing in a field is one undo step per field, not one per keystroke.
  const patch = (p: Record<string, unknown>) => act.patchBlock(block.id, p, `panel:${block.id}:${Object.keys(p).join(',')}`);

  switch (block.type) {
    case 'text':
      return (
        <div className="space-y-4">
          <p className="text-caption text-slate-400">{t('Click the text on the canvas to edit it.', 'Text upravíte kliknutím na plátne.', 'A szöveget a vásznon kattintva szerkesztheti.')}</p>
          <Group label={t('Alignment', 'Zarovnanie', 'Igazítás')}>
            <AlignField value={block.align} onChange={(a) => patch({ align: a })} />
          </Group>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('Font size', 'Veľkosť písma', 'Betűméret')}>
              <NumberField value={block.fontSize ?? STYLE_DEFAULTS.fontSize} min={10} max={40} suffix="px" onChange={(n) => patch({ fontSize: n })} />
            </Field>
            <Field label={t('Line height', 'Riadkovanie', 'Sormagasság')}>
              <NumberField value={block.lineHeight ?? STYLE_DEFAULTS.lineHeight} min={1} max={3} step={0.1} onChange={(n) => patch({ lineHeight: Math.round(n * 10) / 10 })} />
            </Field>
          </div>
          <Group label={t('Text colour', 'Farba textu', 'Szövegszín')}>
            <ColorField value={block.color} fallback={theme.textColor} onChange={(v) => patch({ color: v })} />
          </Group>
        </div>
      );
    case 'heading':
      return (
        <div className="space-y-4">
          <p className="text-caption text-slate-400">{t('Click the heading on the canvas to edit it.', 'Nadpis upravíte kliknutím na plátne.', 'A címsort a vásznon kattintva szerkesztheti.')}</p>
          <Group label={t('Level', 'Úroveň', 'Szint')}>
            <Segmented<'1' | '2' | '3'>
              value={String(block.level) as '1' | '2' | '3'}
              onChange={(v) => patch({ level: Number(v) })}
              options={[
                { value: '1', label: 'H1' },
                { value: '2', label: 'H2' },
                { value: '3', label: 'H3' },
              ]}
            />
          </Group>
          <Group label={t('Alignment', 'Zarovnanie', 'Igazítás')}>
            <AlignField value={block.align} onChange={(a) => patch({ align: a })} />
          </Group>
          <Group label={t('Text colour', 'Farba textu', 'Szövegszín')}>
            <ColorField value={block.color} fallback={theme.textColor} onChange={(v) => patch({ color: v })} />
          </Group>
        </div>
      );
    case 'image':
      return <ImagePanel block={block} patch={patch} listImages={listImages} />;
    case 'button':
      return (
        <div className="space-y-4">
          <Field label={t('Label', 'Text tlačidla', 'Felirat')}>
            <TextField value={block.label} onChange={(v) => patch({ label: v })} />
          </Field>
          <Field
            label={t('Link', 'Odkaz', 'Hivatkozás')}
            hint={t('https://, mailto:, tel: or a merge tag such as {{view_online_url}}', 'https://, mailto:, tel: alebo pole, napr. {{view_online_url}}', 'https://, mailto:, tel: vagy címke, pl. {{view_online_url}}')}
          >
            <TextField value={block.href} onChange={(v) => patch({ href: v })} placeholder="https://…" />
          </Field>
          <Group label={t('Alignment', 'Zarovnanie', 'Igazítás')}>
            <AlignField value={block.align} onChange={(a) => patch({ align: a })} />
          </Group>
          <ToggleField checked={!!block.fullWidth} onChange={(v) => patch({ fullWidth: v ? true : undefined })} label={t('Full width', 'Na celú šírku', 'Teljes szélesség')} />
          <Group label={t('Button colour', 'Farba tlačidla', 'Gomb színe')}>
            <ColorField value={block.background} fallback={theme.buttonBackground} onChange={(v) => patch({ background: v })} />
          </Group>
          <Group label={t('Text colour', 'Farba textu', 'Szövegszín')}>
            <ColorField value={block.color} fallback={theme.buttonTextColor} onChange={(v) => patch({ color: v })} />
          </Group>
          <Field label={t('Corner radius', 'Zaoblenie rohov', 'Sarokkerekítés')}>
            <NumberField value={block.radius ?? STYLE_DEFAULTS.buttonRadius} min={0} max={40} suffix="px" onChange={(n) => patch({ radius: n })} />
          </Field>
        </div>
      );
    case 'divider':
      return (
        <div className="space-y-4">
          <Group label={t('Colour', 'Farba', 'Szín')}>
            <ColorField value={block.color} fallback={STYLE_DEFAULTS.dividerColor} onChange={(v) => patch({ color: v })} />
          </Group>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('Thickness', 'Hrúbka', 'Vastagság')}>
              <NumberField value={block.thickness ?? STYLE_DEFAULTS.dividerThickness} min={1} max={20} suffix="px" onChange={(n) => patch({ thickness: n })} />
            </Field>
            <Field label={t('Width', 'Šírka', 'Szélesség')}>
              <NumberField value={block.widthPercent ?? STYLE_DEFAULTS.dividerWidthPercent} min={10} max={100} suffix="%" onChange={(n) => patch({ widthPercent: n })} />
            </Field>
          </div>
        </div>
      );
    case 'spacer':
      return (
        <Field label={t('Height', 'Výška', 'Magasság')}>
          <NumberField value={block.height} min={4} max={200} suffix="px" onChange={(n) => patch({ height: n })} />
        </Field>
      );
    case 'social':
      return <SocialPanel block={block} patch={patch} />;
    case 'html':
      return (
        <div className="space-y-3">
          <Field label="HTML">
            <TextField value={block.html} onChange={(v) => patch({ html: v })} multiline rows={14} mono ariaLabel="HTML" />
          </Field>
          <p className="text-caption text-slate-400">
            {t(
              'Your own markup, sent as written. Scripts do not run in e-mail. Use tables and inline styles for the best result.',
              'Vaše vlastné značky, odoslané tak, ako ich napíšete. Skripty sa v e-maile nespustia. Najlepší výsledok dosiahnete s tabuľkami a inline štýlmi.',
              'Saját jelölés, úgy kerül kiküldésre, ahogy írja. A szkriptek e-mailben nem futnak. A legjobb eredményhez használjon táblázatokat és inline stílusokat.',
            )}
          </p>
        </div>
      );
  }
};
