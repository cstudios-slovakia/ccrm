import React, { useMemo, useState, useEffect, useCallback } from "react";
import { AlertTriangle, Brain, Building2, CalendarDays, CheckCircle2, MapPin, RefreshCw, Search, UserCheck } from "lucide-react";
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
import { hasAiConfigured } from "../../utils/aiConfig";
import { fetchWithTimeout } from "../../utils/fetchWithTimeout";

interface RentedEmployeesViewProps {
  lang: Language;
  rights: AgencyRights;
  workers: AgencyWorker[];
  placements: AgencyPlacement[];
  workplaces: AgencyWorkplace[];
  checklists: AgencyWorkerChecklistItem[];
  clients: Lead[];
  integrationsConfig?: any;
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
  integrationsConfig,
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

  // Fleet-wide deterministic compliance & placement problems for Rented Employees
  const rentedFleetProblems = useMemo(() => {
    const probs: string[] = [];
    const expiredWorkers: string[] = [];
    const missingWorkers: string[] = [];
    const expiringWorkers: string[] = [];
    const unplacedWorkers: string[] = [];

    for (const { worker, placement, effectiveCompanyId } of rows) {
      const sum = summarizeWorkerCompliance(complianceByWorker.get(worker.id) || []);
      if (sum.expired > 0) expiredWorkers.push(worker.fullName);
      else if (sum.missingRequired > 0 || sum.missing > 0) missingWorkers.push(worker.fullName);
      if (sum.expiringSoon > 0) expiringWorkers.push(worker.fullName);
      if (!effectiveCompanyId && !placement) unplacedWorkers.push(worker.fullName);
    }

    if (expiredWorkers.length > 0) {
      probs.push(
        t(
          `${expiredWorkers.length} rented employee(s) with expired documents (${expiredWorkers.slice(0, 3).join(", ")}${expiredWorkers.length > 3 ? "…" : ""})`,
          `${expiredWorkers.length} prenajatý zamestnanec s expirovanými dokladmi (${expiredWorkers.slice(0, 3).join(", ")}${expiredWorkers.length > 3 ? "…" : ""})`,
          `${expiredWorkers.length} kölcsönzött dolgozó lejárt dokumentummal (${expiredWorkers.slice(0, 3).join(", ")}${expiredWorkers.length > 3 ? "…" : ""})`
        )
      );
    }
    if (missingWorkers.length > 0) {
      probs.push(
        t(
          `${missingWorkers.length} rented employee(s) missing required documents (${missingWorkers.slice(0, 3).join(", ")}${missingWorkers.length > 3 ? "…" : ""})`,
          `${missingWorkers.length} prenajatý zamestnanec s chýbajúcimi dokladmi (${missingWorkers.slice(0, 3).join(", ")}${missingWorkers.length > 3 ? "…" : ""})`,
          `${missingWorkers.length} kölcsönzött dolgozó hiányzó dokumentummal (${missingWorkers.slice(0, 3).join(", ")}${missingWorkers.length > 3 ? "…" : ""})`
        )
      );
    }
    if (expiringWorkers.length > 0) {
      probs.push(
        t(
          `${expiringWorkers.length} rented employee(s) with documents expiring within 30 days`,
          `${expiringWorkers.length} prenajatý zamestnanec s dokladmi exspirujúcimi do 30 dní`,
          `${expiringWorkers.length} kölcsönzött dolgozó 30 napon belül lejáró dokumentummal`
        )
      );
    }
    if (unplacedWorkers.length > 0) {
      probs.push(
        t(
          `${unplacedWorkers.length} rented employee(s) without an assigned host company`,
          `${unplacedWorkers.length} prenajatý zamestnanec bez pridelenej klientskej firmy`,
          `${unplacedWorkers.length} kölcsönzött dolgozó hozzárendelt fogadó cég nélkül`
        )
      );
    }
    return probs;
  }, [rows, complianceByWorker, lang]);

  const rentedFleetFp = useMemo(() => {
    return `${rows.length}|${rentedFleetProblems.join(";")}|${lang}`;
  }, [rows.length, rentedFleetProblems, lang]);

  const [fleetAiSummary, setFleetAiSummary] = useState<string>("");
  const [fleetAiProblems, setFleetAiProblems] = useState<string[]>([]);
  const [isGeneratingFleetSummary, setIsGeneratingFleetSummary] = useState<boolean>(false);

  const generateFleetSummary = useCallback(
    async (force = false) => {
      if (rows.length === 0) return;
      const storageKey = "ccrm_ai_sum_agw_fleet";
      if (!force && typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.fp === rentedFleetFp && parsed.summary) {
              setFleetAiSummary(parsed.summary);
              setFleetAiProblems(Array.isArray(parsed.problems) ? parsed.problems : []);
              return;
            }
          }
        } catch {}
      }
      if (!hasAiConfigured(integrationsConfig)) return;
      setIsGeneratingFleetSummary(true);
      try {
        const res = await fetchWithTimeout(
          "/api/summarize_client_lead.php",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Rented Employees Roster",
              type: "rented employees workforce",
              systemLanguage: lang,
              tasks: [],
              events: [],
              priceOffers: [],
              otherData: {
                totalRentedEmployees: rows.length,
                hostCompaniesCount: companyOptions.length,
                detectedProblems: rentedFleetProblems,
                workersOverview: rows.slice(0, 15).map(({ worker, placement, effectiveCompanyId }) => {
                  const sum = summarizeWorkerCompliance(complianceByWorker.get(worker.id) || []);
                  return {
                    name: worker.fullName,
                    company: effectiveCompanyId ? clientMap.get(effectiveCompanyId)?.name || effectiveCompanyId : "None",
                    role: placement?.jobRole || resolveWorkerJobTitle(worker),
                    expiredDocs: sum.expired,
                    missingDocs: sum.missing,
                    expiringSoonDocs: sum.expiringSoon,
                  };
                }),
              },
            }),
          },
          25_000
        );
        const data = await res.json();
        if (data.success && data.summary) {
          const probs = Array.isArray(data.problems) ? data.problems.filter(Boolean) : [];
          setFleetAiSummary(data.summary);
          setFleetAiProblems(probs);
          try {
            localStorage.setItem(storageKey, JSON.stringify({ fp: rentedFleetFp, summary: data.summary, problems: probs }));
          } catch {}
        }
      } catch (err) {
        console.error("Failed to generate rented employees fleet AI summary:", err);
      } finally {
        setIsGeneratingFleetSummary(false);
      }
    },
    [rows, companyOptions.length, rentedFleetProblems, rentedFleetFp, complianceByWorker, clientMap, integrationsConfig, lang]
  );

  useEffect(() => {
    generateFleetSummary(false);
  }, [generateFleetSummary]);

  const combinedFleetProblems = useMemo(() => {
    const merged = [...fleetAiProblems];
    for (const p of rentedFleetProblems) {
      if (!merged.some((e) => e.toLowerCase().includes(p.slice(0, 18).toLowerCase()))) {
        merged.push(p);
      }
    }
    return merged;
  }, [fleetAiProblems, rentedFleetProblems]);

  return (
    <div className="space-y-4" data-testid="agency-rented-workers-view">
      {/* AI Rented Workforce Summary & Problem Highlighting Banner */}
      {rows.length > 0 && (
        <div
          data-testid="agency-rented-list-ai-summary"
          className={`rounded-lg border px-4 py-3 shadow-xs transition-colors ${
            combinedFleetProblems.length > 0
              ? "bg-rose-50/75 border-rose-200/80"
              : "bg-[#f3f6ea]/70 border-entity-border"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Brain
                className={`size-4 shrink-0 ${
                  combinedFleetProblems.length > 0 ? "text-rose-600" : "text-[#4a5a20]"
                } ${isGeneratingFleetSummary ? "animate-pulse" : ""}`}
              />
              <span
                className={`text-micro font-bold uppercase tracking-wider ${
                  combinedFleetProblems.length > 0 ? "text-rose-700" : "text-[#4a5a20]"
                }`}
              >
                {t(
                  "AI Rented Workforce Summary & Problem Highlights",
                  "AI Zhrnutie prenajatých zamestnancov a zistené problémy",
                  "AI Kölcsönzött Munkaerő Összefoglaló és Problémák"
                )}
              </span>
              {combinedFleetProblems.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold bg-rose-100 text-rose-700 border border-rose-200">
                  ⚠️ {combinedFleetProblems.length} {t("problem(s)", "problém(y)", "probléma")}
                </span>
              )}
            </div>
            {hasAiConfigured(integrationsConfig) && (
              <button
                type="button"
                onClick={() => generateFleetSummary(true)}
                disabled={isGeneratingFleetSummary}
                className="p-1 rounded-lg hover:bg-white/80 text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
                title={t("Regenerate AI Summary", "Pregenerovať AI zhrnutie", "AI összefoglaló újragenerálása")}
              >
                <RefreshCw className={`size-3.5 ${isGeneratingFleetSummary ? "animate-spin text-[#4a5a20]" : ""}`} />
              </button>
            )}
          </div>
          {combinedFleetProblems.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {combinedFleetProblems.map((prob, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-white/90 border border-rose-200 text-rose-800 text-caption font-semibold"
                >
                  <span className="size-1.5 rounded-full bg-rose-500 shrink-0" />
                  {prob}
                </span>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-caption text-gray-700 leading-relaxed">
            {isGeneratingFleetSummary && !fleetAiSummary ? (
              <span className="italic text-gray-400">
                {t(
                  "Generating AI summary for rented employees...",
                  "Generujem AI prehľad prenajatých zamestnancov...",
                  "AI összefoglaló generálása a kölcsönzött dolgozókról..."
                )}
              </span>
            ) : fleetAiSummary ? (
              fleetAiSummary
            ) : combinedFleetProblems.length > 0 ? (
              t(
                `${rows.length} rented employee(s) across ${companyOptions.length} client company(ies). Review the compliance problems highlighted above.`,
                `${rows.length} prenajatých zamestnancov v ${companyOptions.length} klientskych firmách. Skontrolujte vyššie zvýraznené problémy s dokladmi.`,
                `${rows.length} kölcsönzött dolgozó ${companyOptions.length} partnercégnél. Ellenőrizze a fent kiemelt dokumentációs problémákat.`
              )
            ) : (
              t(
                `${rows.length} rented employee(s) across ${companyOptions.length} client company(ies). All compliance documents are valid.`,
                `${rows.length} prenajatých zamestnancov v ${companyOptions.length} klientskych firmách. Všetky doklady sú platné.`,
                `${rows.length} kölcsönzött dolgozó ${companyOptions.length} partnercégnél. Minden dokumentum érvényes.`
              )
            )}
          </p>
        </div>
      )}
      <div className=" rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-56">
          <div className="relative flex-1 min-w-48 max-w-md">
            <Search className="size-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Filter rented workers or companies…", "Filtrovať pracovníkov alebo firmy…", "Dolgozó vagy cég keresése…")}
              className="w-full pl-9 pr-3 py-2 rounded-md bg-white border border-gray-200 text-ui"
            />
          </div>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="px-3 py-2 rounded-md bg-white border border-gray-200 text-ui"
          >
            <option value="all">{t("All Client Companies", "Všetky firmy", "Minden cég")}</option>
            {companyOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-1.5 text-caption text-gray-600 cursor-pointer">
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
          className="px-3.5 py-2 rounded-md bg-[#5c6f28] hover:bg-[#4a5a20] text-white text-ui font-semibold inline-flex items-center gap-1.5 shadow-sm shadow-[#5c6f28]/20 transition-colors cursor-pointer"
        >
          <CalendarDays className="size-4" />
          {t("Open Work Schedule", "Otvoriť rozpis zmien", "Műszakbeosztás")}
        </button>
      </div>

      <div className=" rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-ui text-gray-500">
            {t("No rented employees found for the active filters.", "Žiadni prenajatí zamestnanci.", "Nincs kölcsönzött dolgozó.")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80 text-micro font-bold uppercase tracking-wider text-gray-500">
                  <th className="py-3 px-4">{t("Rented Employee", "Zamestnanec", "Dolgozó")}</th>
                  <th className="py-3 px-4">{t("Client Company & Workplace", "Firma a pracovisko", "Cég és telephely")}</th>
                  <th className="py-3 px-4">{t("Role & Start", "Pozícia a nástup", "Munkakör")}</th>
                  <th className="py-3 px-4">{t("Compliance", "Doklady", "Dokumentumok")}</th>
                  {rights.payments && <th className="py-3 px-4">{t("Rates", "Sadzby", "Díjak")}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
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
                      className="hover:bg-gray-50/80 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="text-body font-semibold text-gray-900 flex items-center gap-2">
                          <UserCheck className="size-4 text-[#5c6f28] shrink-0" />
                          <span>{worker.fullName}</span>
                          {worker.workerCode && (
                            <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                              {worker.workerCode}
                            </span>
                          )}
                        </div>
                        <div className="text-micro text-gray-500">{worker.nationality || "—"}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-ui font-semibold text-gray-800 inline-flex items-center gap-1">
                          <Building2 className="size-3.5 text-gray-400" />
                          {comp?.name || effectiveCompanyId || "—"}
                        </div>
                        {wp && (
                          <div className="text-micro text-gray-500 flex items-center gap-1">
                            <MapPin className="size-3" />
                            {wp.name}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-ui text-gray-800">{jobRole || "—"}</div>
                        <div className="text-micro text-gray-500 font-mono">
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
                        <td className="py-3 px-4 text-caption font-mono text-gray-700">
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
