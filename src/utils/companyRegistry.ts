// Company registry lookup — the shapes and the pure helpers.
//
// Every form in the app that asks for a company (new client, client profile,
// company billing identity, warehouse supplier, invoicing client) goes through
// here, so a name typed in one place resolves exactly as it does in the others.
// The requests themselves live in companyRegistryApi.ts, the same way license.ts
// and licenseApi.ts are split, which keeps this half unit-testable.
//
// The backend (/api/company_registry.php) merges RPO (api.statistics.sk —
// companies from orsr.sk AND sole traders from zrsr.sk) with RegisterUZ
// (registeruz.sk — DIČ and the statistical codes) for Slovakia, and ARES for
// Czechia, then hands back the normalised shapes below.

export type RegistryCountry = "SK" | "CZ";

/** Which register the entity sits in. `zrsr` = a freelancer / sole trader. */
export type RegistrySource = "orsr" | "zrsr" | "ares" | "other";

export interface CompanySuggestion {
  /** Which API the row came from — passed back verbatim when asking for details. */
  source: "rpo" | "ruz" | "ares";
  id: string;
  registerUzId: string;
  name: string;
  companyId: string;
  taxId: string;
  street: string;
  city: string;
  postalCode: string;
  register: RegistrySource;
  active: boolean;
}

export interface CompanyDetails {
  country: string;
  countryCode: RegistryCountry;
  name: string;
  companyId: string;
  taxId: string;
  vatId: string;
  street: string;
  city: string;
  postalCode: string;
  region: string;
  district: string;
  legalForm: string;
  legalFormCode: string;
  establishmentDate: string;
  dissolutionDate: string;
  skNace: string;
  organizationSize: string;
  ownershipType: string;
  dataSource: string;
  register: RegistrySource;
  registerLabel: string;
  registrationNumber: string;
  registrationOffice: string;
  /** Statutory body / the sole trader themselves — a ready-made contact person. */
  contactPerson: string;
  mainActivity: string;
  activities: string[];
  rpoId: string;
  registerUzId: string;
  active: boolean;
}

/** Shortest query the registers answer usefully. */
export const COMPANY_QUERY_MIN_LENGTH = 3;

/** How long to wait after the last keystroke before asking the registers. */
export const COMPANY_QUERY_DEBOUNCE_MS = 350;

/**
 * Maps a country as the forms store it ("Slovakia", "Czech Republic", "SK", …)
 * to a register we can query. `null` means "no registry for this country" —
 * callers then leave the field alone instead of showing an empty dropdown.
 */
export function registryCountryOf(country?: string | null): RegistryCountry | null {
  const value = (country || "").trim().toLowerCase();
  if (!value) return null;
  if (value === "sk" || value === "slovakia" || value === "slovensko" || value === "slovak republic") return "SK";
  if (value === "cz" || value.startsWith("czech") || value === "czechia" || value === "česko" || value === "cesko") return "CZ";
  return null;
}

/**
 * True when what the user typed looks like an identifier rather than a name —
 * an IČO, a DIČ, or an IČ DPH with its country prefix. Used to decide whether a
 * short numeric query is worth sending.
 */
export function looksLikeIdentifier(query: string): boolean {
  return /^(sk|cz)?[\s\d]+$/i.test(query.trim()) && /\d/.test(query);
}

/** Strips the country prefix and spacing off an IČ DPH so it can be searched as a DIČ. */
export function identifierDigits(query: string): string {
  return query.replace(/\D+/g, "");
}

export function isCompanyQuerySearchable(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length < COMPANY_QUERY_MIN_LENGTH) return false;
  if (looksLikeIdentifier(trimmed)) return identifierDigits(trimmed).length >= COMPANY_QUERY_MIN_LENGTH;
  return true;
}

/** "IČO 31333532 · DIČ 2020317068 · Bratislava" — the dropdown's second line. */
export function suggestionSubtitle(item: CompanySuggestion): string {
  return [
    item.companyId ? `IČO ${item.companyId}` : "",
    item.taxId ? `DIČ ${item.taxId}` : "",
    [item.street, item.city].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Short badge telling a company apart from a freelancer in the dropdown. */
export function registerLabel(register: RegistrySource, language?: string | null): string {
  const sk = language === "sk";
  const hu = language === "hu";
  switch (register) {
    case "orsr":
      return sk ? "OR SR" : hu ? "Cégjegyzék" : "Business reg.";
    case "zrsr":
      return sk ? "ŽR SR" : hu ? "Egyéni váll." : "Sole trader";
    case "ares":
      return "ARES";
    default:
      return "";
  }
}

/** The address a form stores, assembled from the registry's parts. */
export interface CompanyAddressFields {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export function companyAddressFields(details: CompanyDetails): CompanyAddressFields {
  return {
    street: details.street || "",
    city: details.city || "",
    postalCode: details.postalCode || "",
    country: details.country || "",
  };
}

/**
 * The registry values a Lead (client) record can hold. Kept as its own function
 * so the new-client form, the client profile and the invoicing wizard all fill
 * exactly the same set of fields from the same source.
 *
 * Only non-empty values are returned: a registry that does not publish DIČ for
 * sole traders must not wipe a DIČ the user typed by hand.
 */
export function companyDetailsToLeadFields(details: CompanyDetails): Record<string, string> {
  const fields: Record<string, string> = {
    name: details.name,
    companyId: details.companyId,
    taxId: details.taxId,
    vatId: details.vatId,
    street: details.street,
    city: details.city,
    postalCode: details.postalCode,
    country: details.country,
    establishmentDate: details.establishmentDate,
    legalForm: details.legalForm,
    skNace: details.skNace,
    organizationSize: details.organizationSize,
    ownershipType: details.ownershipType,
    dataSource: details.dataSource,
    dissolutionDate: details.dissolutionDate,
    region: details.region,
    district: details.district,
    contactPerson: details.contactPerson,
  };

  for (const key of Object.keys(fields)) {
    if (!fields[key]) delete fields[key];
  }
  return fields;
}
