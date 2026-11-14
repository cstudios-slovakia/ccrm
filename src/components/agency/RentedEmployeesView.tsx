import React, { useMemo, useState } from "react";
import { AlertTriangle, Building2, CalendarDays, CheckCircle2, MapPin, Search, UserCheck } from "lucide-react";
import type { Lead } from "../../types";
import type { Language } from "../../utils/translations";
import type {
  AgencyPlacement,
  AgencyWorker,
  AgencyWorkerChecklistItem,
  AgencyWorkplace,
} from "../../types/agency";
import { summarizeWorkerCompliance } from "../../utils/agencyCalculations";
import type { AgencyRights } from "../../utils/agencyRights";
import { formatDateLocalized } from "../../utils/localTime";

interface RentedEmployeesViewProps {
  lang: Language;
  rights: AgencyRights;
  workers: AgencyWorker[];
  placements: AgencyPlacement[];
  workplaces: AgencyWorkplace[];
  checklists: AgencyWorkerChecklistItem[];
  clients: Lead[];
  onOpenWorker: (workerId: string) => void;
  onOpenSchedule: () => void;
}

export const RentedEmployeesView: React.FC<RentedEmployeesViewProps> = ({
  lang,
  rights,
  workers,
  placements,
  workplaces,
  checklists,
  clients,
  onOpenWorker,
  onOpenSchedule,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    lang === "sk" ? sk : lang === "hu" ? hu : en;

  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const workplaceMap = useMemo(() => new Map(workplaces.map((w) => [w.id, w])), [workplaces]);

  const activePlacementByWorker = useMemo(() => {
    const map = new Map<string, AgencyPlacement>();
    for (const pl of placements) {
      const existing = map.get(pl.workerId);
      if (!existing || (pl.status === "active" && existing.status !== "active")) {
        map.set(pl.workerId, pl);
      }
    }
    return map;
  }, [placements]);

  const complianceByWorker = useMemo(() => {
    const grouped = new Map<string, AgencyWorkerChecklistItem[]>();
    for (const c of checklists) {
      const arr = grouped.get(c.workerId) || [];
      arr.push(c);
      grouped.set(c.workerId, arr);
    }
    return grouped;
  }, [checklists]);

  const resolveWorkerCompanyId = (w: AgencyWorker): string => {
    if (w.targetCompanyClientId) return w.targetCompanyClientId;
    const raw = w.profile?.stayWork?.targetCompanyClientId;
    return typeof raw === "string" ? raw : "";
  };

  const resolveWorkerJobTitle = (w: AgencyWorker): string => {
    const raw = w.profile?.stayWork?.jobTitle;
    return typeof raw === "string" ? raw : "";
  };

  const companyOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const p of placements) {
      if (p.companyClientId) ids.add(p.companyClientId);
    }
    for (const w of workers) {
      const targetId = resolveWorkerCompanyId(w);
      if (targetId && (w.workerStatus === "rented" || w.stageId === "placed")) {
        ids.add(targetId);
      }
    }
    return Array.from(ids)
      .map((id) => ({ id, name: clientMap.get(id)?.name || id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [placements, workers, clientMap]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workers
      .map((w) => {
        const pl = activePlacementByWorker.get(w.id);
        const effectiveCompanyId = pl?.companyClientId || resolveWorkerCompanyId(w);
        return { worker: w, placement: pl, effectiveCompanyId };
      })
      .filter(({ worker, placement, effectiveCompanyId }) => {
        const isRented =
          worker.workerStatus === "rented" ||
          placement?.status === "active" ||
          worker.stageId === "placed";
        const isPastRented = Boolean(placement) || worker.workerStatus === "inactive";
        if (!showInactive && !isRented) return false;
        if (showInactive && !isRented && !isPastRented) return false;
        if (companyFilter !== "all" && effectiveCompanyId !== companyFilter) return false;
        if (!q) return true;
        const compName = effectiveCompanyId ? clientMap.get(effectiveCompanyId)?.name || "" : "";
        return (
          worker.fullName.toLowerCase().includes(q) ||
          worker.workerCode.toLowerCase().includes(q) ||
          compName.toLowerCase().includes(q) ||
          (placement?.jobRole || resolveWorkerJobTitle(worker)).toLowerCase().includes(q)
        );
      });
  }, [workers, activePlacementByWorker, showInactive, companyFilter, search, clientMap]);

  return (
    <div className="space-y-4" data-testid="agency-rented-workers-view">
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-56">
          <div className="relative flex-1 min-w-48 max-w-md">
            <Search className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Filter rented workers or companies…", "Filtrovať pracovníkov alebo firmy…", "Dolgozó vagy cég keresése…")}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-ui"
            />
          </div>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-ui"
          >
            <option value="all">{t("All Client Companies", "Všetky firmy", "Minden cég")}</option>
            {companyOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-1.5 text-caption text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            {t("Include past placements", "Aj ukončení", "Korábbiak is")}
          </label>
        </div>

        <button
          type="button"
          onClick={onOpenSchedule}
          className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-ui font-semibold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <CalendarDays className="size-4" />
          {t("Open Work Schedule", "Otvoriť rozpis zmien", "Műszakbeosztás")}
        </button>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-ui text-slate-500">
            {t("No rented employees found for the active filters.", "Žiadni prenajatí zamestnanci.", "Nincs kölcsönzött dolgozó.")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-micro font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">{t("Rented Employee", "Zamestnanec", "Dolgozó")}</th>
                  <th className="py-3 px-4">{t("Client Company & Workplace", "Firma a pracovisko", "Cég és telephely")}</th>
                  <th className="py-3 px-4">{t("Role & Start", "Pozícia a nástup", "Munkakör")}</th>
                  <th className="py-3 px-4">{t("Compliance", "Doklady", "Dokumentumok")}</th>
                  {rights.payments && <th className="py-3 px-4">{t("Rates", "Sadzby", "Díjak")}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ worker, placement, effectiveCompanyId }) => {
                  const comp = effectiveCompanyId ? clientMap.get(effectiveCompanyId) : undefined;
                  const wp = placement?.workplaceId ? workplaceMap.get(placement.workplaceId) : undefined;
                  const sum = summarizeWorkerCompliance(complianceByWorker.get(worker.id) || []);
                  const jobRole = placement?.jobRole || resolveWorkerJobTitle(worker);
                  return (
                    <tr
                      key={worker.id}
                      data-testid={`agency-rented-row-${worker.id}`}
                      onClick={() => onOpenWorker(worker.id)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="text-body font-semibold text-slate-900 flex items-center gap-2">
                          <UserCheck className="size-4 text-emerald-600 shrink-0" />
                          <span>{worker.fullName}</span>
                          {worker.workerCode && (
                            <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {worker.workerCode}
                            </span>
                          )}
                        </div>
                        <div className="text-micro text-slate-500">{worker.nationality || "—"}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-ui font-semibold text-slate-800 inline-flex items-center gap-1">
                          <Building2 className="size-3.5 text-slate-400" />
                          {comp?.name || effectiveCompanyId || "—"}
                        </div>
                        {wp && (
                          <div className="text-micro text-slate-500 flex items-center gap-1">
                            <MapPin className="size-3" />
                            {wp.name}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-ui text-slate-800">{jobRole || "—"}</div>
                        <div className="text-micro text-slate-500 font-mono">
                          {placement?.startDate ? formatDateLocalized(placement.startDate, lang) : ""}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {sum.expired > 0 ? (
                          <span
                            data-testid={`agency-rented-compliance-warning-${worker.id}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold bg-rose-50 text-rose-700 border border-rose-200"
                          >
                            <AlertTriangle className="size-3 shrink-0" />
                            {t("Expired", "Expirované", "Lejárt")} ({sum.expired}) · {sum.verified}/{sum.total}
                          </span>
                        ) : sum.missingRequired > 0 || sum.missingExpiry > 0 ? (
                          <span
                            data-testid={`agency-rented-compliance-warning-${worker.id}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold bg-rose-50 text-rose-700 border border-rose-200"
                          >
                            <AlertTriangle className="size-3 shrink-0" />
                            {t("Missing doc", "Chýba doklad", "Hiányzó irat")} ({sum.verified}/{sum.total})
                          </span>
                        ) : sum.missing > 0 ? (
                          <span
                            data-testid={`agency-rented-compliance-warning-${worker.id}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold bg-amber-50 text-amber-800 border border-amber-200"
                          >
                            <AlertTriangle className="size-3 shrink-0" />
                            {t("Missing doc", "Chýba doklad", "Hiányzó irat")} ({sum.verified}/{sum.total})
                          </span>
                        ) : sum.expiringSoon > 0 ? (
                          <span
                            data-testid={`agency-rented-compliance-warning-${worker.id}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold bg-amber-50 text-amber-800 border border-amber-200"
                          >
                            <AlertTriangle className="size-3 shrink-0" />
                            {t("Expiring", "Končí platnosť", "Lejáró")} ({sum.verified}/{sum.total})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="size-3 shrink-0" />
                            {sum.verified}/{sum.total}
                          </span>
                        )}
                      </td>
                      {rights.payments && (
                        <td className="py-3 px-4 text-caption font-mono text-slate-700">
                          {placement?.payRate ?? worker.defaultPayRate ?? 0} / {placement?.billRate ?? worker.defaultBillRate ?? 0} {placement?.currency || worker.currency}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
