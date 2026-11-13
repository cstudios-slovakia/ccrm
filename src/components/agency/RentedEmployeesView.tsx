import React, { useMemo, useState } from "react";
import { Building2, CalendarDays, MapPin, Search, UserCheck } from "lucide-react";
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

  const companyOptions = useMemo(() => {
    const ids = new Set(placements.map((p) => p.companyClientId));
    return Array.from(ids)
      .map((id) => ({ id, name: clientMap.get(id)?.name || id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [placements, clientMap]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workers
      .map((w) => {
        const pl = activePlacementByWorker.get(w.id);
        return { worker: w, placement: pl };
      })
      .filter(({ worker, placement }) => {
        const isRented = worker.workerStatus === "rented" || placement?.status === "active";
        if (!showInactive && !isRented) return false;
        if (!placement && !isRented) return false;
        if (companyFilter !== "all" && placement?.companyClientId !== companyFilter) return false;
        if (!q) return true;
        const compName = placement ? clientMap.get(placement.companyClientId)?.name || "" : "";
        return (
          worker.fullName.toLowerCase().includes(q) ||
          worker.workerCode.toLowerCase().includes(q) ||
          compName.toLowerCase().includes(q) ||
          (placement?.jobRole || "").toLowerCase().includes(q)
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
                {rows.map(({ worker, placement }) => {
                  const comp = placement ? clientMap.get(placement.companyClientId) : undefined;
                  const wp = placement?.workplaceId ? workplaceMap.get(placement.workplaceId) : undefined;
                  const sum = summarizeWorkerCompliance(complianceByWorker.get(worker.id) || []);
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
                          {comp?.name || placement?.companyClientId || "—"}
                        </div>
                        {wp && (
                          <div className="text-micro text-slate-500 flex items-center gap-1">
                            <MapPin className="size-3" />
                            {wp.name}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-ui text-slate-800">{placement?.jobRole || "—"}</div>
                        <div className="text-micro text-slate-500 font-mono">{placement?.startDate || ""}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-micro font-semibold border ${
                            sum.worstState === "expired"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : sum.worstState === "expiring"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}
                        >
                          {sum.verified}/{sum.total}
                        </span>
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
