import type { ReactNode } from "react";
import type { InvoiceOffer, InvoiceOfferItem, UspCardItem } from "../../types";

/** Which required block failed when Issue was clicked. */
export type OfferSectionAlert = "client" | "items";

/**
 * Rose outline on the document block the toast is about.
 * The ring stays solid; only the halo breathes, so the lines themselves don't fade.
 */
export const OFFER_SECTION_ALERT_CLASS =
  "ring-2 ring-rose-500 ring-offset-2 rounded-lg animate-offer-section-alert motion-reduce:animate-none print:animate-none print:ring-0 print:shadow-none";

/**
 * What an offer template needs to turn itself into an editor.
 *
 * Passing it makes the template render every editable field in place, where it
 * will appear in the finished document. Leaving it out renders the document
 * exactly as it is printed and previewed — print and the preview modal never
 * pass it, so edit, preview and print cannot drift apart.
 */
export interface OfferEditing {
  /** Patches the draft. Anything the offer carries can be named. */
  onChange: (patch: Partial<InvoiceOffer>) => void;

  addItem: () => void;
  updateItem: (id: string, patch: Partial<InvoiceOfferItem>) => void;
  removeItem: (id: string) => void;

  addUsp: () => void;
  updateUsp: (index: number, patch: Partial<UspCardItem>) => void;
  removeUsp: (index: number) => void;

  /** VAT rates a line can be set to. */
  vatRates: number[];
  currencySymbol: string;

  /** The client picker, shown in the recipient block in place of the plain name. */
  renderClientPicker: () => ReactNode;
  /** Extras under the "Billed to" block (complete from the business register). */
  renderClientExtras?: () => ReactNode;
  /** Warehouse search under the line items table. */
  renderProductPicker?: () => ReactNode;

  /** Microcopy for the edit-only hints; the template does not own a translation table for them. */
  copy: {
    identityHint: string;
    noItems: string;
    addItem: string;
    addUsp: string;
    removeItem: string;
    removeUsp: string;
    priceRangeFrom: string;
    priceRangeTo: string;
    priceRangeHint: string;
    vat: string;
    discount: string;
    uspNeedsCard: string;
    optional: string;
    itemName: string;
    specification: string;
    qty: string;
    unit: string;
    unitPrice: string;
    uspTitle: (n: number) => string;
    uspSubtitle: string;
    paramPlaceholders: { duration: string; startDate: string; warranty: string };
  };
}
