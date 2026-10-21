import React, { useId, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { Employee } from "../../types";
import { CustomSelect } from "../ui/CustomSelect";
import { CompanyLookupSpinner, CompanySuggestions } from "../ui/CompanySuggestions";
import { useCompanyLookup } from "../../utils/useCompanyLookup";
import { fetchCompanyDetailsByCompanyId } from "../../utils/companyRegistryApi";
import {
  registryCountryOf,
  type CompanyDetails,
  type CompanyLookupField,
  type CompanySuggestion,
} from "../../utils/companyRegistry";
import {
  DEFAULT_DEPARTMENTS,
  DEFAULT_POSITIONS,
  EMPLOYEE_KINDS,
  fieldSuggestions,
  hasPersonName,
  identityFromCompany,
  isSupplier,
  type EmployeeIdentity,
  type EmployeeKind,
} from "../../utils/employeeIdentity";

/** The registered address a lookup found, for the address card the parent form owns. */
export interface RegistryAddress {
  street: string;
  city: string;
  zip: string;
  country: string;
}

interface Props {
  value: EmployeeIdentity;
  onChange: (patch: Partial<EmployeeIdentity>) => void;
  /** The roster, for the position / department suggestions. */
  employees: Employee[];
  t: (en: string, sk: string, hu: string) => string;
  language?: string;
  /** Smaller inputs for the in-place editor on the detail page. */
  compact?: boolean;
  /** The country on the form, which decides the register a lookup asks (Slovakia when empty). */
  country?: string | null;
  /** Receives the registered address when a lookup finds one; leave out when the form has no address. */
  onRegistryAddress?: (address: RegistryAddress) => void;
}

type SupplierField = Extract<CompanyLookupField, "name" | "companyId" | "taxId" | "vatId">;

/**
 * Name, record kind, job position and department of a staff record. A person has a first name
 * and a surname; a ledger item has one name field. An external supplier, a company or a sole
 * trader, has both: the trade name, a contact person, and the IČO / DIČ / IČ DPH, which the
 * business register fills in (the same lookup the client and supplier forms use). Position and
 * department take any text and suggest what the roster already uses. (The app permission role is
 * not here: it belongs to the linked login.)
 */
export const EmployeeIdentityFields: React.FC<Props> = ({
  value,
  onChange,
  employees,
  t,
  language,
  compact,
  country,
  onRegistryAddress,
}) => {
  const uid = useId();
  const lang = language === "sk" || language === "hu" ? language : "en";
  const positions = useMemo(
    () => fieldSuggestions(employees, "position", DEFAULT_POSITIONS[lang]),
    [employees, lang]
  );
  const departments = useMemo(
    () => fieldSuggestions(employees, "department", DEFAULT_DEPARTMENTS[lang]),
    [employees, lang]
  );

  const supplier = isSupplier(value.kind);
  const lookupCountry = country?.trim() ? country : "Slovakia";
  const lookup = useCompanyLookup<SupplierField>({ country: lookupCountry, enabled: supplier });
  const [isFetching, setIsFetching] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  // A picked suggestion resolves asynchronously; merge into the identity as it is then, not as it was.
  const valueRef = useRef(value);
  valueRef.current = value;

  const kindLabel: Record<EmployeeKind, string> = {
    employee: t("Employee", "Zamestnanec", "Alkalmazott"),
    contractor: t("External supplier", "Externý dodávateľ", "Külső beszállító"),
    ledger: t("Accounting item", "Účtovná položka", "Könyvelési tétel"),
  };

  const label = compact ? "type-overline text-slate-500 block mb-0.5" : "block text-ui font-bold text-slate-600 mb-1.5";
  const input = compact
    ? "w-full px-2.5 py-1.5 text-ui bg-slate-50 border border-slate-200 rounded-xl focus:border-[#c29b62] focus:outline-none"
    : "w-full px-4 py-2.5 text-body bg-white border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm font-medium";
  const wide = compact ? "col-span-2" : "ws-sm:col-span-2";
  const personName = hasPersonName(value.kind);

  const toast = (message: string, tone?: "error") => {
    if (typeof (window as any).showToast === "function") (window as any).showToast(message, tone);
  };

  const applyDetails = (details: CompanyDetails) => {
    setLookupError(null);
    onChange(identityFromCompany(valueRef.current, details));
    if (onRegistryAddress && (details.street || details.city || details.postalCode)) {
      onRegistryAddress({
        street: details.street,
        city: details.city,
        zip: details.postalCode,
        country: details.country,
      });
    }
    toast(t("Supplier details loaded from the business register.", "Údaje dodávateľa boli načítané z registra.", "A beszállító adatai betöltve a cégjegyzékből."));
  };

  const pickSuggestion = async (item: CompanySuggestion) => {
    let details = await lookup.select(item, lookupCountry);
    // The picked row's own id can fail where the bare IČO still resolves (the register's per-entity
    // endpoint is the flakier one), so try the number before giving up.
    if (!details && item.companyId) {
      details = await fetchCompanyDetailsByCompanyId(item.companyId, registryCountryOf(lookupCountry) ? lookupCountry : null).catch(() => null);
    }
    if (details) {
      applyDetails(details);
      return;
    }
    // The detail lookup failed: keep what the picked row already carried.
    const cur = valueRef.current;
    onChange({
      name: item.name || cur.name,
      companyId: item.companyId || cur.companyId,
      taxId: item.taxId || cur.taxId,
      vatId: item.taxId ? `${registryCountryOf(lookupCountry) === "CZ" ? "CZ" : "SK"}${item.taxId}` : cur.vatId,
    });
    setLookupError(t("Error loading company details.", "Chyba pri načítaní údajov z registra.", "Hiba a cégadatok betöltésekor."));
  };

  /** The Auto-fill button: one IČO, no suggestion picked. */
  const fetchByCompanyId = async () => {
    const ico = value.companyId.replace(/\D+/g, "");
    if (ico.length < 6) {
      setLookupError(t("Enter a valid 8-digit IČO first.", "Zadajte platné 8-miestne IČO.", "Adjon meg érvényes 8 jegyű cégazonosítót."));
      return;
    }
    setIsFetching(true);
    setLookupError(null);
    try {
      // Without a known country the number is tried against both registers.
      const details = await fetchCompanyDetailsByCompanyId(ico, registryCountryOf(lookupCountry) ? lookupCountry : null);
      if (details) applyDetails(details);
      else setLookupError(t("Company not found in the Slovak or Czech business register.", "Spoločnosť sa nenašla v obchodnom registri (SR ani ČR).", "A vállalat nem található a cégjegyzékben."));
    } catch (err) {
      console.warn("Register fetch failed", err);
      setLookupError(t("Lookup failed. Please enter details manually.", "Vyhľadávanie v registri zlyhalo. Vyplňte údaje ručne.", "A lekérdezés sikertelen."));
    } finally {
      setIsFetching(false);
    }
  };

  /** One register-backed input: a spinner while it searches and the suggestion list beneath it. */
  const registryInput = (field: SupplierField, props: { value: string; placeholder?: string; mono?: boolean; id?: string; required?: boolean }) => (
    <>
      <div className="relative">
        <input
          id={props.id}
          type="text"
          required={props.required}
          value={props.value}
          onChange={(e) => {
            onChange({ [field]: e.target.value });
            setLookupError(null);
            lookup.search(field, e.target.value, lookupCountry);
          }}
          placeholder={props.placeholder}
          autoComplete="off"
          className={`${input} pr-9 ${props.mono ? "font-mono" : ""}`}
        />
        <CompanyLookupSpinner visible={lookup.isLoading && lookup.activeField === field} />
      </div>
      <CompanySuggestions
        suggestions={lookup.suggestions}
        visible={lookup.activeField === field}
        onSelect={pickSuggestion}
        onDismiss={lookup.close}
        systemLanguage={lang}
      />
    </>
  );

  /**
   * A free-text field that suggests what the roster already uses: the same searchable dropdown as
   * the lead / client picker, whose "+" takes the typed text as a new value. A value that is not on
   * the roster yet (just typed, or from an older record) is kept in the list so it still shows.
   */
  const suggestPicker = (
    list: string[],
    current: string,
    set: (next: string) => void,
    copy: { placeholder: string; addLabel: string }
  ) => (
    <CustomSelect
      searchable
      value={current}
      onChange={set}
      onCreate={set}
      options={[
        { value: "", label: t("-- None --", "-- Žiadny --", "-- Nincs --") },
        ...(current && !list.includes(current) ? [current] : []),
        ...list,
      ]}
      placeholder={copy.placeholder}
      addNewLabel={copy.addLabel}
      size={compact ? "sm" : "md"}
    />
  );

  return (
    <>
      <div className={wide}>
        <label className={label}>{t("Record type", "Typ záznamu", "Rekord típusa")}</label>
        <CustomSelect
          value={value.kind}
          onChange={(k) => onChange({ kind: k as EmployeeKind })}
          options={EMPLOYEE_KINDS.map((k) => ({ value: k, label: kindLabel[k] }))}
          size={compact ? "sm" : "md"}
        />
      </div>

      {supplier && (
        <>
          <div className={`${wide} relative`}>
            <label className={label} htmlFor={`${uid}-company`}>
              {t("Company / trade name", "Názov firmy / obchodné meno", "Cégnév / vállalkozás neve")} *
            </label>
            {registryInput("name", { id: `${uid}-company`, value: value.name, placeholder: "Dodigital s.r.o.", required: true })}
          </div>

          <div className={`${wide} relative`}>
            <label className={label} htmlFor={`${uid}-ico`}>IČO</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                {registryInput("companyId", { id: `${uid}-ico`, value: value.companyId, placeholder: "48123456", mono: true })}
              </div>
              <button
                type="button"
                disabled={isFetching || lookup.isResolving}
                onClick={fetchByCompanyId}
                className={`shrink-0 flex items-center gap-1.5 font-bold text-white bg-gradient-to-r from-[#c29b62] to-[#b58b4c] hover:shadow-md disabled:opacity-50 transition cursor-pointer ${
                  compact ? "px-2.5 py-1.5 text-ui rounded-xl" : "px-4 py-2.5 text-body rounded-2xl"
                }`}
              >
                {isFetching || lookup.isResolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{t("Auto-Fill", "Načítať z registra", "Kitöltés")}</span>
              </button>
            </div>
            {lookupError && <p className="text-caption text-rose-600 mt-1">{lookupError}</p>}
          </div>

          <div className="relative">
            <label className={label} htmlFor={`${uid}-dic`}>DIČ</label>
            {registryInput("taxId", { id: `${uid}-dic`, value: value.taxId, mono: true })}
          </div>
          <div className="relative">
            <label className={label} htmlFor={`${uid}-icdph`}>IČ DPH</label>
            {registryInput("vatId", { id: `${uid}-icdph`, value: value.vatId, mono: true })}
          </div>
        </>
      )}

      {personName ? (
        <>
          <div>
            <label className={label} htmlFor={`${uid}-first`}>
              {supplier ? t("Contact person: first name", "Kontaktná osoba: meno", "Kapcsolattartó: keresztnév") : t("First name", "Meno", "Keresztnév")}
              {!supplier && " *"}
            </label>
            <input
              id={`${uid}-first`}
              type="text"
              required={!supplier}
              value={value.firstName}
              onChange={(e) => onChange({ firstName: e.target.value })}
              placeholder="Peter"
              autoComplete="off"
              className={input}
            />
          </div>
          <div>
            <label className={label} htmlFor={`${uid}-last`}>
              {supplier ? t("Contact person: last name", "Kontaktná osoba: priezvisko", "Kapcsolattartó: vezetéknév") : t("Last name", "Priezvisko", "Vezetéknév")}
              {!supplier && " *"}
            </label>
            <input
              id={`${uid}-last`}
              type="text"
              required={!supplier}
              value={value.lastName}
              onChange={(e) => onChange({ lastName: e.target.value })}
              placeholder="Varga"
              autoComplete="off"
              className={input}
            />
          </div>
        </>
      ) : (
        <div className={wide}>
          <label className={label} htmlFor={`${uid}-company`}>{t("Item name", "Názov položky", "Tétel neve")} *</label>
          <input
            id={`${uid}-company`}
            type="text"
            required
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={t("Commission", "Provízia", "Jutalék")}
            autoComplete="off"
            className={input}
          />
        </div>
      )}

      <div>
        <label className={label}>{t("Position", "Pozícia", "Pozíció")}</label>
        {suggestPicker(positions, value.position, (position) => onChange({ position }), {
          placeholder: t("Pick or type a new one", "Vyberte alebo napíšte novú", "Válasszon vagy írjon újat"),
          addLabel: t("Add the typed position", "Pridať napísanú pozíciu", "A beírt pozíció hozzáadása"),
        })}
      </div>
      <div>
        <label className={label}>{t("Department / team", "Oddelenie / tím", "Osztály / csapat")}</label>
        {suggestPicker(departments, value.department, (department) => onChange({ department }), {
          placeholder: t("Pick or type a new one", "Vyberte alebo napíšte nové", "Válasszon vagy írjon újat"),
          addLabel: t("Add the typed department", "Pridať napísané oddelenie", "A beírt osztály hozzáadása"),
        })}
      </div>
    </>
  );
};
