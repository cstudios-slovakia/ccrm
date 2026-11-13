import React, { useEffect, useState } from "react";
import { Building2, ExternalLink, MapPin, Plus, Trash2, UserCheck } from "lucide-react";
import type { Language } from "../../utils/translations";
import type { AgencyBootstrapPayload } from "../../types/agency";
import { deleteAgencyWorkplace, fetchAgencyBootstrap, saveAgencyWorkplace } from "../../utils/agencyApi";
import type { AgencyRights } from "../../utils/agencyRights";

interface ClientCompanyAgencyTabProps {
  companyIds: string[];
  primaryCompanyId: string;
  companyName: string;
  lang: Language;
  rights?: AgencyRights;
}

export const ClientCompanyAgencyTab: React.FC<ClientCompanyAgencyTabProps> = ({
  companyIds,
  primaryCompanyId,
  companyName,
  lang,
  rights,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    lang === "sk" ? sk : lang === "hu" ? hu : en;

  const [data, setData] = useState<AgencyBootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [savingSite, setSavingSite] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchAgencyBootstrap();
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [primaryCompanyId]);

  const idSet = new Set(companyIds);
  const placements = (data?.placements || []).filter((pl) => idSet.has(pl.companyClientId));
  const activePlacements = placements.filter((pl) => pl.status === "active");
  const workplaces = (data?.workplaces || []).filter((wp) => idSet.has(wp.companyClientId));
  const workerMap = new Map((data?.workers || []).map((w) => [w.id, w]));
  const workplaceMap = new Map((data?.workplaces || []).map((wp) => [wp.id, wp]));

  const handleAddWorkplace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteName.trim() || !rights?.edit) return;
    setSavingSite(true);
    try {
      await saveAgencyWorkplace({
        companyClientId: primaryCompanyId,
        name: siteName.trim(),
        address: siteAddress.trim(),
      });
      setSiteName("");
      setSiteAddress("");
      await load();
    } finally {
      setSavingSite(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="py-8 text-center text-ui text-slate-400">
        {t("Loading rented employees…", "Načítavam prenajatých zamestnancov…", "Kölcsönzött dolgozók betöltése…")}
      </div>
    );
  }

  return (
    <div className="space-y-5 text-left" data-testid="company-agency-workers-tab">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-100 pb-3">
        <div>
          <h3 className="text-ui font-bold text-slate-800 flex items-center gap-1.5">
            <Building2 className="h-4.5 w-4.5 text-teal-600" />
            {t("Rented Employees at", "Prenajatí zamestnanci v", "Kölcsönzött dolgozók:")} {companyName}
          </h3>
          <p className="text-micro text-slate-400 mt-0.5">
            {t(
              "External agency workers currently leased to this company (stored separately from client contacts).",
              "Prenajatí pracovníci pridelení do tejto firmy (oddelene od klientskych kontaktov).",
              "A céghez kihelyezett dolgozók (az ügyfélkapcsolattartóktól elkülönítve)."
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            window.location.hash = "agency/schedule";
          }}
          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-caption font-semibold cursor-pointer"
        >
          {t("Open Agency Schedule", "Otvoriť rozpis zmien", "Műszakbeosztás megnyitása")}
        </button>
      </div>

      {activePlacements.length === 0 ? (
        <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center text-ui text-slate-500">
          {t("No rented employees currently placed at this company.", "K tejto firme zatiaľ nie je pridelený žiadny pracovník.", "Ehhez a céghez jelenleg nincs kihelyezett dolgozó.")}
        </div>
      ) : (
        <div className="grid grid-cols-1 ws-md:grid-cols-2 gap-3">
          {activePlacements.map((pl) => {
            const worker = workerMap.get(pl.workerId);
            const wp = pl.workplaceId ? workplaceMap.get(pl.workplaceId) : undefined;
            if (!worker) return null;
            return (
              <div
                key={pl.id}
                data-testid={`company-rented-worker-${worker.id}`}
                className="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-start justify-between gap-3 shadow-2xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <UserCheck className="size-4 text-emerald-600 shrink-0" />
                    <span className="text-body font-bold text-slate-900 truncate">{worker.fullName}</span>
                    {worker.workerCode && (
                      <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                        {worker.workerCode}
                      </span>
                    )}
                  </div>
                  <div className="text-caption text-slate-600">
                    {pl.jobRole || t("Worker", "Pracovník", "Dolgozó")} · {pl.startDate}
                  </div>
                  {wp && (
                    <div className="text-micro text-slate-500 flex items-center gap-1">
                      <MapPin className="size-3" />
                      {wp.name}
                    </div>
                  )}
                  {rights?.payments && (
                    <div className="text-micro font-mono text-slate-700">
                      {t("Bill:", "Fakt.:", "Száml.:")} {pl.billRate ?? worker.defaultBillRate ?? 0} {pl.currency}/h · {t("Pay:", "Mzda:", "Bér:")} {pl.payRate ?? worker.defaultPayRate ?? 0} {pl.currency}/h
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    window.location.hash = `agency/worker/${encodeURIComponent(worker.id)}`;
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-teal-50 text-teal-700 hover:bg-teal-100 text-caption font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <ExternalLink className="size-3.5" />
                  {t("Open", "Detail", "Megnyitás")}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-3 border-t border-slate-100 space-y-3">
        <div className="text-ui font-bold text-slate-700 flex items-center gap-1.5">
          <MapPin className="size-4 text-slate-500" />
          {t("Company Workplaces / Sites", "Pracoviská a prevádzky firmy", "Céges munkahelyek / telephelyek")}
        </div>
        <div className="flex flex-wrap gap-2">
          {workplaces.map((wp) => (
            <div
              key={wp.id}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-caption"
            >
              <span className="font-semibold text-slate-800">{wp.name}</span>
              {wp.address && <span className="text-slate-400">({wp.address})</span>}
              {rights?.edit && (
                <button
                  type="button"
                  onClick={async () => {
                    await deleteAgencyWorkplace(wp.id);
                    await load();
                  }}
                  className="text-slate-400 hover:text-rose-600 cursor-pointer"
                  aria-label={t("Delete site", "Odstrániť pracovisko", "Telephely törlése")}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        {rights?.edit && (
          <form onSubmit={handleAddWorkplace} className="flex flex-wrap gap-2">
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder={t("Workplace name (e.g. Hall B)", "Názov pracoviska (napr. Hala B)", "Telephely neve")}
              className="flex-1 min-w-40 px-3 py-1.5 rounded-xl border border-slate-200 text-ui"
            />
            <input
              type="text"
              value={siteAddress}
              onChange={(e) => setSiteAddress(e.target.value)}
              placeholder={t("Address (optional)", "Adresa (voliteľné)", "Cím (opcionális)")}
              className="flex-1 min-w-40 px-3 py-1.5 rounded-xl border border-slate-200 text-ui"
            />
            <button
              type="submit"
              disabled={savingSite || !siteName.trim()}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-caption font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <Plus className="size-3.5" />
              {t("Add Workplace", "Pridať pracovisko", "Telephely hozzáadása")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
