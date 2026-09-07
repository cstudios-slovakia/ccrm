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
  /**
   * How well the row matches the query — lower is better, scored by the backend.
   * It travels with the row so two single-register replies can be merged into one
   * correctly ordered list without the ranking rules being written twice.
   */
  rank?: number;
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

/** The inputs that search the registers: a trade name, an IČO, a DIČ or an IČ DPH. */
export type CompanyLookupField = "name" | "companyId" | "taxId" | "vatId";

/**
 * The countries the client and company forms offer. Only Slovakia and Czechia
 * have a register behind them; the rest are plain address data.
 */
export const EUROPEAN_COUNTRIES = [
  "Slovakia", "Hungary", "Austria", "Czechia", "Poland",
  "Germany", "France", "Italy", "Spain", "United Kingdom",
  "Netherlands", "Belgium", "Switzerland", "Czech Republic",
  "Bulgaria", "Croatia", "Cyprus", "Denmark", "Estonia",
  "Finland", "Greece", "Ireland", "Latvia", "Lithuania",
  "Luxembourg", "Malta", "Portugal", "Romania", "Slovenia",
  "Sweden"
];

/** Shortest query the registers answer usefully. */
export const COMPANY_QUERY_MIN_LENGTH = 3;

/** How long to wait after the last keystroke before asking the registers. */
export const COMPANY_QUERY_DEBOUNCE_MS = 350;

/** Rows in the dropdown. Matches CCRM_REGISTRY_MAX_RESULTS on the backend. */
export const COMPANY_MAX_SUGGESTIONS = 15;

/**
 * Lowercase, strip diacritics and collapse punctuation — the TypeScript twin of
 * ccrm_fold(), used only to break ties between rows of equal rank.
 */
export function foldCompanyName(value: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Folds one entity's two register rows into one.
 *
 * RPO wins on identity — it is the register of record for the name, the address
 * and which register the entity sits in — while RegisterUZ contributes the DIČ
 * and its own id, which RPO does not publish. Same rule as the backend applies
 * when it merges both replies itself.
 */
function combineSuggestions(a: CompanySuggestion, b: CompanySuggestion): CompanySuggestion {
  const base = a.source === "rpo" ? a : b.source === "rpo" ? b : a;
  const other = base === a ? b : a;
  const pick = (primary: string, fallback: string) => (primary && primary.trim() ? primary : fallback);

  return {
    ...base,
    name: pick(base.name, other.name),
    taxId: pick(base.taxId, other.taxId),
    registerUzId: pick(base.registerUzId, other.registerUzId),
    street: pick(base.street, other.street),
    city: pick(base.city, other.city),
    postalCode: pick(base.postalCode, other.postalCode),
    register: base.register !== "other" ? base.register : other.register,
    rank: Math.min(a.rank ?? 0, b.rank ?? 0)
  };
}

/**
 * Merges the replies of the separately queried registers into the single list the
 * dropdown shows: one row per IČO, ordered by the rank the backend assigned.
 *
 * Called again on every reply, so the list stays correct while the slow register
 * is still on its way — a caller can render after the first one lands.
 */
export function mergeCompanySuggestions(...groups: CompanySuggestion[][]): CompanySuggestion[] {
  const byCompanyId = new Map<string, CompanySuggestion>();
  const withoutId: CompanySuggestion[] = [];

  for (const group of groups) {
    for (const item of group || []) {
      if (!item) continue;
      if (!item.companyId) {
        withoutId.push(item);
        continue;
      }
      const seen = byCompanyId.get(item.companyId);
      byCompanyId.set(item.companyId, seen ? combineSuggestions(seen, item) : item);
    }
  }

  const merged = [...byCompanyId.values(), ...withoutId];
  merged.sort((a, b) => {
    const diff = (a.rank ?? 0) - (b.rank ?? 0);
    if (diff !== 0) return diff;
    return foldCompanyName(a.name).localeCompare(foldCompanyName(b.name));
  });

  return merged.slice(0, COMPANY_MAX_SUGGESTIONS);
}

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
 * Merges registry details into a client record. Every form that already holds a
 * Lead (the invoicing wizard, and anything else that refreshes a client from the
 * register) goes through here, so one pick fills the same fields everywhere.
 *
 * Empty registry values never overwrite what is already stored: sole traders
 * have no published DIČ, and losing a hand-typed one to a blank would be worse
 * than not filling it at all. The contact person is only ever added, never
 * replaced — a named buyer beats the statutory body.
 */
export function applyCompanyDetailsToLead<T extends CompanyBackedRecord>(lead: T, details: CompanyDetails): T {
  const keep = (next: string, current?: string) => next || current || "";

  return {
    ...lead,
    name: keep(details.name, lead.name),
    city: keep(details.city, lead.city),
    companyId: keep(details.companyId, lead.companyId),
    taxId: keep(details.taxId, lead.taxId),
    vatId: keep(details.vatId, lead.vatId),
    contactPerson: (lead.contactPerson || "").trim() || details.contactPerson || "",
    address: {
      ...(lead.address || {}),
      street: keep(details.street, lead.address?.street),
      city: keep(details.city, lead.address?.city),
      postalCode: keep(details.postalCode, lead.address?.postalCode),
      country: keep(details.country, lead.address?.country),
    },
    establishmentDate: keep(details.establishmentDate, lead.establishmentDate),
    legalForm: keep(details.legalForm, lead.legalForm),
    skNace: keep(details.skNace, lead.skNace),
    organizationSize: keep(details.organizationSize, lead.organizationSize),
    ownershipType: keep(details.ownershipType, lead.ownershipType),
    dataSource: keep(details.dataSource, lead.dataSource),
    dissolutionDate: keep(details.dissolutionDate, lead.dissolutionDate),
    region: keep(details.region, lead.region),
    district: keep(details.district, lead.district),
  };
}

/** The client-record fields the registry writes into — a structural subset of Lead. */
export interface CompanyBackedRecord {
  name: string;
  city: string;
  companyId?: string;
  taxId?: string;
  vatId?: string;
  contactPerson?: string;
  address?: {
    street?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
  establishmentDate?: string;
  legalForm?: string;
  skNace?: string;
  organizationSize?: string;
  ownershipType?: string;
  dataSource?: string;
  dissolutionDate?: string;
  region?: string;
  district?: string;
}
