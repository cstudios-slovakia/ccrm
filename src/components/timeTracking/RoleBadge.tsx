import type { TFn } from "../../utils/timeTracking.ts";
import type { TeamRoleBadge } from "../../utils/timeTeam.ts";

const TONE: Record<TeamRoleBadge, string> = {
  admin: "bg-slate-100 text-slate-700",
  manager: "bg-indigo-50 text-indigo-700",
  employee: "bg-emerald-50 text-emerald-700",
  contractor: "bg-teal-50 text-teal-700",
};

export function RoleBadge({ badge, t }: { badge: TeamRoleBadge; t: TFn }) {
  const label =
    badge === "admin"
      ? t("Admin", "Administrátor", "Admin")
      : badge === "manager"
        ? t("Manager", "Manažér", "Menedzser")
        : badge === "contractor"
          ? t("Contractor", "Dodávateľ", "Vállalkozó")
          : t("Employee", "Zamestnanec", "Alkalmazott");
  return <span className={`rounded-full px-2 py-0.5 text-micro font-semibold uppercase tracking-wide ${TONE[badge]}`}>{label}</span>;
}
