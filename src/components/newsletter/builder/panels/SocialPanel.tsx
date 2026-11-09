import React from 'react';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import type { SocialBlock, SocialNetwork } from '../types.ts';
import { SOCIAL_NETWORKS } from '../defaults.ts';
import { useBuilder } from '../builderContext.ts';
import { networkLabel } from '../labels.ts';
import { AlignField, Group, SelectField, TextField } from './fields.tsx';

const iconButton = 'flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:cursor-default disabled:opacity-30';

export const SocialPanel: React.FC<{ block: SocialBlock; patch: (p: Record<string, unknown>) => void }> = ({ block, patch }) => {
  const { t } = useBuilder();
  const items = block.items;
  const setItems = (next: typeof items) => patch({ items: next });
  const move = (i: number, d: -1 | 1) => {
    const next = items.slice();
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setItems(next);
  };
  const unused = SOCIAL_NETWORKS.find((n) => !items.some((it) => it.network === n)) ?? 'website';

  return (
    <div className="space-y-4">
      <Group label={t('Networks', 'Siete', 'Hálózatok')}>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="space-y-1.5 rounded-lg border border-slate-200 p-2">
              <div className="flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <SelectField
                    value={item.network}
                    ariaLabel={t('Network', 'Sieť', 'Hálózat')}
                    onChange={(v) => setItems(items.map((it, j) => (j === i ? { ...it, network: v as SocialNetwork } : it)))}
                    options={SOCIAL_NETWORKS.map((n) => ({ value: n, label: networkLabel(n) }))}
                  />
                </div>
                <button type="button" className={iconButton} disabled={i === 0} title={t('Move up', 'Posunúť vyššie', 'Feljebb')} aria-label={t('Move up', 'Posunúť vyššie', 'Feljebb')} onClick={() => move(i, -1)}>
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" className={iconButton} disabled={i === items.length - 1} title={t('Move down', 'Posunúť nižšie', 'Lejjebb')} aria-label={t('Move down', 'Posunúť nižšie', 'Lejjebb')} onClick={() => move(i, 1)}>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" className={iconButton} title={t('Remove', 'Odstrániť', 'Eltávolítás')} aria-label={t('Remove', 'Odstrániť', 'Eltávolítás')} onClick={() => setItems(items.filter((_, j) => j !== i))}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <TextField
                value={item.url}
                ariaLabel={t('Page address (URL)', 'Adresa stránky (URL)', 'Oldal címe (URL)')}
                placeholder="https://…"
                onChange={(v) => setItems(items.map((it, j) => (j === i ? { ...it, url: v } : it)))}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setItems([...items, { network: unused, url: '' }])}
          className="mt-2 inline-flex cursor-pointer items-center gap-1 text-ui font-semibold text-indigo-600 hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('Add network', 'Pridať sieť', 'Hálózat hozzáadása')}
        </button>
      </Group>
      <Group label={t('Alignment', 'Zarovnanie', 'Igazítás')}>
        <AlignField value={block.align} fallback="center" onChange={(a) => patch({ align: a })} />
      </Group>
    </div>
  );
};
