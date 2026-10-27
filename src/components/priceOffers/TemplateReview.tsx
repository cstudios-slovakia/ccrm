import React, { useEffect, useRef, useState } from "react";
import type { AiCustomTemplate, InvoiceOffer } from "../../types";
import type { Language } from "../../utils/translations";
import { OfferBlockDocument, type OfferBlockReview } from "../pdf/OfferBlockDocument";
import {
  blockForCatalogId, customBlocks, diffTemplateFields, discardCustomField, fieldLabel,
  findBlock, forgetCustomKey, insertBlock, isSamplePdfUrl, moveSibling, nextBlockId,
  normalizeOfferDocument, relocateBlock, removeBlock, replaceBlock, setBlockText,
  type OfferDocument
} from "../../utils/offerDocument";

interface TemplateReviewProps {
  template: AiCustomTemplate;
  otherNames: string[];
  lang: Language;
  onSave: (template: AiCustomTemplate) => void;
  onCancel: () => void;
}

const STUB = {
  id: "review",
  documentNumber: "",
  type: "price_offer",
  mode: "custom",
  leadId: "",
  clientName: "",
  title: "",
  subject: "",
  uspCards: [],
  items: [],
  subtotal: 0,
  vatAmount: 0,
  totalPrice: 0,
  currency: "EUR",
  status: "draft",
  issuedAt: "2026-01-01"
} as InvoiceOffer;

/**
 * Upload, then this. The paper is the reconstruction; the rail is what the PDF
 * left out and what it introduced. Nothing is stored until Save.
 */
export const TemplateReview: React.FC<TemplateReviewProps> = ({
  template,
  otherNames,
  lang,
  onSave,
  onCancel
}) => {
  const t = (en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(template.name || "");
  const [doc, setDoc] = useState<OfferDocument>(
    () => normalizeOfferDocument(template.document) ?? { blocks: [], customFields: [] }
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [original, setOriginal] = useState(false);
  const trimmed = name.trim();
  const duplicate = trimmed !== "" && otherNames.some(other => other.trim().toLowerCase() === trimmed.toLowerCase());
  const diff = diffTemplateFields(doc.blocks.length || doc.customFields.length ? doc : null);
  const pdfUrl = isSamplePdfUrl(template.sourcePdfUrl) ? template.sourcePdfUrl : "";

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const save = () => {
    if (!trimmed) return;
    onSave({ ...template, name: trimmed.slice(0, 150), document: normalizeOfferDocument(doc) });
  };

  const labelOf = (id: string) => fieldLabel(id, lang);

  const placeMissing = (id: string, index?: number) => {
    const block = blockForCatalogId(id, nextBlockId(doc));
    if (block) setDoc(insertBlock(doc, block, index));
  };

  const placeCustom = (key: string, index?: number) => {
    const field = doc.customFields.find(item => item.key === key);
    if (!field) return;
    setDoc(insertBlock(doc, { id: nextBlockId(doc), type: "customField", key: field.key, label: field.label }, index));
  };

  const onDrop = (index: number, payload: string) => {
    const sep = payload.indexOf(":");
    if (sep < 1) return;
    const kind = payload.slice(0, sep);
    const id = payload.slice(sep + 1);
    if (kind === "block") setDoc(relocateBlock(doc, id, index));
    else if (kind === "missing") placeMissing(id, index);
    else if (kind === "custom") placeCustom(id, index);
  };

  const review: OfferBlockReview = {
    selectedId,
    onSelect: setSelectedId,
    onDrop,
    onText: (id, text) => setDoc(setBlockText(doc, id, text)),
    onConvertToField: (id, fieldId) => {
      const block = blockForCatalogId(fieldId, id);
      if (block) setDoc(replaceBlock(doc, id, block));
    },
    onConvertToText: id => {
      const block = findBlock(doc, id);
      if (!block || (block.type !== "field" && block.type !== "customField")) return;
      const text = block.type === "field" ? (block.label || fieldLabel(block.fieldId, lang)) : block.label;
      let next = replaceBlock(doc, id, { id, type: "text", text });
      if (block.type === "customField" && customBlocks(next, block.key).length === 0) next = forgetCustomKey(next, block.key);
      setDoc(next);
    },
    onDelete: id => setDoc(removeBlock(doc, id)),
    onMove: (id, dir) => setDoc(moveSibling(doc, id, dir)),
    missingIds: diff.missing,
    labelOf
  };

  const drag = (payload: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", payload);
    e.dataTransfer.effectAllowed = "copy";
  };

  const rowClass = "flex flex-wrap items-center gap-2 py-1.5";
  const placeClass = "rounded-lg border border-slate-300 px-2 py-1 text-ui font-semibold text-slate-700 hover:border-indigo-400 hover:text-indigo-700 cursor-pointer";

  return (
    <div data-testid="template-review" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={nameRef}
          data-testid="template-review-name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          aria-label={t("Template name", "Názov šablóny", "Sablon neve")}
          className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-body font-semibold text-slate-900"
        />
        <button
          type="button"
          data-testid="template-review-original"
          onClick={() => setOriginal(v => !v)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-ui font-semibold text-slate-700 cursor-pointer"
        >
          {t("Original", "Originál", "Eredeti")}
        </button>
        <button
          type="button"
          data-testid="template-review-save"
          disabled={!trimmed}
          onClick={save}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-ui font-bold text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("Save", "Uložiť", "Mentés")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl bg-slate-200 px-4 py-2 text-ui font-bold text-slate-800 cursor-pointer"
        >
          {t("Cancel", "Zrušiť", "Mégse")}
        </button>
      </div>
      {duplicate && (
        <p data-testid="template-review-duplicate" className="text-ui text-amber-700">
          {t(
            "Another template already has this name — they will be hard to tell apart.",
            "Iná šablóna už má tento názov — budú sa ťažko rozlišovať.",
            "Egy másik sablon már ezt a nevet viseli — nehéz lesz megkülönböztetni őket."
          )}
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-4 ws-lg:grid-cols-3">
        <div className="ws-lg:col-span-2 space-y-4">
          {original && pdfUrl && (
            <object data={pdfUrl} type="application/pdf" className="h-96 w-full rounded-2xl border border-slate-200" aria-label={t("Original PDF", "Pôvodné PDF", "Eredeti PDF")}>
              <iframe src={pdfUrl} title={t("Original PDF", "Pôvodné PDF", "Eredeti PDF")} className="h-96 w-full" />
            </object>
          )}
          <OfferBlockDocument
            offer={STUB}
            template={{ ...template, document: doc }}
            document={doc}
            language={lang}
            review={review}
          />
        </div>

        <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
          <section data-testid="template-review-missing">
            <h4 className="type-label text-slate-800">{t("Not on this document", "Nie je na dokumente", "Nincs a dokumentumon")}</h4>
            {diff.missing.includes("offer.items") && (
              <p data-testid="template-review-items-warning" className="mt-2 text-ui text-amber-800">
                {t(
                  "This quote has no price table. Issuing will fail until it has items.",
                  "Táto ponuka nemá tabuľku cien. Vystavenie zlyhá, kým na nej nebudú položky.",
                  "Az árajánlaton nincs tételtáblázat. A kiállítás addig sikertelen, amíg nincsenek tételek."
                )}
              </p>
            )}
            <ul className="mt-2">
              {diff.missing.map(id => (
                <li key={id} className={rowClass} draggable onDragStart={drag(`missing:${id}`)}>
                  <span className="min-w-0 flex-1 text-ui text-slate-700">{labelOf(id)}</span>
                  <button type="button" className={placeClass} onClick={() => placeMissing(id)}>
                    {t("Place", "Vložiť", "Elhelyezés")}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section data-testid="template-review-extracted">
            <h4 className="type-label text-slate-800">{t("From this PDF", "Z tohto PDF", "Ebből a PDF-ből")}</h4>
            <ul className="mt-2">
              {diff.extracted.map(field => {
                const placed = customBlocks(doc, field.key).length > 0;
                return (
                  <li key={field.key} className={rowClass} draggable onDragStart={drag(`custom:${field.key}`)}>
                    <span className="min-w-0 flex-1 text-ui text-slate-700">{field.label}</span>
                    {placed ? (
                      <span className="text-ui text-slate-400">{t("On the document", "Na dokumente", "A dokumentumon")}</span>
                    ) : (
                      <button type="button" className={placeClass} onClick={() => placeCustom(field.key)}>
                        {t("Place", "Vložiť", "Elhelyezés")}
                      </button>
                    )}
                    {placed && (
                      <select
                        className="text-ui"
                        value=""
                        aria-label={t("Link to a field", "Prepojiť na pole", "Mezőhöz kötés")}
                        onChange={e => {
                          const fieldId = e.target.value;
                          if (!fieldId) return;
                          const block = customBlocks(doc, field.key)[0];
                          const replacement = block ? blockForCatalogId(fieldId, block.id) : null;
                          if (!block || !replacement) return;
                          let next = replaceBlock(doc, block.id, replacement);
                          if (customBlocks(next, field.key).length === 0) next = forgetCustomKey(next, field.key);
                          setDoc(next);
                        }}
                      >
                        <option value="">{t("Link to a field", "Prepojiť na pole", "Mezőhöz kötés")}</option>
                        {diff.missing.filter(id => id !== "offer.items" && id !== "offer.totals" && id !== "offer.uspCards").map(id => (
                          <option key={id} value={id}>{labelOf(id)}</option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      className={placeClass}
                      onClick={() => {
                        const block = customBlocks(doc, field.key)[0];
                        if (block) {
                          let next = replaceBlock(doc, block.id, { id: block.id, type: "text", text: field.label });
                          if (customBlocks(next, field.key).length === 0) next = forgetCustomKey(next, field.key);
                          setDoc(next);
                        } else {
                          const id = nextBlockId(doc);
                          setDoc(forgetCustomKey(insertBlock(doc, { id, type: "text", text: field.label }), field.key));
                        }
                      }}
                    >
                      {t("Fixed text", "Pevný text", "Rögzített szöveg")}
                    </button>
                    <button type="button" className="text-ui text-rose-600 cursor-pointer" onClick={() => setDoc(discardCustomField(doc, field.key))}>
                      {t("Discard", "Zahodiť", "Eldobás")}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
};
