import { useMemo } from "react";
import type { RolePermission, UserProfile } from "../../types";
import { ADMIN_ROLE_NAME, buildAccess } from "../../utils/permissions";
import type { TFn } from "../../utils/timeTracking.ts";
import { SettingsCard } from "./SettingsCard";

/** What each line asks the permission registry; the admin role always passes. Read-only: roles are edited in Users & roles. */
const LINES = [
  { id: "costs", keys: ["time_tracking_costs"] },
  { id: "team", keys: ["time_tracking_team", "time_tracking"] },
  { id: "salary", keys: ["time_tracking_salary_report"] },
] as const;

/** Settings → Time tracking → "Who sees what" (canvas S6): the roles' real permissions as check / dash chips. */
export function WhoSeesWhatCard({ t, roles, canManageRoles }: { t: TFn; roles: RolePermission[]; canManageRoles: boolean }) {
  const titles = {
    costs: t("See other people's labour cost and rates", "Vidieť náklady na prácu a sadzby iných ľudí", "Mások munkaköltségének és díjainak megtekintése"),
    team: t("Edit other people's entries", "Upravovať záznamy iných ľudí", "Mások bejegyzéseinek szerkesztése"),
    salary: t("See salary allocation report", "Vidieť report rozdelenia miezd", "Bérallokációs riport megtekintése"),
  };
  const rows = useMemo(() => {
    const names = roles.some((r) => r.name === ADMIN_ROLE_NAME) ? roles.map((r) => r.name) : [ADMIN_ROLE_NAME, ...roles.map((r) => r.name)];
    return LINES.map((line) => ({
      ...line,
      roles: names.map((name) => ({ name, yes: line.keys.every((k) => { const a = buildAccess({ role: name } as UserProfile, roles); return k === "time_tracking" ? a.canEdit(k) : a.can(k); }) })),
    }));
  }, [roles]);
  return (
    <SettingsCard
      title={t("Who sees what", "Kto čo vidí", "Ki mit lát")}
      description={t("Read from each role's permissions.", "Načítané z oprávnení jednotlivých rolí.", "Az egyes szerepkörök jogosultságaiból olvasva.")}
      action={
        canManageRoles && <a href="#settings/access/roles" className="text-ui font-semibold text-entity-text hover:underline" data-testid="tt-who-sees-link">
          {t("Managed in Users & roles", "Spravuje sa v Používateľoch a rolách", "A Felhasználók és szerepkörök résznél kezelhető")}
        </a>
      }
      testId="tt-who-sees"
    >
      <div className="grid gap-4">
        {rows.map((row) => (
          <div key={row.id} className="grid gap-1.5" data-testid={`tt-who-${row.id}`}>
            <span className="text-ui font-semibold text-gray-900">{titles[row.id]}</span>
            <div className="flex flex-wrap gap-1.5">
              {row.roles.map((r) => (
                <span
                  key={r.name}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-micro font-semibold ${r.yes ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-500"}`}
                  data-yes={r.yes ? "1" : "0"}
                >
                  <span aria-hidden>{r.yes ? "✓" : "—"}</span>
                  {r.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SettingsCard>
  );
}
