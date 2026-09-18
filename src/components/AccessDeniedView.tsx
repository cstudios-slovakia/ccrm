import React from "react";
import { ShieldOff, ArrowRight, UserCog, LogOut } from "lucide-react";

interface AccessDeniedViewProps {
  systemLanguage: "en" | "sk" | "hu" | string;
  /** The first route the user may open, or null when the account can open nothing. */
  fallbackRoute: string | null;
  onNavigate: (route: string) => void;
  roleName?: string;
  /** False when the user's role is missing from the role registry altogether. */
  hasKnownRole: boolean;
  /** Offered when the account can open nothing at all. */
  onLogout?: () => void;
}

/**
 * Shown by the router in place of a view the current role may not open — a
 * direct hash, a stale bookmark, or a permission revoked while the tab was
 * open. The sidebar already hides such routes; this is the second line.
 */
export const AccessDeniedView: React.FC<AccessDeniedViewProps> = ({
  systemLanguage,
  fallbackRoute,
  onNavigate,
  roleName,
  hasKnownRole,
  onLogout,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  const routeLabels: Record<string, [string, string, string]> = {
    dashboard: ["Dashboard", "Nástenka", "Irányítópult"],
    tasks: ["Tasks", "Úlohy", "Feladatok"],
    leads: ["Leads", "Leady", "Érdeklődők"],
    clients: ["Clients", "Klienti", "Ügyfelek"],
    projects: ["Projects", "Projekty", "Projektek"],
    invoices: ["Invoices & Offers", "Cenové ponuky & Faktúry", "Ajánlatok és számlák"],
    warehouse: ["Warehouse", "Sklad", "Raktár"],
    financial: ["Financial Management", "Financie", "Pénzügyek"],
    meetings: ["Meetings", "Stretnutia", "Megbeszélések"],
    files: ["Files", "Súbory", "Fájlok"],
    email: ["Mail Client", "Pošta", "Levelezés"],
    automation: ["Automation", "Automatizácia", "Automatizálás"],
    overview: ["Analytics", "Analytika", "Elemzések"],
    updates: ["Updates", "Novinky", "Újdonságok"],
    settings: ["Settings", "Nastavenia", "Beállítások"],
    "personal-settings": ["Personal Settings", "Osobné nastavenia", "Személyes beállítások"],
  };

  const fallbackLabel = fallbackRoute && routeLabels[fallbackRoute] ? t(...routeLabels[fallbackRoute]) : null;
  const canGoSomewhere = Boolean(fallbackRoute);
  // Personal settings is open to every signed-in user, so it is always a way out
  // — even for an account that can open no module at all.
  const showPersonalSettings = fallbackRoute !== "personal-settings";

  return (
    <div className="flex-1 min-h-[60vh] flex items-center justify-center animate-in fade-in duration-300">
      <div className="glass-panel w-full max-w-lg rounded-3xl border border-white/60 bg-white/95 shadow-glass p-10 flex flex-col items-center text-center select-none">
        <div className="h-16 w-16 rounded-2xl bg-rose-50 border border-rose-100 text-rose-500 flex items-center justify-center mb-6 shadow-sm">
          <ShieldOff className="h-8 w-8" />
        </div>

        <h2 className="text-xl font-heading font-black uppercase tracking-tight text-slate-800">
          {t("No access to this section", "K tejto sekcii nemáte prístup", "Nincs hozzáférése ehhez a szakaszhoz")}
        </h2>

        <p className="mt-3 text-sm text-slate-500 font-medium leading-relaxed max-w-sm">
          {hasKnownRole
            ? t(
                "An administrator can grant it in Settings → Roles & permissions.",
                "Administrátor vám ho môže udeliť v Nastavenia → Roly a oprávnenia.",
                "Egy adminisztrátor megadhatja a Beállítások → Szerepkörök és jogosultságok részben.",
              )
            : t(
                `Your account's role "${roleName || "—"}" does not exist in the role registry — ask an administrator to assign a role.`,
                `Rola vášho účtu „${roleName || "—"}“ neexistuje v registri rolí — požiadajte administrátora o priradenie roly.`,
                `A fiókja „${roleName || "—"}” szerepköre nem létezik a szerepkör-nyilvántartásban — kérjen egy adminisztrátort a szerepkör hozzárendelésére.`,
              )}
        </p>

        {!canGoSomewhere && (
          <p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-400">
            {t(
              "This account currently has no access to any module.",
              "Tento účet momentálne nemá prístup k žiadnemu modulu.",
              "Ennek a fióknak jelenleg egyetlen modulhoz sincs hozzáférése.",
            )}
          </p>
        )}

        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
          {canGoSomewhere && fallbackRoute && (
            <button
              type="button"
              onClick={() => onNavigate(fallbackRoute)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider shadow-md shadow-indigo-600/20 transition-all active:scale-[0.98] cursor-pointer"
            >
              {fallbackLabel
                ? t(`Go to ${fallbackLabel}`, `Prejsť na ${fallbackLabel}`, `Ugrás: ${fallbackLabel}`)
                : t("Go back to the app", "Späť do aplikácie", "Vissza az alkalmazásba")}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
          {showPersonalSettings && (
            <button
              type="button"
              onClick={() => onNavigate("personal-settings")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-black uppercase tracking-wider shadow-sm transition-all active:scale-[0.98] cursor-pointer"
            >
              <UserCog className="h-4 w-4 text-slate-400" />
              {t("Personal settings", "Osobné nastavenia", "Személyes beállítások")}
            </button>
          )}
          {!canGoSomewhere && onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-700 hover:text-rose-600 text-xs font-black uppercase tracking-wider shadow-sm transition-all active:scale-[0.98] cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              {t("Log out", "Odhlásiť sa", "Kijelentkezés")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccessDeniedView;
