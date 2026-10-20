import type { CompanyBillingSettings } from "../types";
import { DEFAULT_STANDARD_VAT_RATE, DEFAULT_VAT_RATES } from "./vat.ts";

/**
 * `companyBillingSettings` is one stored object edited from two screens: the
 * company identity, bank and VAT live in Settings → Invoicing, the default
 * price-offer texts in the Price offers module. Each screen keeps a local copy
 * of the whole object while the user types, so saving the copy back as-is would
 * overwrite whatever the other screen saved in the meantime. Each save instead
 * merges only the fields it owns into the latest stored value.
 */
export const OFFER_DEFAULT_KEYS = [
  "defaultSocialProof",
  "defaultWarrantyText",
  "defaultDurationText",
  "defaultStartDateText",
  "defaultNextSteps",
  "defaultUspCards",
] as const satisfies readonly (keyof CompanyBillingSettings)[];

export type OfferDefaults = Pick<CompanyBillingSettings, (typeof OFFER_DEFAULT_KEYS)[number]>;

const EMPTY_USP_CARDS = () => [0, 1, 2, 3].map(() => ({ title: "", subtitle: "" }));

/** A blank billing record, for a tenant that has not opened Settings → Invoicing yet. */
export const blankBilling = (): CompanyBillingSettings => ({
  companyName: "",
  street: "",
  city: "",
  postalCode: "",
  country: "",
  companyId: "",
  taxId: "",
  vatId: "",
  email: "",
  phone: "",
  website: "",
  iban: "",
  swift: "",
  bankName: "",
  defaultPaymentDueDays: 14,
  defaultVatRate: DEFAULT_STANDARD_VAT_RATE,
  vatRates: [...DEFAULT_VAT_RATES],
  defaultWarrantyText: "",
  defaultDurationText: "",
  defaultStartDateText: "",
  defaultNextSteps: "",
  defaultSocialProof: "",
  defaultUspCards: EMPTY_USP_CARDS(),
});

/** The offer-text fields of a billing record, always with four USP cards. */
export const pickOfferDefaults = (billing: Partial<CompanyBillingSettings> | null | undefined): OfferDefaults => ({
  defaultSocialProof: billing?.defaultSocialProof ?? "",
  defaultWarrantyText: billing?.defaultWarrantyText ?? "",
  defaultDurationText: billing?.defaultDurationText ?? "",
  defaultStartDateText: billing?.defaultStartDateText ?? "",
  defaultNextSteps: billing?.defaultNextSteps ?? "",
  defaultUspCards: [0, 1, 2, 3].map(i => ({
    title: billing?.defaultUspCards?.[i]?.title ?? "",
    subtitle: billing?.defaultUspCards?.[i]?.subtitle ?? "",
  })),
});

/** Latest stored billing record with only the offer-text fields replaced. */
export const withOfferDefaults = (
  latest: CompanyBillingSettings | null,
  offerDefaults: OfferDefaults,
): CompanyBillingSettings => ({ ...(latest ?? blankBilling()), ...offerDefaults });

/** `edited` (the identity form) with the offer-text fields taken from the latest stored record. */
export const keepStoredOfferDefaults = (
  edited: CompanyBillingSettings,
  latest: CompanyBillingSettings | null,
): CompanyBillingSettings => ({ ...edited, ...(latest ? pickOfferDefaults(latest) : {}) });
