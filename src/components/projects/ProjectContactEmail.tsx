import React, { useId } from "react";
import type { Language } from "../../utils/translations";

/**
 * "Contact e-mail" next to the contact phone in the project detail's left card. It is filled from the
 * lead when the lead is converted to a project (or paired with one) and stays free to edit. Edited in
 * place like the phone: the project's autosave writes it, read-only for people who cannot edit.
 */
export const ProjectContactEmail: React.FC<{
  userLanguage: Language;
  value: string;
  canEdit: boolean;
  onChange: (value: string) => void;
}> = ({ userLanguage, value, canEdit, onChange }) => {
  const t = (en: string, sk: string, hu: string) => (userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en);
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block type-overline text-slate-400 mb-1">
        {t("Contact e-mail", "E-mail kontaktu", "Kapcsolattartó e-mail-címe")}
      </label>
      <input
        id={id}
        type="email"
        value={value}
        readOnly={!canEdit}
        onChange={e => onChange(e.target.value)}
        placeholder={canEdit ? "name@example.com" : "—"}
        className="w-full max-w-64 px-3 py-2 rounded-xl border-2 border-slate-200 bg-slate-50 text-body font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-emerald-500 transition-all read-only:bg-transparent read-only:border-transparent read-only:pl-0"
      />
    </div>
  );
};
