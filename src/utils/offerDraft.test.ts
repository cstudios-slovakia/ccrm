import assert from "node:assert/strict";
import test from "node:test";
import type { InvoiceOffer, Lead } from "../types";
import {
  addDays, blankUspCards, buildOfferFromDraft, customLine, daysBetween, draftFromOffer, draftSignature,
  isBlankText, lineTotal, newOfferDraft, offerForEditing, offerTotals, patchLine, previewOfferFromDraft,
  warehouseLine
} from "./offerDraft.ts";

const lead = {
  id: "lead-1",
  name: "Novák Stavby",
  city: "Šahy",
  email: "n@example.com",
  companyId: "12345678",
  address: { street: "Hlavná 1", city: "Šahy", postalCode: "94201", country: "Slovakia" }
} as unknown as Lead;

const baseOptions = {
  lead,
  existing: null,
  currency: "EUR",
  defaultTitle: "Cenová ponuka",
  defaultCountry: "Slovakia",
  createdBy: "Peter",
  fallbackDocumentNumber: "CP-2026-009",
  fallbackId: "io-fallback"
};

const seed = (over: Partial<Parameters<typeof newOfferDraft>[0]> = {}) =>
  newOfferDraft({
    id: "io-1",
    documentNumber: "CP-2026-001",
    issuedAt: "2026-08-01",
    mode: "default",
    templateId: "tpl-1",
    defaultTitle: "Cenová ponuka",
    signOffTeam: "",
    currency: "EUR",
    ...over
  });

test("isBlankText treats missing and whitespace-only text as empty, nothing else", () => {
  assert.equal(isBlankText(undefined), true);
  assert.equal(isBlankText(null), true);
  assert.equal(isBlankText(""), true);
  assert.equal(isBlankText("   \n"), true);
  assert.equal(isBlankText("24 months"), false);
  assert.equal(isBlankText(0), false);
});

test("lineTotal applies the discount and rounds to cents", () => {
  assert.equal(lineTotal({ quantity: 3, unitPrice: 10, discountPct: 0 }), 30);
  assert.equal(lineTotal({ quantity: 3, unitPrice: 10, discountPct: 10 }), 27);
  assert.equal(lineTotal({ quantity: 1, unitPrice: 0.1 + 0.2, discountPct: 0 }), 0.3);
  assert.equal(lineTotal({ quantity: Number.NaN, unitPrice: 10, discountPct: 0 }), 0);
});

test("patchLine recomputes the total from the merged values", () => {
  const line = customLine("l1", 20);
  const priced = patchLine(line, { unitPrice: 100 });
  assert.equal(priced.totalPrice, 100);
  const doubled = patchLine(priced, { quantity: 2, discountPct: 50 });
  assert.equal(doubled.totalPrice, 100);
  assert.equal(doubled.name, "");
});

test("offerTotals sums net and VAT per line rate", () => {
  const a = patchLine(customLine("a", 20), { unitPrice: 100 });
  const b = patchLine(customLine("b", 10), { unitPrice: 50 });
  assert.deepEqual(offerTotals([a, b]), { subtotal: 150, vatAmount: 25, grandTotal: 175 });
  assert.deepEqual(offerTotals([]), { subtotal: 0, vatAmount: 0, grandTotal: 0 });
});

test("warehouseLine copies the product and starts at one unit", () => {
  const line = warehouseLine("l2", { id: "w1", sku: "SKU-1", name: "Plech", unit: "m2", defaultSellPrice: 12.5 } as never, 23);
  assert.equal(line.warehouseItemId, "w1");
  assert.equal(line.unitPrice, 12.5);
  assert.equal(line.totalPrice, 12.5);
  assert.equal(line.unit, "m2");
  assert.equal(line.vatRate, 23);
});

test("a new draft starts from the settings defaults and carries blank texts", () => {
  const draft = seed({
    settings: {
      defaultUspCards: [{ title: "Záruka", subtitle: "10 rokov" }],
      defaultDurationText: "2 dni",
      defaultNextSteps: "Zavolajte nám"
    } as never
  });
  assert.equal(draft.durationText, "2 dni");
  assert.equal(draft.nextStepsNote, "Zavolajte nám");
  assert.equal(draft.warrantyText, "");
  assert.deepEqual(draft.uspCards, [{ title: "Záruka", subtitle: "10 rokov" }]);
  assert.equal(draft.customTemplateId, null);
  assert.equal(seed({ mode: "custom" }).customTemplateId, "tpl-1");
  assert.equal(seed().uspCards.length, blankUspCards().length);
});

test("an unsent draft cannot be built until a client is chosen", () => {
  assert.equal(buildOfferFromDraft(seed(), { ...baseOptions, lead: null }), null);
});

test("building trims texts, nulls the blank ones and drops blank benefit cards", () => {
  const draft = seed();
  draft.subject = "  Strecha  ";
  draft.location = "   ";
  draft.uspCards = [{ title: "Záruka", subtitle: "" }, { title: " ", subtitle: "" }];
  const doc = buildOfferFromDraft(draft, baseOptions)!;
  assert.equal(doc.subject, "Strecha");
  assert.equal(doc.location, null);
  assert.equal(doc.warrantyText, null);
  assert.deepEqual(doc.uspCards, [{ title: "Záruka", subtitle: "" }]);
  assert.equal(doc.clientName, "Novák Stavby");
  assert.equal(doc.clientStreet, "Hlavná 1");
  assert.equal(doc.clientIco, "12345678");
});

test("a blank title falls back to the default one", () => {
  const draft = seed();
  draft.title = "   ";
  assert.equal(buildOfferFromDraft(draft, baseOptions)!.title, "Cenová ponuka");
});

test("totals and the price range are recomputed from the draft", () => {
  const draft = seed();
  draft.items = [patchLine(customLine("a", 20), { unitPrice: 100, quantity: 2 })];
  draft.priceRangeMin = 1000;
  draft.priceRangeMax = Number.NaN;
  const doc = buildOfferFromDraft(draft, baseOptions)!;
  assert.equal(doc.subtotal, 200);
  assert.equal(doc.vatAmount, 40);
  assert.equal(doc.totalPrice, 240);
  assert.equal(doc.priceRangeMin, 1000);
  assert.equal(doc.priceRangeMax, null);
});

test("a new offer is valid for 30 days from its issue date", () => {
  const draft = seed();
  draft.issuedAt = "2026-08-01";
  assert.equal(buildOfferFromDraft(draft, baseOptions)!.validUntil, "2026-08-31");
});

test("moving the issue date of a saved offer moves valid-until by as many days", () => {
  const existing = { ...buildOfferFromDraft(seed(), baseOptions)!, status: "sent" } as InvoiceOffer;
  const draft = draftFromOffer(existing, { defaultTitle: "x", todayIso: "2026-10-01", fallbackTemplateId: "" });
  draft.issuedAt = "2026-08-05";
  const doc = buildOfferFromDraft(draft, { ...baseOptions, existing })!;
  assert.equal(doc.issuedAt, "2026-08-05");
  assert.equal(doc.validUntil, "2026-09-04");
  assert.equal(doc.status, "sent");
  assert.equal(doc.id, "io-1");
  assert.equal(doc.documentNumber, "CP-2026-001");
});

test("only a custom draft keeps a template id, falling back to the active one", () => {
  const plain = seed();
  plain.customTemplateId = "tpl-9";
  assert.equal(buildOfferFromDraft(plain, baseOptions)!.customTemplateId, null);
  const custom = seed({ mode: "custom", templateId: "" });
  assert.equal(buildOfferFromDraft(custom, { ...baseOptions, activeTemplateId: "tpl-2" })!.customTemplateId, "tpl-2");
  custom.customTemplateId = "tpl-7";
  assert.equal(buildOfferFromDraft(custom, baseOptions)!.customTemplateId, "tpl-7");
});

test("an issued external id and the creator survive an edit", () => {
  const existing = {
    ...buildOfferFromDraft(seed({ mode: "external" }), baseOptions)!,
    externalProvider: "superfaktura",
    externalId: "SF-1",
    createdBy: "Original"
  } as InvoiceOffer;
  const doc = buildOfferFromDraft(draftFromOffer(existing, { defaultTitle: "x", todayIso: "2026-10-01", fallbackTemplateId: "" }), {
    ...baseOptions,
    existing
  })!;
  assert.equal(doc.externalProvider, "superfaktura");
  assert.equal(doc.externalId, "SF-1");
  assert.equal(doc.createdBy, "Original");
});

test("a saved offer loads back into a draft whose rebuild matches it", () => {
  const draft = seed({ mode: "custom" });
  draft.subject = "Strecha";
  draft.warrantyText = "24 mesiacov";
  draft.items = [patchLine(customLine("a", 20), { name: "Plech", unitPrice: 40 })];
  const saved = buildOfferFromDraft(draft, baseOptions)!;
  const reloaded = draftFromOffer(saved, { defaultTitle: "x", todayIso: "2026-10-01", fallbackTemplateId: "" });
  const rebuilt = buildOfferFromDraft(reloaded, { ...baseOptions, existing: saved })!;
  assert.deepEqual(rebuilt, saved);
});

test("loading an offer with no benefit cards gives the editor blank slots to fill", () => {
  const saved = { ...buildOfferFromDraft(seed(), baseOptions)!, uspCards: [] } as InvoiceOffer;
  const draft = draftFromOffer(saved, { defaultTitle: "x", todayIso: "2026-10-01", fallbackTemplateId: "" });
  assert.equal(draft.uspCards.length, blankUspCards().length);
});

test("the editing view keeps what was typed, the preview view hides what is blank", () => {
  const draft = seed();
  draft.subject = "  ";
  draft.warrantyText = " ";
  draft.uspCards = [{ title: "", subtitle: "" }];
  const editing = offerForEditing(draft, { ...baseOptions, lead: null });
  assert.equal(editing.warrantyText, " ");
  assert.equal(editing.uspCards.length, 1);
  assert.equal(editing.clientName, "");
  const preview = previewOfferFromDraft(draft, { ...baseOptions, lead: null, sampleClientName: "Ukážkový klient" });
  assert.equal(preview.warrantyText, null);
  assert.equal(preview.uspCards.length, 0);
  assert.equal(preview.clientName, "Ukážkový klient");
});

test("draftSignature notices an edit and ignores a re-render", () => {
  const draft = seed();
  const opened = draftSignature(draft, "superfaktura");
  assert.equal(draftSignature({ ...draft }, "superfaktura"), opened);
  assert.notEqual(draftSignature({ ...draft, subject: "x" }, "superfaktura"), opened);
  assert.notEqual(draftSignature(draft, "idoklad"), opened);
});

test("date helpers stay on the local calendar", () => {
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addDays("2026-08-01", 30), "2026-08-31");
  assert.equal(daysBetween("2026-08-01", "2026-08-05"), 4);
  assert.equal(addDays("garbage", 3), "garbage");
});

test("a new offer starts in the configured draft status, and keeps it on save", () => {
  const plain = seed();
  assert.equal(plain.status, "draft");
  const custom = seed({ status: "vypracovanie" });
  assert.equal(custom.status, "vypracovanie");
  assert.equal(buildOfferFromDraft(custom, baseOptions)!.status, "vypracovanie");
});

test("an offer being edited keeps its own status, even one the list no longer knows", () => {
  const saved = { ...buildOfferFromDraft(seed(), baseOptions)!, status: "imported_state" } as InvoiceOffer;
  const draft = draftFromOffer(saved, { defaultTitle: "Cenová ponuka", todayIso: "2026-08-01", fallbackTemplateId: "tpl-1" });
  assert.equal(buildOfferFromDraft(draft, { ...baseOptions, existing: saved })!.status, "imported_state");
});
