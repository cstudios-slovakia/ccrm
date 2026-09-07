// Company registry requests — the network half of the lookup; the shapes and
// pure helpers live in companyRegistry.ts.

import { fetchWithTimeout } from "./fetchWithTimeout";
import {
  identifierDigits,
  isCompanyQuerySearchable,
  registryCountryOf,
  type CompanyDetails,
  type CompanySuggestion,
  type RegistryCountry,
} from "./companyRegistry";

const SUGGEST_TIMEOUT_MS = 15000;
const DETAIL_TIMEOUT_MS = 20000;

export async function fetchCompanySuggestions(
  query: string,
  country: string | null | undefined,
  signal?: AbortSignal
): Promise<CompanySuggestion[]> {
  const registry = registryCountryOf(country);
  if (!registry || !isCompanyQuerySearchable(query)) return [];

  const url =
    `/api/company_registry.php?action=suggest&country=${registry}` +
    `&query=${encodeURIComponent(query.trim())}`;

  const res = await fetchWithTimeout(url, { signal }, SUGGEST_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Registry suggest failed (${res.status})`);

  const data = await res.json();
  return Array.isArray(data?.results) ? (data.results as CompanySuggestion[]) : [];
}

/** What identifies one entity to the detail endpoint: a picked suggestion, a bare IČO, or both. */
export interface CompanyDetailsQuery {
  source?: CompanySuggestion["source"] | "";
  id?: string;
  companyId?: string;
}

export async function fetchCompanyDetails(
  query: CompanyDetailsQuery,
  country: string | null | undefined,
  signal?: AbortSignal
): Promise<CompanyDetails | null> {
  const registry = registryCountryOf(country) || "SK";

  const url =
    `/api/company_registry.php?action=detail&country=${registry}` +
    `&source=${encodeURIComponent(query.source || "")}` +
    `&id=${encodeURIComponent(query.id || "")}` +
    `&ico=${encodeURIComponent(query.companyId || "")}`;

  const res = await fetchWithTimeout(url, { signal }, DETAIL_TIMEOUT_MS);
  if (!res.ok) return null;

  const data = await res.json();
  if (!data?.success) return null;
  return data as CompanyDetails;
}

/**
 * Details for a bare IČO — the "Auto-fill" button next to an IČO field, with no
 * suggestion picked first.
 */
export async function fetchCompanyDetailsByCompanyId(
  companyId: string,
  country: string | null | undefined,
  signal?: AbortSignal
): Promise<CompanyDetails | null> {
  const ico = identifierDigits(companyId);
  if (!ico) return null;

  // Without a country the caller does not know which register owns the number,
  // so try Slovakia first and fall back to Czechia — an 8-digit IČO looks the
  // same on both sides of the border.
  const registry = registryCountryOf(country);
  const order: RegistryCountry[] = registry ? [registry] : ["SK", "CZ"];

  for (const candidate of order) {
    const details = await fetchCompanyDetails(
      { source: candidate === "CZ" ? "ares" : "", companyId: ico },
      candidate,
      signal
    );
    if (details) return details;
  }
  return null;
}
