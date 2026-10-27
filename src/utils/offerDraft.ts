import type {
  CompanyBillingSettings, InvoiceOffer, InvoiceOfferItem, InvoiceOfferMode,
  Lead, UspCardItem, WarehouseItem
} from "../types";
import { normalizeCustomFieldValues } from "./offerDocument.ts";

/**
 * The price offer editor works on one `InvoiceOffer`-shaped draft instead of a
 * state hook per field. Templates patch it directly; this file is the pure part
 * of that — seeding a draft, turning it into the document that is saved or
 * previewed, and the "is this field empty" rule the printed document hides by.
 */

/** The templates print at most four benefit cards. */
export const MAX_USP_CARDS = 4;

/** Money that never throws on a half-populated row coming back from sync. */
export const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Add whole days to a local "YYYY-MM-DD" date, staying on the local calendar.
 * Pure on purpose: the dates are stamped once when the editor opens, so the
 * live document does not silently re-derive them on every keystroke.
 */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const base = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
}

/** Whole calendar days from one YYYY-MM-DD date to another. */
export function daysBetween(from: string, to: string): number {
  const parse = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/** A field with nothing worth printing in it: missing, or only whitespace. */
export function isBlankText(value: unknown): boolean {
  return value == null || String(value).trim() === "";
}

// ---------------------------------------------------------------- line items

/** Line total after the discount, rounded to cents. */
export function lineTotal(item: Pick<InvoiceOfferItem, "quantity" | "unitPrice" | "discountPct">): number {
  const base = num(item.quantity) * num(item.unitPrice);
  const discountFactor = (100 - num(item.discountPct)) / 100;
  return Math.round(base * discountFactor * 100) / 100;
}

/** Applies a patch to one line and recomputes its total. */
export function patchLine(item: InvoiceOfferItem, updates: Partial<InvoiceOfferItem>): InvoiceOfferItem {
  const merged = { ...item, ...updates };
  merged.totalPrice = lineTotal(merged);
  return merged;
}

export function customLine(id: string, vatRate: number): InvoiceOfferItem {
  return {
    id,
    name: "",
    description: "",
    quantity: 1,
    unit: "ks",
    unitPrice: 0,
    vatRate,
    discountPct: 0,
    totalPrice: 0
  };
}

/**
 * A line for a warehouse product. `unitPrice` is the price resolved for this
 * customer (their price level, else the default); it falls back to the product's
 * default sell price when the caller has no opinion.
 */
export function warehouseLine(id: string, product: WarehouseItem, vatRate: number, unitPrice?: number): InvoiceOfferItem {
  unitPrice = num(unitPrice ?? product.defaultSellPrice);
  return {
    id,
    warehouseItemId: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description || "",
    quantity: 1,
    unit: product.unit || "ks",
    unitPrice,
    vatRate,
    discountPct: 0,
    totalPrice: unitPrice
  };
}

export function offerTotals(items: InvoiceOfferItem[]) {
  const subtotal = items.reduce((acc, it) => acc + num(it.totalPrice), 0);
  const vatAmount = items.reduce((acc, it) => acc + num(it.totalPrice) * (num(it.vatRate) / 100), 0);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    vatAmount: Math.round(vatAmount * 100) / 100,
    grandTotal: Math.round((subtotal + vatAmount) * 100) / 100
  };
}

// ---------------------------------------------------------------- seeding

export const blankUspCards = (): UspCardItem[] =>
  Array.from({ length: MAX_USP_CARDS }, () => ({ title: "", subtitle: "" }));

export interface NewDraftOptions {
  id: string;
  documentNumber: string;
  issuedAt: string;
  mode: InvoiceOfferMode;
  /** AI template the draft starts on; only used when `mode` is "custom". */
  templateId: string;
  defaultTitle: string;
  signOffTeam: string;
  currency: string;
  settings?: CompanyBillingSettings | null;
  /** Where a new offer starts: the first draft status of the configured list. Defaults to "draft". */
  status?: string;
}

/** A fresh draft, pre-filled from the defaults in Settings → Invoicing. */
export function newOfferDraft(o: NewDraftOptions): InvoiceOffer {
  const cbs = o.settings;
  return {
    id: o.id,
    documentNumber: o.documentNumber,
    type: "price_offer",
    mode: o.mode,
    leadId: "",
    clientName: "",
    title: o.defaultTitle,
    subject: "",
    location: "",
    greetingNote: "",
    introNote: "",
    reassuranceNote: "",
    uspCards: cbs?.defaultUspCards?.length
      ? cbs.defaultUspCards.slice(0, MAX_USP_CARDS).map(c => ({ ...c }))
      : blankUspCards(),
    items: [],
    subtotal: 0,
    vatAmount: 0,
    totalPrice: 0,
    priceRangeMin: null,
    priceRangeMax: null,
    currency: o.currency,
    durationText: cbs?.defaultDurationText || "",
    startDateText: cbs?.defaultStartDateText || "",
    warrantyText: cbs?.defaultWarrantyText || "",
    nextStepsNote: cbs?.defaultNextSteps || "",
    closingNote: "",
    signOffTeam: o.signOffTeam,
    customTemplateId: o.mode === "custom" ? o.templateId || null : null,
    status: o.status || "draft",
    issuedAt: o.issuedAt
  };
}

/** A saved offer loaded back into a draft; blanks become "" so every field is editable. */
export function draftFromOffer(offer: InvoiceOffer, o: { defaultTitle: string; todayIso: string; fallbackTemplateId: string }): InvoiceOffer {
  return {
    ...offer,
    title: offer.title || o.defaultTitle,
    subject: offer.subject || "",
    location: offer.location || "",
    greetingNote: offer.greetingNote || "",
    introNote: offer.introNote || "",
    reassuranceNote: offer.reassuranceNote || "",
    uspCards: offer.uspCards?.length ? offer.uspCards.map(c => ({ ...c })) : blankUspCards(),
    items: (offer.items || []).map(it => ({ ...it })),
    priceRangeMin: offer.priceRangeMin ?? null,
    priceRangeMax: offer.priceRangeMax ?? null,
    durationText: offer.durationText || "",
    startDateText: offer.startDateText || "",
    warrantyText: offer.warrantyText || "",
    nextStepsNote: offer.nextStepsNote || "",
    closingNote: offer.closingNote || "",
    signOffTeam: offer.signOffTeam || "",
    customTemplateId: offer.mode === "custom" ? offer.customTemplateId || o.fallbackTemplateId || null : null,
    issuedAt: offer.issuedAt || o.todayIso
  };
}

// ---------------------------------------------------------------- assembly

export interface AssembleOptions {
  lead: Lead | null;
  /** The saved offer being edited, if any — its status, number and external ids win. */
  existing: InvoiceOffer | null;
  currency: string;
  defaultTitle: string;
  defaultCountry?: string | null;
  createdBy?: string | null;
  fallbackDocumentNumber: string;
  fallbackId: string;
  /** Template used when the draft is custom but names none. */
  activeTemplateId?: string | null;
}

function clientFields(lead: Lead | null, defaultCountry?: string | null) {
  if (!lead) {
    return {
      leadId: "",
      clientId: null,
      clientName: "",
      clientEmail: null,
      clientPhone: null,
      clientStreet: null,
      clientCity: null,
      clientPostalCode: null,
      clientCountry: null,
      clientIco: null,
      clientDic: null,
      clientIcdph: null
    };
  }
  return {
    leadId: lead.id,
    clientId: lead.id,
    clientName: lead.name,
    clientEmail: lead.email ?? null,
    clientPhone: lead.phone ?? null,
    clientStreet: lead.address?.street ?? null,
    clientCity: lead.city || lead.address?.city || null,
    clientPostalCode: lead.address?.postalCode ?? null,
    clientCountry: lead.address?.country || defaultCountry || null,
    clientIco: lead.companyId ?? null,
    clientDic: lead.taxId ?? null,
    clientIcdph: lead.vatId ?? null
  };
}

function validPrice(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The stored valid-until moved by as many days as the issue date was moved. */
function shiftWithIssue(issuedAt: string, date?: string | null, storedIssuedAt?: string | null): string | null {
  if (!date) return null;
  if (!storedIssuedAt || storedIssuedAt === issuedAt) return date;
  return addDays(date, daysBetween(storedIssuedAt, issuedAt));
}

/**
 * The document the draft stands for, exactly as it will be saved: trimmed,
 * blank texts as null, blank benefit cards dropped, totals recomputed. Null
 * until a client is chosen.
 */
export function buildOfferFromDraft(draft: InvoiceOffer, o: AssembleOptions): InvoiceOffer | null {
  if (!o.lead) return null;
  return finalizeOffer(draft, o);
}

function finalizeOffer(draft: InvoiceOffer, o: AssembleOptions, sampleClientName?: string): InvoiceOffer {
  const totals = offerTotals(draft.items);
  const orNull = (v?: string | null) => v?.trim() || null;
  const client = clientFields(o.lead, o.defaultCountry);
  const existing = o.existing;
  const customFields = normalizeCustomFieldValues(draft.customFields);
  return {
    id: existing?.id || draft.id || o.fallbackId,
    documentNumber: existing?.documentNumber || draft.documentNumber || o.fallbackDocumentNumber,
    type: "price_offer",
    mode: draft.mode,
    externalProvider: existing?.externalProvider ?? null,
    externalId: existing?.externalId ?? null,
    externalPdfUrl: existing?.externalPdfUrl ?? null,
    ...client,
    clientName: client.clientName || sampleClientName || "",
    title: draft.title.trim() || o.defaultTitle,
    subject: (draft.subject || "").trim(),
    location: orNull(draft.location),
    greetingNote: orNull(draft.greetingNote),
    introNote: orNull(draft.introNote),
    uspCards: draft.uspCards.filter(c => !isBlankText(c.title) || !isBlankText(c.subtitle)),
    reassuranceNote: orNull(draft.reassuranceNote),
    items: draft.items,
    subtotal: totals.subtotal,
    vatAmount: totals.vatAmount,
    totalPrice: totals.grandTotal,
    priceRangeMin: validPrice(draft.priceRangeMin),
    priceRangeMax: validPrice(draft.priceRangeMax),
    currency: o.currency,
    durationText: orNull(draft.durationText),
    startDateText: orNull(draft.startDateText),
    warrantyText: orNull(draft.warrantyText),
    nextStepsNote: orNull(draft.nextStepsNote),
    closingNote: orNull(draft.closingNote),
    signOffTeam: orNull(draft.signOffTeam),
    customFields: Object.keys(customFields).length ? customFields : null,
    customTemplateId: draft.mode === "custom" ? draft.customTemplateId || o.activeTemplateId || null : null,
    status: existing?.status || draft.status || "draft",
    // The issue date is editable on an existing offer too. Valid-until moves
    // with it by the same number of days, keeping the offer's own terms. An
    // offer has no payment due date.
    issuedAt: draft.issuedAt,
    validUntil: shiftWithIssue(draft.issuedAt, existing?.validUntil, existing?.issuedAt) || addDays(draft.issuedAt, 30),
    dueDate: null,
    createdBy: existing?.createdBy || o.createdBy || null
  };
}

/**
 * A saved offer copied into a new, ready-to-issue one: same content, own id
 * and number, issued today with its terms moved by as many days, and nothing
 * that ties it to what the original issued upstream.
 */
export function duplicateOffer(
  offer: InvoiceOffer,
  o: { id: string; documentNumber: string; todayIso: string; status: string; createdBy?: string | null }
): InvoiceOffer {
  return {
    ...offer,
    id: o.id,
    documentNumber: o.documentNumber,
    // Line ids are the primary key of invoice_offer_items, so a copy must not reuse them.
    items: offer.items.map(it => ({ ...it, id: "ioi-" + Math.random().toString(36).slice(2, 11) })),
    uspCards: (offer.uspCards || []).map(c => ({ ...c })),
    status: o.status,
    statusChangedAt: undefined,
    issuedAt: o.todayIso,
    validUntil: shiftWithIssue(o.todayIso, offer.validUntil, offer.issuedAt) || addDays(o.todayIso, 30),
    externalId: null,
    externalPdfUrl: null,
    createdBy: o.createdBy || offer.createdBy || null
  };
}

/**
 * The finished document for Preview. Before a client is chosen it shows a
 * sample client so the layout is still judged on real data.
 */
export function previewOfferFromDraft(draft: InvoiceOffer, o: AssembleOptions & { sampleClientName: string }): InvoiceOffer {
  return finalizeOffer(draft, o, o.sampleClientName);
}

/**
 * What the editable template renders: the draft as typed — nothing trimmed,
 * blank benefit cards kept — with the live client, totals and valid-until.
 */
export function offerForEditing(draft: InvoiceOffer, o: AssembleOptions): InvoiceOffer {
  const finished = finalizeOffer(draft, o);
  return {
    ...finished,
    title: draft.title,
    subject: draft.subject || "",
    location: draft.location || "",
    greetingNote: draft.greetingNote || "",
    introNote: draft.introNote || "",
    reassuranceNote: draft.reassuranceNote || "",
    uspCards: draft.uspCards,
    durationText: draft.durationText || "",
    startDateText: draft.startDateText || "",
    warrantyText: draft.warrantyText || "",
    nextStepsNote: draft.nextStepsNote || "",
    closingNote: draft.closingNote || "",
    signOffTeam: draft.signOffTeam || ""
  };
}

/** Stable text form of the draft, compared against the one taken on open to tell if anything changed. */
export const draftSignature = (draft: InvoiceOffer, extra = ""): string => JSON.stringify([draft, extra]);
