import React, { useMemo } from "react";
import { AlertTriangle, Link2 } from "lucide-react";
import type { Employee, RolePermission, UserProfile } from "../../types";
import { formatTranslation, getTranslation } from "../../utils/translations";
import { asLang } from "../../utils/undoMessages";
import { loginsLinkedElsewhere, roleSeesEveryEmployee, suggestUserForEmployee } from "../../utils/employeeLink";

interface LinkedUserPickerProps {
  /** The login linked now (users.id), or null. */
  value: string | null | undefined;
  onChange: (userId: string | null) => void;
  users: UserProfile[];
  /** All employees, to hide logins that already belong to another record. */
  employees: Employee[];
  roles: RolePermission[];
  /** This record's id (absent while creating) and e-mail, for the suggestion. */
  employeeId?: string | null;
  employeeEmail?: string | null;
  /** Admin, or employees + pm_managers at edit. Everyone else sees the link read-only. */
  canLink: boolean;
  systemLanguage?: string;
  compact?: boolean;
}

/**
 * "Linked user account": ties a login to an employee record so the person sees their own data in
 * My employment. The e-mail match is offered as a suggestion only; nothing is linked until a person
 * with the right chooses it, and the server re-checks who may set the link and that a login maps to
 * at most one employee.
 */
export const LinkedUserPicker: React.FC<LinkedUserPickerProps> = ({
  value,
  onChange,
  users,
  employees,
  roles,
  employeeId,
  employeeEmail,
  canLink,
  systemLanguage = "en",
  compact = false,
}) => {
  const lang = asLang(systemLanguage);
  const tr = (key: string) => getTranslation(lang, key);

  const taken = useMemo(() => loginsLinkedElsewhere(employees, employeeId), [employees, employeeId]);
  const selectable = useMemo(() => users.filter((u) => u.id && (!taken.has(u.id) || u.id === value)), [users, taken, value]);
  const current = users.find((u) => u.id && u.id === value) ?? null;
  const suggestion = useMemo(
    () => (value ? null : suggestUserForEmployee(users, employees, employeeId, employeeEmail)),
    [value, users, employees, employeeId, employeeEmail]
  );
  const warn = current ? roleSeesEveryEmployee(roles, current.role) : false;

  const label = (
    <label className={`block ${compact ? "type-overline text-slate-500 mb-0.5" : "text-ui font-bold text-slate-600 mb-1.5"}`} htmlFor="employee-linked-user">
      {tr("employees.link.label")}
    </label>
  );

  if (!canLink) {
    return (
      <div data-testid="employee-link-readonly">
        {label}
        <div className="type-body text-slate-800">
          {current ? `${current.name} (${current.email})` : <span className="text-slate-400">{tr("employees.link.none")}</span>}
        </div>
        <p className="type-meta text-slate-500 mt-1">{tr("employees.link.no_permission")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="employee-link-picker">
      <div>
        {label}
        <select
          id="employee-linked-user"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
          className="w-full px-3 py-2 text-ui bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
        >
          <option value="">{tr("employees.link.none")}</option>
          {selectable.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email})
            </option>
          ))}
        </select>
        <p className="type-meta text-slate-500 mt-1">{tr("employees.link.hint")}</p>
      </div>

      {suggestion && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2" data-testid="employee-link-suggestion">
          <span className="type-meta text-sky-900">
            {formatTranslation(lang, "employees.link.suggestion", { name: suggestion.name, email: suggestion.email })}
          </span>
          <button
            type="button"
            onClick={() => onChange(suggestion.id ?? null)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-sky-600 text-white text-ui font-semibold hover:bg-sky-700 cursor-pointer"
          >
            <Link2 className="size-3.5" />
            {tr("employees.link.use_suggestion")}
          </button>
        </div>
      )}

      {warn && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2" data-testid="employee-link-warning" role="alert">
          <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
          <span className="type-meta text-amber-900">{tr("employees.link.warn_access")}</span>
        </div>
      )}
    </div>
  );
};
