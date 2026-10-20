import React, { useId, useMemo } from "react";
import type { Employee } from "../../types";
import { CustomSelect } from "../ui/CustomSelect";
import {
  DEFAULT_DEPARTMENTS,
  DEFAULT_POSITIONS,
  EMPLOYEE_KINDS,
  fieldSuggestions,
  type EmployeeIdentity,
  type EmployeeKind,
} from "../../utils/employeeIdentity";

interface Props {
  value: EmployeeIdentity;
  onChange: (patch: Partial<EmployeeIdentity>) => void;
  /** The roster, for the position / department suggestions. */
  employees: Employee[];
  t: (en: string, sk: string, hu: string) => string;
  language?: string;
  /** Smaller inputs for the in-place editor on the detail page. */
  compact?: boolean;
}

/**
 * Name, record kind, job position and department of a staff record. A person has a first name
 * and a surname; a contractor or ledger item has one name field. Position and department take
 * any text and suggest what the roster already uses. (The app permission role is not here: it
 * belongs to the linked login.)
 */
export const EmployeeIdentityFields: React.FC<Props> = ({ value, onChange, employees, t, language, compact }) => {
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

  const kindLabel: Record<EmployeeKind, string> = {
    employee: t("Employee", "Zamestnanec", "Alkalmazott"),
    contractor: t("External supplier (company)", "Externý dodávateľ (firma)", "Külső beszállító (cég)"),
    ledger: t("Accounting item", "Účtovná položka", "Könyvelési tétel"),
  };

  const label = compact ? "type-overline text-slate-500 block mb-0.5" : "block text-ui font-bold text-slate-600 mb-1.5";
  const input = compact
    ? "w-full px-2.5 py-1.5 text-ui bg-slate-50 border border-slate-200 rounded-xl focus:border-[#c29b62] focus:outline-none"
    : "w-full px-4 py-2.5 text-body bg-white border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm font-medium";
  const person = value.kind === "employee";

  return (
    <>
      <div className={compact ? "col-span-2" : "ws-sm:col-span-2"}>
        <label className={label}>{t("Record type", "Typ záznamu", "Rekord típusa")}</label>
        <CustomSelect
          value={value.kind}
          onChange={(k) => onChange({ kind: k as EmployeeKind })}
          options={EMPLOYEE_KINDS.map((k) => ({ value: k, label: kindLabel[k] }))}
          size={compact ? "sm" : "md"}
        />
      </div>

      {person ? (
        <>
          <div>
            <label className={label} htmlFor={`${uid}-first`}>{t("First name", "Meno", "Keresztnév")} *</label>
            <input
              id={`${uid}-first`}
              type="text"
              required
              value={value.firstName}
              onChange={(e) => onChange({ firstName: e.target.value })}
              placeholder="Peter"
              autoComplete="off"
              className={input}
            />
          </div>
          <div>
            <label className={label} htmlFor={`${uid}-last`}>{t("Last name", "Priezvisko", "Vezetéknév")} *</label>
            <input
              id={`${uid}-last`}
              type="text"
              required
              value={value.lastName}
              onChange={(e) => onChange({ lastName: e.target.value })}
              placeholder="Varga"
              autoComplete="off"
              className={input}
            />
          </div>
        </>
      ) : (
        <div className={compact ? "col-span-2" : "ws-sm:col-span-2"}>
          <label className={label} htmlFor={`${uid}-company`}>
            {value.kind === "contractor"
              ? t("Company name", "Názov firmy", "Cégnév")
              : t("Item name", "Názov položky", "Tétel neve")} *
          </label>
          <input
            id={`${uid}-company`}
            type="text"
            required
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={value.kind === "contractor" ? "Dodigital s.r.o." : t("Commission", "Provízia", "Jutalék")}
            autoComplete="off"
            className={input}
          />
        </div>
      )}

      <div>
        <label className={label} htmlFor={`${uid}-position`}>{t("Position", "Pozícia", "Pozíció")}</label>
        <input
          id={`${uid}-position`}
          type="text"
          list={`${uid}-positions`}
          value={value.position}
          onChange={(e) => onChange({ position: e.target.value })}
          placeholder={t("Pick or type a new one", "Vyberte alebo napíšte novú", "Válasszon vagy írjon újat")}
          autoComplete="off"
          className={input}
        />
        <datalist id={`${uid}-positions`}>
          {positions.map((p) => <option key={p} value={p} />)}
        </datalist>
      </div>
      <div>
        <label className={label} htmlFor={`${uid}-department`}>{t("Department / team", "Oddelenie / tím", "Osztály / csapat")}</label>
        <input
          id={`${uid}-department`}
          type="text"
          list={`${uid}-departments`}
          value={value.department}
          onChange={(e) => onChange({ department: e.target.value })}
          placeholder={t("Pick or type a new one", "Vyberte alebo napíšte nové", "Válasszon vagy írjon újat")}
          autoComplete="off"
          className={input}
        />
        <datalist id={`${uid}-departments`}>
          {departments.map((d) => <option key={d} value={d} />)}
        </datalist>
      </div>
    </>
  );
};
