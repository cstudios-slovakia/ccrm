import React, { useMemo, useState } from "react";
import { LayoutGrid, List, Plus, Search, UserCheck, AlertTriangle, CheckCircle2, Phone, Mail, Globe, Building2 } from "lucide-react";
import type { Lead } from "../../types";
import type { Language } from "../../utils/translations";
import {
  resolveLocalizedLabel,
  type AgencyPlacement,
  type AgencySettings,
  type AgencyStage,
  type AgencyWorker,
  type AgencyWorkerChecklistItem,
} from "../../types/agency";
import { summarizeWorkerCompliance } from "../../utils/agencyCalculations";
import type { AgencyRights } from "../../utils/agencyRights";

interface CandidatesPipelineViewProps {
  lang: Language;
  rights: AgencyRights;
  settings: AgencySettings;
  workers: AgencyWorker[];
  placements?: AgencyPlacement[];
  clients?: Lead[];
  checklists: AgencyWorkerChecklistItem[];
  onOpenWorker: (workerId: string) => void;
  onCreateWorker: (draft: Partial<AgencyWorker> & { fullName: string }) => Promise<AgencyWorker>;
  onMoveStage: (worker: AgencyWorker, stageId: string) => Promise<void>;
}

export const CandidatesPipelineView: React.FC<CandidatesPipelineViewProps> = ({
  lang,
  rights,
  settings,
  workers,
  placements = [],
  clients = [],
  checklists,
  onOpenWorker,
  onCreateWorker,
  onMoveStage,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    lang === "sk" ? sk : lang === "hu" ? hu : en;

  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [nationalityFilter, setNationalityFilter] = useState<string>("all");
  const [includeRented, setIncludeRented] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    surname: "",
    givenNames: "",
    nationality: "",
    targetCompanyClientId: "",
    email: "",
    phone: "",
    stageId: settings.stages[0]?.id || "sourced",
    skillsText: "",
    notes: "",
    defaultPayRate: "",
    defaultBillRate: "",
  });

  const companyLeads = useMemo(
    () =>
      clients
        .filter((c) => c.status === "accepted" && !c.archived && c.clientType !== "person")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [clients]
  );

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

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

  const getWorkerCompanyId = (w: AgencyWorker): string => {
    const activePl = activePlacementByWorker.get(w.id);
    if (activePl?.companyClientId) return activePl.companyClientId;
    if (w.targetCompanyClientId) return w.targetCompanyClientId;
    const fromProfile = w.profile?.stayWork?.targetCompanyClientId;
    return typeof fromProfile === "string" ? fromProfile : "";
  };

  const getWorkerCompanyName = (w: AgencyWorker): string => {
    const cid = getWorkerCompanyId(w);
    if (cid) return clientMap.get(cid)?.name || cid;
    const fromEmployer = w.profile?.stayWork?.employerName;
    return typeof fromEmployer === "string" && fromEmployer.trim() ? fromEmployer.trim() : "";
  };

  const nationalityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const w of workers) {
      if (w.nationality?.trim()) set.add(w.nationality.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [workers]);

  const checklistByWorker = useMemo(() => {
    const map = new Map<string, AgencyWorkerChecklistItem[]>();
    for (const item of checklists) {
      const arr = map.get(item.workerId) || [];
      arr.push(item);
      map.set(item.workerId, arr);
    }
    return map;
  }, [checklists]);

  const stageById = useMemo(() => {
    const map = new Map<string, AgencyStage>();
    for (const st of settings.stages) map.set(st.id, st);
    return map;
  }, [settings.stages]);

  const filteredWorkers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workers.filter((w) => {
      if (!includeRented && w.workerStatus !== "candidate") return false;
      if (stageFilter !== "all" && w.stageId !== stageFilter) return false;
      if (nationalityFilter !== "all" && w.nationality.trim() !== nationalityFilter) return false;
      const cid = getWorkerCompanyId(w);
      if (companyFilter !== "all") {
        if (companyFilter === "__unassigned__") {
          if (cid) return false;
        } else if (cid !== companyFilter) {
          return false;
        }
      }
      if (!q) return true;
      const compName = getWorkerCompanyName(w).toLowerCase();
      return (
        w.fullName.toLowerCase().includes(q) ||
        w.workerCode.toLowerCase().includes(q) ||
        w.nationality.toLowerCase().includes(q) ||
        w.email.toLowerCase().includes(q) ||
        w.phone.toLowerCase().includes(q) ||
        compName.includes(q)
      );
    });
  }, [workers, includeRented, stageFilter, nationalityFilter, companyFilter, search, activePlacementByWorker, clientMap]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullName = [form.surname.trim(), form.givenNames.trim()].filter(Boolean).join(" ") || form.surname.trim() || form.givenNames.trim();
    if (!fullName) return;
    setSubmitting(true);
    try {
      const selectedCompanyName = form.targetCompanyClientId
        ? clientMap.get(form.targetCompanyClientId)?.name || ""
        : "";
      const created = await onCreateWorker({
        fullName,
        nationality: form.nationality.trim(),
        targetCompanyClientId: form.targetCompanyClientId || "",
        email: form.email.trim(),
        phone: form.phone.trim(),
        stageId: form.stageId || settings.stages[0]?.id || "sourced",
        workerStatus: "candidate",
        skills: form.skillsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        notes: form.notes.trim(),
        defaultPayRate: rights.payments && form.defaultPayRate ? Number(form.defaultPayRate) : undefined,
        defaultBillRate: rights.payments && form.defaultBillRate ? Number(form.defaultBillRate) : undefined,
        currency: settings.defaultCurrency,
        profile: {
          applicant: {
            surname: form.surname.trim(),
            givenNames: form.givenNames.trim(),
            nationality: form.nationality.trim(),
          },
          stayWork: {
            targetCompanyClientId: form.targetCompanyClientId || "",
            ...(selectedCompanyName ? { employerName: selectedCompanyName } : {}),
          },
        },
      });
      setShowCreate(false);
      setForm({
        surname: "",
        givenNames: "",
        nationality: "",
        targetCompanyClientId: "",
        email: "",
        phone: "",
        stageId: settings.stages[0]?.id || "sourced",
        skillsText: "",
        notes: "",
        defaultPayRate: "",
        defaultBillRate: "",
      });
      onOpenWorker(created.id);
    } finally {
      setSubmitting(false);
    }
  };

  const renderCompliancePill = (workerId: string) => {
    const sum = summarizeWorkerCompliance(checklistByWorker.get(workerId) || []);
    if (sum.total === 0) {
      return <span className="text-micro text-slate-400">—</span>;
    }
    if (sum.expired > 0) {
      return (
        <span
          data-testid={`agency-compliance-warning-${workerId}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold bg-rose-50 text-rose-700 border border-rose-200"
        >
          <AlertTriangle className="size-3 shrink-0" />
          {t("Expired", "Expirované", "Lejárt")} ({sum.expired}) · {sum.verified}/{sum.total}
        </span>
      );
    }
    if (sum.missingRequired > 0 || sum.missingExpiry > 0) {
      return (
        <span
          data-testid={`agency-compliance-warning-${workerId}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold bg-rose-50 text-rose-700 border border-rose-200"
        >
          <AlertTriangle className="size-3 shrink-0" />
          {t("Missing doc", "Chýba doklad", "Hiányzó irat")} ({sum.verified}/{sum.total})
        </span>
      );
    }
    if (sum.missing > 0) {
      return (
        <span
          data-testid={`agency-compliance-warning-${workerId}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold bg-amber-50 text-amber-800 border border-amber-200"
        >
          <AlertTriangle className="size-3 shrink-0" />
          {t("Missing doc", "Chýba doklad", "Hiányzó irat")} ({sum.verified}/{sum.total})
        </span>
      );
    }
    if (sum.expiringSoon > 0) {
      return (
        <span
          data-testid={`agency-compliance-warning-${workerId}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold bg-amber-50 text-amber-800 border border-amber-200"
        >
          <AlertTriangle className="size-3 shrink-0" />
          {t("Expiring", "Končí platnosť", "Lejáró")} ({sum.verified}/{sum.total})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="size-3 shrink-0" />
        {sum.verified}/{sum.total}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-56">
          <div className="relative flex-1 min-w-48 max-w-md">
            <Search className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search candidate, code, company, nationality…", "Hľadať kandidáta, kód, firmu, štátnu príslušnosť…", "Keresés név, kód, cég, állampolgárság…")}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-ui text-slate-800 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            data-testid="agency-candidates-stage-filter"
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-ui text-slate-700"
          >
            <option value="all">{t("All stages", "Všetky fázy", "Minden fázis")}</option>
            {settings.stages.map((st) => (
              <option key={st.id} value={st.id}>
                {resolveLocalizedLabel(st.label, lang)}
              </option>
            ))}
          </select>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            data-testid="agency-candidates-company-filter"
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-ui text-slate-700"
          >
            <option value="all">{t("All companies", "Všetky firmy", "Minden cég")}</option>
            <option value="__unassigned__">{t("Unassigned company", "Bez firmy", "Cég nélkül")}</option>
            {companyLeads.map((comp) => (
              <option key={comp.id} value={comp.id}>
                {comp.name}
              </option>
            ))}
          </select>
          {nationalityOptions.length > 0 && (
            <select
              value={nationalityFilter}
              onChange={(e) => setNationalityFilter(e.target.value)}
              data-testid="agency-candidates-nationality-filter"
              className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-ui text-slate-700"
            >
              <option value="all">{t("All nationalities", "Všetky príslušnosti", "Minden állampolgárság")}</option>
              {nationalityOptions.map((nat) => (
                <option key={nat} value={nat}>
                  {nat}
                </option>
              ))}
            </select>
          )}
          <label className="inline-flex items-center gap-1.5 text-caption font-medium text-slate-600 px-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeRented}
              onChange={(e) => setIncludeRented(e.target.checked)}
            />
            {t("Include placed", "Vrátane prenajatých", "Kihelyezettek is")}
          </label>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              data-testid="agency-candidates-table-btn"
              className={`px-2.5 py-1 rounded-lg text-caption font-semibold inline-flex items-center gap-1 cursor-pointer ${
                viewMode === "table" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
              }`}
            >
              <List className="size-3.5" />
              {t("Table", "Tabuľka", "Táblázat")}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              data-testid="agency-candidates-kanban-btn"
              className={`px-2.5 py-1 rounded-lg text-caption font-semibold inline-flex items-center gap-1 cursor-pointer ${
                viewMode === "kanban" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
              }`}
            >
              <LayoutGrid className="size-3.5" />
              Kanban
            </button>
          </div>
          {rights.edit && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              data-testid="agency-add-candidate-btn"
              className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-ui font-semibold inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Plus className="size-4" />
              {t("New Candidate", "Nový kandidát", "Új jelölt")}
            </button>
          )}
        </div>
      </div>

      {viewMode === "table" ? (
        <div className="glass-panel rounded-2xl overflow-hidden">
          {filteredWorkers.length === 0 ? (
            <div className="p-10 text-center text-ui text-slate-500">
              {t("No candidates match the current filters.", "Žiadni kandidáti nezodpovedajú filtrom.", "Nincs a szűrésnek megfelelő jelölt.")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-micro font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">{t("Candidate", "Kandidát", "Jelölt")}</th>
                    <th className="py-3 px-4">{t("Recruited For (Company)", "Firma", "Célcég")}</th>
                    <th className="py-3 px-4">{t("Nationality", "Príslušnosť", "Állampolgárság")}</th>
                    <th className="py-3 px-4">{t("Contact", "Kontakt", "Elérhetőség")}</th>
                    <th className="py-3 px-4">{t("Stage", "Fáza", "Fázis")}</th>
                    <th className="py-3 px-4">{t("Compliance", "Doklady", "Megfelelőség")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredWorkers.map((w) => {
                    const st = stageById.get(w.stageId);
                    const stageColor = st?.color || "#64748b";
                    const companyName = getWorkerCompanyName(w);
                    const isPlaced = activePlacementByWorker.get(w.id)?.status === "active";
                    return (
                      <tr
                        key={w.id}
                        data-testid={`agency-candidate-row-${w.id}`}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => onOpenWorker(w.id)}
                            className="text-left group cursor-pointer"
                          >
                            <div className="text-body font-semibold text-slate-900 group-hover:text-teal-700 flex items-center gap-2">
                              <UserCheck className="size-4 text-teal-600 shrink-0" />
                              <span>{w.fullName}</span>
                              {w.workerCode && (
                                <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                  {w.workerCode}
                                </span>
                              )}
                            </div>
                          </button>
                        </td>
                        <td className="py-3 px-4 text-ui">
                          {companyName ? (
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-caption font-semibold border ${
                                isPlaced
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  : "bg-indigo-50/80 text-indigo-800 border-indigo-200"
                              }`}
                            >
                              <Building2 className="size-3.5 shrink-0" />
                              <span className="truncate max-w-44">{companyName}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-ui text-slate-700">
                          <span className="inline-flex items-center gap-1">
                            <Globe className="size-3.5 text-slate-400" />
                            {w.nationality || "—"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-caption text-slate-600 space-y-0.5">
                          {w.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="size-3 text-slate-400" />
                              {w.phone}
                            </div>
                          )}
                          {w.email && (
                            <div className="flex items-center gap-1">
                              <Mail className="size-3 text-slate-400" />
                              {w.email}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {rights.edit ? (
                            <select
                              value={w.stageId}
                              onChange={(e) => onMoveStage(w, e.target.value)}
                              className="px-3 py-1.5 rounded-full text-caption font-bold text-white border-0 shadow-2xs cursor-pointer focus:outline-none"
                              style={{ backgroundColor: stageColor, color: "#ffffff" }}
                            >
                              {settings.stages.map((opt) => (
                                <option key={opt.id} value={opt.id} className="bg-white text-slate-900">
                                  {resolveLocalizedLabel(opt.label, lang)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span
                              className="inline-flex items-center px-3 py-1 rounded-full text-caption font-bold text-white shadow-2xs"
                              style={{ backgroundColor: stageColor }}
                            >
                              {resolveLocalizedLabel(st?.label, lang) || w.stageId}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">{renderCompliancePill(w.id)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2" data-testid="agency-candidates-kanban">
          {settings.stages.map((st) => {
            const colWorkers = filteredWorkers.filter((w) => w.stageId === st.id);
            return (
              <div
                key={st.id}
                className="w-72 shrink-0 glass-panel rounded-2xl p-3 flex flex-col gap-2.5"
              >
                <div className="flex items-center justify-between px-1">
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-caption font-bold text-white shadow-2xs"
                    style={{ backgroundColor: st.color }}
                  >
                    {resolveLocalizedLabel(st.label, lang)}
                  </span>
                  <span className="text-micro font-mono px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {colWorkers.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {colWorkers.map((w) => {
                    const companyName = getWorkerCompanyName(w);
                    return (
                      <div
                        key={w.id}
                        onClick={() => onOpenWorker(w.id)}
                        className="p-3 rounded-xl bg-white border border-slate-200 hover:border-teal-300 shadow-2xs cursor-pointer space-y-2 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-ui font-bold text-slate-900 leading-snug">{w.fullName}</div>
                          {w.workerCode && (
                            <span className="text-micro font-mono text-slate-400">{w.workerCode}</span>
                          )}
                        </div>
                        {companyName && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 text-micro font-semibold max-w-full">
                            <Building2 className="size-3 shrink-0" />
                            <span className="truncate">{companyName}</span>
                          </div>
                        )}
                        <div className="text-caption text-slate-500">
                          {w.nationality || t("Nationality unset", "Bez príslušnosti", "Állampolgárság nélkül")}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          {renderCompliancePill(w.id)}
                        </div>
                        {rights.edit && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <select
                              value={w.stageId}
                              onChange={(e) => onMoveStage(w, e.target.value)}
                              className="w-full px-2.5 py-1 rounded-full text-micro font-bold text-white border-0 shadow-2xs cursor-pointer"
                              style={{ backgroundColor: st.color, color: "#ffffff" }}
                            >
                              {settings.stages.map((opt) => (
                                <option key={opt.id} value={opt.id} className="bg-white text-slate-900">
                                  {resolveLocalizedLabel(opt.label, lang)}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg p-5 space-y-4"
            data-testid="agency-create-candidate-modal"
          >
            <div className="flex items-center justify-between">
              <h3 className="type-panel-title text-slate-900">
                {t("New Candidate Profile", "Nový profil kandidáta", "Új jelölt profil")}
              </h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-caption font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
            </div>
            <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3">
              <div>
                <label className="type-overline text-slate-500 block mb-1">
                  {t("Surname", "Priezvisko", "Vezetéknév")} *
                </label>
                <input
                  type="text"
                  required
                  data-testid="agency-new-worker-surname"
                  value={form.surname}
                  onChange={(e) => setForm((p) => ({ ...p, surname: e.target.value }))}
                  placeholder={t("Surname", "Priezvisko", "Vezetéknév")}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-ui"
                />
              </div>
              <div>
                <label className="type-overline text-slate-500 block mb-1">
                  {t("Given Names", "Krstné mená", "Keresztnév")} *
                </label>
                <input
                  type="text"
                  required
                  data-testid="agency-new-worker-given"
                  value={form.givenNames}
                  onChange={(e) => setForm((p) => ({ ...p, givenNames: e.target.value }))}
                  placeholder={t("Given Names", "Krstné mená", "Keresztnév")}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-ui"
                />
              </div>
              <div className="ws-sm:col-span-2">
                <label className="type-overline text-slate-500 block mb-1">
                  {t("Recruited For (Target Company)", "Nábor pre firmu", "Célcég (akinek toborozzuk)")}
                </label>
                <select
                  value={form.targetCompanyClientId}
                  onChange={(e) => setForm((p) => ({ ...p, targetCompanyClientId: e.target.value }))}
                  data-testid="agency-new-worker-company"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-ui"
                >
                  <option value="">{t("— Select company (optional) —", "— Vybrať firmu (voliteľné) —", "— Válasszon céget (opcionális) —")}</option>
                  {companyLeads.map((comp) => (
                    <option key={comp.id} value={comp.id}>
                      {comp.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="type-overline text-slate-500 block mb-1">
                  {t("Nationality", "Štátna príslušnosť", "Állampolgárság")}
                </label>
                <input
                  type="text"
                  value={form.nationality}
                  onChange={(e) => setForm((p) => ({ ...p, nationality: e.target.value }))}
                  placeholder="PHL"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-ui"
                />
              </div>
              <div>
                <label className="type-overline text-slate-500 block mb-1">
                  {t("Initial Stage", "Počiatočná fáza", "Kezdő fázis")}
                </label>
                <select
                  value={form.stageId}
                  onChange={(e) => setForm((p) => ({ ...p, stageId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-ui"
                >
                  {settings.stages.map((st) => (
                    <option key={st.id} value={st.id}>
                      {resolveLocalizedLabel(st.label, lang)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="type-overline text-slate-500 block mb-1">
                  {t("Phone", "Telefón", "Telefon")}
                </label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-ui"
                />
              </div>
              <div>
                <label className="type-overline text-slate-500 block mb-1">
                  {t("Email", "E-mail", "E-mail")}
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-ui"
                />
              </div>
              {rights.payments && (
                <>
                  <div>
                    <label className="type-overline text-slate-500 block mb-1">
                      {t("Default Pay Rate", "Mzda / hod.", "Órabér")} ({settings.defaultCurrency})
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={form.defaultPayRate}
                      onChange={(e) => setForm((p) => ({ ...p, defaultPayRate: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-ui font-mono"
                    />
                  </div>
                  <div>
                    <label className="type-overline text-slate-500 block mb-1">
                      {t("Default Bill Rate", "Fakturačná sadzba", "Számlázási díj")} ({settings.defaultCurrency})
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={form.defaultBillRate}
                      onChange={(e) => setForm((p) => ({ ...p, defaultBillRate: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-ui font-mono"
                    />
                  </div>
                </>
              )}
            </div>
            <div>
              <label className="type-overline text-slate-500 block mb-1">
                {t("Notes", "Poznámka", "Megjegyzés")}
              </label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-ui"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-ui font-medium text-slate-700 cursor-pointer"
              >
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
              <button
                type="submit"
                disabled={submitting}
                data-testid="agency-create-candidate-submit"
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-ui font-semibold cursor-pointer disabled:opacity-50"
              >
                {submitting ? t("Saving…", "Ukladám…", "Mentés…") : t("Create Candidate", "Vytvoriť kandidáta", "Jelölt létrehozása")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
