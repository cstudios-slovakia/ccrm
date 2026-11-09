import React from 'react';
import { cn } from '../../../../utils/cn';
import type { EmailRow, VerticalAlign } from '../types.ts';
import { ROW_LAYOUTS } from '../defaults.ts';
import { useBuilder } from '../builderContext.ts';
import { layoutLabel } from '../labels.ts';
import { STYLE_DEFAULTS } from '../styles.ts';
import { Field, Group, NumberField, Segmented, SectionTitle, ToggleField, ColorField } from './fields.tsx';
import { LayoutGlyph } from './Palette.tsx';

export const RowPanel: React.FC<{ row: EmailRow }> = ({ row }) => {
  const { t, theme, act } = useBuilder();
  const multi = row.columns.length > 1;
  return (
    <div className="space-y-4">
      <Group label={t('Layout', 'Rozloženie', 'Elrendezés')}>
        <div className="grid grid-cols-3 gap-1.5">
          {ROW_LAYOUTS.map((layout) => (
            <button
              key={layout}
              type="button"
              title={layoutLabel(t, layout)}
              aria-label={layoutLabel(t, layout)}
              aria-pressed={row.layout === layout}
              onClick={() => act.setLayout(row.id, layout)}
              className={cn(
                'flex cursor-pointer items-center justify-center rounded-lg border px-2 py-2.5 transition-colors',
                row.layout === layout ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-300',
              )}
            >
              <LayoutGlyph layout={layout} />
            </button>
          ))}
        </div>
        <p className="mt-1 text-caption text-slate-400">
          {t(
            'With fewer columns, the blocks of the removed ones move into the last column.',
            'Pri menšom počte stĺpcov sa bloky odstránených presunú do posledného stĺpca.',
            'Kevesebb oszlopnál az eltávolítottak blokkjai az utolsó oszlopba kerülnek.',
          )}
        </p>
      </Group>

      <SectionTitle>{t('Colours', 'Farby', 'Színek')}</SectionTitle>
      <Group label={t('Full-width background', 'Pozadie na celú šírku', 'Teljes szélességű háttér')}>
        <ColorField value={row.background} fallback={theme.pageBackground} onChange={(v) => act.patchRow(row.id, { background: v })} />
      </Group>
      <Group label={t('Content background', 'Pozadie obsahu', 'Tartalom háttere')}>
        <ColorField value={row.contentBackground} fallback={theme.contentBackground} onChange={(v) => act.patchRow(row.id, { contentBackground: v })} />
      </Group>

      <SectionTitle>{t('Spacing', 'Odsadenie', 'Térközök')}</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('Top', 'Hore', 'Felül')}>
          <NumberField value={row.paddingTop ?? STYLE_DEFAULTS.rowPadding} min={0} max={120} suffix="px" onChange={(n) => act.patchRow(row.id, { paddingTop: n })} />
        </Field>
        <Field label={t('Bottom', 'Dole', 'Alul')}>
          <NumberField value={row.paddingBottom ?? STYLE_DEFAULTS.rowPadding} min={0} max={120} suffix="px" onChange={(n) => act.patchRow(row.id, { paddingBottom: n })} />
        </Field>
      </div>

      {multi && (
        <>
          <ToggleField
            checked={row.stackOnMobile !== false}
            onChange={(v) => act.patchRow(row.id, { stackOnMobile: v ? undefined : false })}
            label={t('Stack columns on phones', 'Na telefóne dať stĺpce pod seba', 'Telefonon oszlopok egymás alatt')}
          />
          <SectionTitle>{t('Columns', 'Stĺpce', 'Oszlopok')}</SectionTitle>
          {row.columns.map((column, i) => (
            <div key={column.id} className="space-y-2 rounded-lg border border-slate-200 p-2.5">
              <div className="type-label text-slate-700">{`${t('Column', 'Stĺpec', 'Oszlop')} ${i + 1}`}</div>
              <Group label={t('Vertical alignment', 'Zvislé zarovnanie', 'Függőleges igazítás')}>
                <Segmented<VerticalAlign>
                  value={column.verticalAlign ?? 'top'}
                  onChange={(v) => act.patchColumn(column.id, { verticalAlign: v === 'top' ? undefined : v })}
                  options={[
                    { value: 'top', label: t('Top', 'Hore', 'Fent') },
                    { value: 'middle', label: t('Middle', 'Stred', 'Közép') },
                    { value: 'bottom', label: t('Bottom', 'Dole', 'Lent') },
                  ]}
                />
              </Group>
              <Field label={t('Side padding', 'Bočné odsadenie', 'Oldalsó térköz')}>
                <NumberField value={column.paddingX ?? STYLE_DEFAULTS.columnPaddingX} min={0} max={60} suffix="px" onChange={(n) => act.patchColumn(column.id, { paddingX: n })} />
              </Field>
            </div>
          ))}
        </>
      )}
    </div>
  );
};
