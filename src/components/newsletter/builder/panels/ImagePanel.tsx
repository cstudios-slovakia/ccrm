import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Upload } from 'lucide-react';
import type { ImageBlock } from '../types.ts';
import { useBuilder } from '../builderContext.ts';
import { absoluteUrl } from '../styles.ts';
import { AlignField, Field, Group, NumberField, TextField, ToggleField } from './fields.tsx';

type LibraryImage = { url: string; name: string };

export const ImagePanel: React.FC<{
  block: ImageBlock;
  patch: (p: Record<string, unknown>) => void;
  listImages?: () => Promise<LibraryImage[]>;
}> = ({ block, patch, listImages }) => {
  const { t, act, uploading, assetBaseUrl } = useBuilder();
  const fileRef = useRef<HTMLInputElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState<LibraryImage[] | null>(null);
  const [libraryError, setLibraryError] = useState(false);
  const busy = uploading.has(block.id);

  useEffect(() => {
    if (!libraryOpen || library) return;
    let alive = true;
    listImages?.()
      .then((images) => alive && setLibrary(images))
      .catch(() => alive && setLibraryError(true));
    return () => {
      alive = false;
    };
  }, [libraryOpen, library, listImages]);

  const hasSrc = block.src.trim() !== '';
  return (
    <div className="space-y-4">
      {hasSrc && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-1.5">
          <img src={absoluteUrl(block.src, assetBaseUrl)} alt="" className="mx-auto max-h-32 max-w-full object-contain" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-ui font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {hasSrc ? t('Replace image', 'Nahradiť obrázok', 'Kép cseréje') : t('Upload image', 'Nahrať obrázok', 'Kép feltöltése')}
        </button>
        {listImages && (
          <button
            type="button"
            onClick={() => setLibraryOpen((v) => !v)}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-ui font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('Uploaded images', 'Nahraté obrázky', 'Feltöltött képek')}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void act.uploadImage(block.id, file);
            e.target.value = '';
          }}
        />
      </div>

      {libraryOpen && (
        <div className="rounded-lg border border-slate-200 p-2">
          {libraryError ? (
            <p className="text-ui text-rose-600">{t('The image list could not be loaded.', 'Zoznam obrázkov sa nepodarilo načítať.', 'A képek listáját nem sikerült betölteni.')}</p>
          ) : !library ? (
            <Loader2 className="mx-auto h-4 w-4 animate-spin text-slate-400" />
          ) : library.length === 0 ? (
            <p className="text-ui text-slate-500">{t('No uploaded images yet.', 'Zatiaľ nie sú nahraté žiadne obrázky.', 'Még nincs feltöltött kép.')}</p>
          ) : (
            <div className="grid max-h-48 grid-cols-3 gap-1.5 overflow-y-auto">
              {library.map((img) => (
                <button
                  key={img.url}
                  type="button"
                  title={img.name}
                  onClick={() => {
                    patch({ src: img.url });
                    setLibraryOpen(false);
                  }}
                  className="aspect-square cursor-pointer overflow-hidden rounded-md border border-slate-200 bg-slate-50 hover:border-indigo-400"
                >
                  <img src={img.url} alt={img.name} loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <Field label={t('Image address (URL)', 'Adresa obrázka (URL)', 'Kép címe (URL)')}>
        <TextField value={block.src.startsWith('data:') ? '' : block.src} onChange={(v) => patch({ src: v })} placeholder="https://…" />
      </Field>
      {block.src.startsWith('data:') && (
        <p className="flex items-start gap-1.5 text-caption text-rose-600">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {t('This image is embedded in the document and will not show in most mail clients. Upload it instead.', 'Tento obrázok je vložený priamo v dokumente a vo väčšine e-mailových klientov sa nezobrazí. Nahrajte ho.', 'Ez a kép beágyazott, a legtöbb levelezőben nem jelenik meg. Töltse fel inkább.')}
        </p>
      )}

      <Field label={t('Alt text', 'Alternatívny text', 'Alternatív szöveg')}>
        <TextField value={block.alt} onChange={(v) => patch({ alt: v })} />
      </Field>
      {hasSrc && block.alt.trim() === '' && (
        <p className="-mt-2 flex items-start gap-1.5 text-caption text-amber-600">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {t('Describe the image for people who cannot see it.', 'Opíšte obrázok pre ľudí, ktorí ho nevidia.', 'Írja le a képet azoknak, akik nem látják.')}
        </p>
      )}

      <Field label={t('Link (optional)', 'Odkaz (voliteľné)', 'Hivatkozás (nem kötelező)')}>
        <TextField value={block.href ?? ''} onChange={(v) => patch({ href: v === '' ? undefined : v })} placeholder="https://…" />
      </Field>

      <Group label={t('Width', 'Šírka', 'Szélesség')}>
        <div className="space-y-2">
          <ToggleField checked={block.width === undefined} onChange={(v) => patch({ width: v ? undefined : 300 })} label={t('Full column width', 'Celá šírka stĺpca', 'Az oszlop teljes szélessége')} />
          {block.width !== undefined && <NumberField value={block.width} min={20} max={800} suffix="px" onChange={(n) => patch({ width: n })} />}
        </div>
      </Group>
      <Group label={t('Alignment', 'Zarovnanie', 'Igazítás')}>
        <AlignField value={block.align} onChange={(a) => patch({ align: a })} />
      </Group>
    </div>
  );
};
