import React from "react";
import { displayEmployeeName } from "../../utils/nameOrder";
import { User as UserIcon, X } from "lucide-react";
import { CustomSelect } from "../ui/CustomSelect";
import type { UserProfile } from "../../types";
import { projectEmployeeUserNames } from "../../utils/projectEmployees";
import type { Language } from "../../utils/translations";

/**
 * "Employees" in the project detail's left card, under the project manager: the people working on the
 * project, any number of them (the manager stays the one accountable). Stored as the same kind of id
 * as `Project.managers` (the person's name). Offers every user who is not a Project Manager. The dropdown adds one at a time and the chosen ones sit
 * above it as coloured chips with a cross; people already on the project as manager are not offered
 * again. Read-only for people who cannot edit the project.
 */
export const ProjectEmployeesField: React.FC<{
  userLanguage: Language;
  users: UserProfile[];
  value: string[];
  managers: string[];
  canEdit: boolean;
  onChange: (next: string[]) => void;
}> = ({ userLanguage, users, value, managers, canEdit, onChange }) => {
  const t = (en: string, sk: string, hu: string) => (userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en);
  const colorOf = (name: string) => users.find(u => u.name === name)?.color || "#64748b";
  const pool = projectEmployeeUserNames(users);
  const available = pool.filter(name => !value.includes(name) && !managers.includes(name));
  return (
    <div>
      <label className="block type-overline text-slate-400 mb-1">{t("Employees", "Zamestnanci", "Munkatársak")}</label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map(name => {
            const color = colorOf(name);
            return (
              <span
                key={name}
                className={`inline-flex items-center gap-1 pl-2.5 py-1 rounded-full border type-overline shadow-sm ${canEdit ? "pr-1" : "pr-2.5"}`}
                style={{ backgroundColor: `${color}15`, color, borderColor: `${color}30` }}
              >
                <UserIcon className="h-3 w-3 shrink-0" />
                <span className="truncate max-w-[10rem]">{displayEmployeeName(name)}</span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onChange(value.filter(m => m !== name))}
                    className="ml-0.5 p-0.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
                    title={t("Remove", "Odobrať", "Eltávolítás")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
      {canEdit && (
        <CustomSelect
          value=""
          onChange={name => {
            if (name && !value.includes(name)) onChange([...value, name]);
          }}
          disabled={available.length === 0}
          placeholder={
            available.length === 0
              ? t("Everyone is assigned", "Priradení sú všetci", "Mindenki hozzá van rendelve")
              : value.length > 0
                ? t("Add another employee...", "Pridať ďalšieho zamestnanca...", "További munkatárs hozzáadása...")
                : t("Assign an employee...", "Priradiť zamestnanca...", "Munkatárs kijelölése...")
          }
          options={available.map(name => ({
            value: name,
            label: displayEmployeeName(name),
            icon: <span className="h-2.5 w-2.5 rounded-full shrink-0 inline-block" style={{ backgroundColor: colorOf(name) }} />,
          }))}
        />
      )}
      {!canEdit && value.length === 0 && (
        <p className="text-ui font-semibold text-slate-300 italic">
          {t("No employees assigned yet.", "Zatiaľ nie sú priradení žiadni zamestnanci.", "Még nincs munkatárs hozzárendelve.")}
        </p>
      )}
    </div>
  );
};
