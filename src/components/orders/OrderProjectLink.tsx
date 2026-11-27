import React, { useMemo } from "react";
import type { Lead, Order, Project } from "../../types";
import type { Language } from "../../utils/translations";
import { projectDisplayName } from "../../utils/projects";
import { partitionProjectsForOrder } from "../../utils/projectOrders";
import { EntityBadge } from "../tremor/EntityBadge";
import { CustomSelect } from "../ui/CustomSelect";

/** The project an order belongs to as a link that opens it, or nothing when it has none (or the project is gone). */
export const OrderProjectBadge: React.FC<{
  order: Pick<Order, "projectId">;
  projects?: Project[];
  leads: Lead[];
  language: Language;
}> = ({ order, projects, leads, language }) => {
  const project = order.projectId ? projects?.find(p => p.id === order.projectId) : undefined;
  if (!project) return null;
  const fallback = language === "sk" ? "Projekt" : language === "hu" ? "Projekt" : "Project";
  return (
    <EntityBadge
      entity="projects"
      label={projectDisplayName(project, leads, fallback)}
      onClick={() => { window.location.hash = `projects/${encodeURIComponent(project.id)}?tab=orders`; }}
      title={language === "sk" ? "Otvoriť projekt" : language === "hu" ? "Projekt megnyitása" : "Open project"}
      className="mt-1"
    />
  );
};

/** The order editor's "Project" field: a searchable, clearable picker with the order's customer's projects first. */
export const OrderProjectPicker: React.FC<{
  projectId: string | null | undefined;
  clientId: string | null | undefined;
  projects: Project[];
  leads: Lead[];
  language: Language;
  disabled?: boolean;
  onChange: (projectId: string | null) => void;
}> = ({ projectId, clientId, projects, leads, language, disabled, onChange }) => {
  const t = (en: string, sk: string, hu: string) => (language === "sk" ? sk : language === "hu" ? hu : en);
  const untitled = t("Untitled project", "Projekt bez názvu", "Névtelen projekt");
  const options = useMemo(() => {
    const { mine, others } = partitionProjectsForOrder(projects, clientId, leads);
    const toOption = (p: Project, group: string) => {
      const label = projectDisplayName(p, leads, untitled);
      return { value: p.id, label, searchText: label, group };
    };
    return [
      ...mine.map(p => toOption(p, "mine")),
      ...others.map(p => toOption(p, "others")),
    ];
  }, [projects, clientId, leads, untitled]);
  const groups = [
    { id: "mine", label: t("This customer's projects", "Projekty tohto zákazníka", "Az ügyfél projektjei") },
    { id: "others", label: t("Other projects", "Ostatné projekty", "Egyéb projektek") },
  ];
  // An id whose project is gone (deleted, or hidden from this user) is shown as unlinked, and picking clears it.
  const current = projectId && projects.some(p => p.id === projectId) ? projectId : "";
  return (
    <div className="space-y-1">
      <label className="type-overline text-gray-500 block">{t("Project", "Projekt", "Projekt")}</label>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <CustomSelect
            value={current}
            onChange={id => onChange(id || null)}
            disabled={disabled}
            placeholder={t("No project", "Bez projektu", "Nincs projekt")}
            searchPlaceholder={t("Search projects...", "Hľadať projekty...", "Projektek keresése...")}
            searchable
            groups={groups}
            options={options}
            className="w-full"
          />
        </div>
        {current && !disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="px-2.5 py-2 rounded-md text-caption font-semibold text-gray-500 hover:text-rose-600 hover:bg-rose-50 border border-gray-200 transition-all cursor-pointer shrink-0"
          >
            {t("Clear", "Zrušiť", "Törlés")}
          </button>
        )}
      </div>
    </div>
  );
};
