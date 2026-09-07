// Type-ahead company lookup shared by every form that asks for a company.
//
// One hook instance drives all the register-backed inputs of a single form
// (name, IČO, DIČ, IČ DPH): `search(field, value)` debounces and cancels in
// flight requests, `activeField` says which input the dropdown belongs to, and
// `select(item)` resolves the picked row into the full CompanyDetails record the
// form then spreads over its own state.
//
// A Slovak search asks the two registers separately and shows each reply as it
// lands, because they answer at wildly different speeds: RegisterUZ in ~0.15 s,
// RPO's name search in 4-15 s. Waiting for both would make every name lookup as
// slow as the slower one, so the list appears at once and the sole traders --
// which only RPO knows -- drop into it a few seconds later.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COMPANY_QUERY_DEBOUNCE_MS,
  isCompanyQuerySearchable,
  mergeCompanySuggestions,
  registryCountryOf,
  type CompanyDetails,
  type CompanySuggestion,
} from "./companyRegistry";
import { fetchCompanyDetails, fetchCompanySuggestions, type SuggestSource } from "./companyRegistryApi";

export interface UseCompanyLookupOptions {
  /** Country the form currently holds — decides which register is queried. */
  country?: string | null;
  /** Off for private persons, or while a form is read-only. */
  enabled?: boolean;
}

export interface CompanyLookup<Field extends string = string> {
  activeField: Field | null;
  suggestions: CompanySuggestion[];
  /** True until every register has answered — rows may already be showing. */
  isLoading: boolean;
  /** True while a picked suggestion is being expanded into full details. */
  isResolving: boolean;
  /** Debounced search; call it from the input's onChange. */
  search: (field: Field, value: string, country?: string | null) => void;
  /** Resolves a picked row. Returns null when the registry has nothing to add. */
  select: (item: CompanySuggestion, country?: string | null) => Promise<CompanyDetails | null>;
  /** Closes the dropdown without picking anything. */
  close: () => void;
}

export function useCompanyLookup<Field extends string = string>(
  options: UseCompanyLookupOptions = {}
): CompanyLookup<Field> {
  const { country, enabled = true } = options;

  const [activeField, setActiveField] = useState<Field | null>(null);
  const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Guards against a slow earlier response overwriting a newer one.
  const requestSeq = useRef(0);

  const cancelPending = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => cancelPending, [cancelPending]);

  const close = useCallback(() => {
    cancelPending();
    requestSeq.current += 1;
    setSuggestions([]);
    setActiveField(null);
    setIsLoading(false);
  }, [cancelPending]);

  const search = useCallback(
    (field: Field, value: string, countryOverride?: string | null) => {
      setActiveField(field);

      const target = countryOverride !== undefined ? countryOverride : country;
      cancelPending();

      if (!enabled || !registryCountryOf(target) || !isCompanyQuerySearchable(value)) {
        requestSeq.current += 1;
        setSuggestions([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setSuggestions([]);
      const seq = ++requestSeq.current;

      timerRef.current = setTimeout(() => {
        const controller = new AbortController();
        abortRef.current = controller;

        // Slovakia: the fast register and the slow one, asked in parallel and
        // rendered as they answer. Czechia is a single source, so one request.
        const sources: SuggestSource[] = registryCountryOf(target) === "SK" ? ["ruz", "rpo"] : [""];
        const replies: CompanySuggestion[][] = sources.map(() => []);
        let pending = sources.length;

        sources.forEach((source, index) => {
          fetchCompanySuggestions(value, target, controller.signal, source)
            .then(results => {
              if (seq !== requestSeq.current) return;
              replies[index] = results;
              setSuggestions(mergeCompanySuggestions(...replies));
            })
            .catch(err => {
              // One register being down or slow must not empty a list the other
              // one already filled.
              if ((err as { name?: string })?.name !== "AbortError") {
                console.error(`Company registry suggest failed (${source || "default"})`, err);
              }
            })
            .finally(() => {
              pending -= 1;
              if (pending === 0 && seq === requestSeq.current) setIsLoading(false);
            });
        });
      }, COMPANY_QUERY_DEBOUNCE_MS);
    },
    [cancelPending, country, enabled]
  );

  const select = useCallback(
    async (item: CompanySuggestion, countryOverride?: string | null): Promise<CompanyDetails | null> => {
      const target = countryOverride !== undefined ? countryOverride : country;
      cancelPending();
      requestSeq.current += 1;
      setSuggestions([]);
      setActiveField(null);
      setIsLoading(false);
      setIsResolving(true);
      try {
        return await fetchCompanyDetails(
          { source: item.source, id: item.id, companyId: item.companyId },
          target
        );
      } catch (err) {
        console.error("Company registry detail failed", err);
        return null;
      } finally {
        setIsResolving(false);
      }
    },
    [cancelPending, country]
  );

  return { activeField, suggestions, isLoading, isResolving, search, select, close };
}
