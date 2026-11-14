import React, { useState } from "react";
import { ArrowRightLeft, Building2, Calendar, MapPin, Plus, StopCircle, User } from "lucide-react";
import type { Lead } from "../../types";
import type { Language } from "../../utils/translations";
import type {
  AgencyPlacement,
  AgencyPlacementStatus,
  AgencySettings,
  AgencyWorker,
  AgencyWorkplace,
} from "../../types/agency";
import { saveAgencyPlacement, saveAgencyWorkplace } from "../../utils/agencyApi";
import type { AgencyRights } from "../../utils/agencyRights";
import { formatDateLocalized } from "../../utils/localTime";

interface PlacementsPanelProps {
  worker: AgencyWorker;
  placements: AgencyPlacement[];
  workplaces: AgencyWorkplace[];
  clients: Lead[];
  settings: AgencySettings;
  rights: AgencyRights;
  lang: Language;
  onChanged: () => Promise<void>;
}

export const PlacementsPanel: React.FC<PlacementsPanelProps> = ({
  worker,
  placements,
  workplaces,
  clients,
  settings,
  rights,
  lang,
  onChanged,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    lang === "sk" ? sk : lang === "hu" ? hu : en;

  const companyLeads = clients.filter(
    (c) => c.status === "accepted" && !c.archived && c.clientType !== "person"
  );
  const companyMap = new Map(clients.map((c) => [c.id, c]));
  const workplaceMap = new Map(workplaces.map((w) => [w.id, w]));

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newWorkplaceName, setNewWorkplaceName] = useState("");
  const [creatingWorkplace, setCreatingWorkplace] = useState(false);
  const [form, setForm] = useState({
    companyClientId: companyLeads[0]?.id || "",
    workplaceId: "",
    contactLeadId: "",
    jobRole: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    payRate: worker.defaultPayRate ? String(worker.defaultPayRate) : "",
    billRate: worker.defaultBillRate ? String(worker.defaultBillRate) : "",
    currency: worker.currency || settings.defaultCurrency || "EUR",
    notes: "",
  });

  const companyWorkplaces = workplaces.filter((wp) => wp.companyClientId === form.companyClientId);
  const companyContacts = clients.filter(
    (c) => c.clientType === "person" && !c.archived && c.companyClientId === form.companyClientId
  );

  const handleSavePlacement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyClientId || !form.startDate) return;
    setSaving(true);
    try {
      await saveAgencyPlacement({
        workerId: worker.id,
        companyClientId: form.companyClientId,
        workplaceId: form.workplaceId || null,
        contactLeadId: form.contactLeadId || null,
        jobRole: form.jobRole.trim(),
        status: "active",
        startDate: form.startDate,
        endDate: form.endDate || null,
        currency: form.currency || settings.defaultCurrency,
        notes: form.notes.trim(),
        ...(rights.payments
          ? {
              payRate: form.payRate !== "" ? Number(form.payRate) : 0,
              billRate: form.billRate !== "" ? Number(form.billRate) : 0,
            }
          : {}),
      });
      setShowModal(false);
      await onChanged();
    } finally {
      setSaving(false);
    }
  };

  const handleQuickWorkplace = async () => {
    if (!form.companyClientId || !newWorkplaceName.trim()) return;
    setCreatingWorkplace(true);
    try {
      const wp = await saveAgencyWorkplace({
        companyClientId: form.companyClientId,
        name: newWorkplaceName.trim(),
      });
      setForm((p) => ({ ...p, workplaceId: wp.id }));
      setNewWorkplaceName("");
      await onChanged();
    } finally {
      setCreatingWorkplace(false);
    }
  };

  const handleStatusChange = async (pl: AgencyPlacement, nextStatus: AgencyPlacementStatus) => {
    if (!rights.edit) return;
    await saveAgencyPlacement({
      ...pl,
      status: nextStatus,
      endDate: nextStatus === "ended" && !pl.endDate ? new Date().toISOString().slice(0, 10) : pl.endDate,
    });
    await onChanged();
  };

  return (
    <div className="space-y-4" data-testid="agency-placements-panel">
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="type-panel-title text-slate-900">
            {t("Company Placements & History", "Umiestnenia u klientov a história", "Céges kihelyezések és előzmények")}
          </h3>
          <p className="text-caption text-slate-500">
            {t(
              "Moving a worker to a new company ends the previous active placement cleanly while keeping full history.",
              "Presun pracovníka do novej firmy zachováva celú históriu predchádzajúcich umiestnení.",
              "Új céghez való áthelyezéskor a korábbi kihelyezések teljes története megmarad."
            )}
          </p>
        </div>
        {rights.edit && (
          <button
            type="button"
            onClick={() => {
              setForm((p) => ({
                ...p,
                companyClientId: p.companyClientId || companyLeads[0]?.id || "",
                payRate: worker.defaultPayRate ? String(worker.defaultPayRate) : p.payRate,
                billRate: worker.defaultBillRate ? String(worker.defaultBillRate) : p.billRate,
              }));
              setShowModal(true);
            }}
            data-testid="agency-place-worker-btn"
            className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-ui font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowRightLeft className="size-4" />
            {placements.some((p) => p.status === "active")
              ? t("Transfer / New Placement", "Presunúť do inej firmy", "Áthelyezés")
              : t("Place at Company", "Umiestniť do firmy", "Kihelyezés céghez")}
          </button>
        )}
      </div>

      {placements.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center text-ui text-slate-500">
          {t("Not placed at any company yet.", "Pracovník zatiaľ nemá žiadne umiestnenie.", "Még nincs céges kihelyezés.")}
        </div>
      ) : (
        <div className="space-y-3">
          {placements.map((pl) => {
            const company = companyMap.get(pl.companyClientId);
            const wp = pl.workplaceId ? workplaceMap.get(pl.workplaceId) : undefined;
            const contact = pl.contactLeadId ? companyMap.get(pl.contactLeadId) : undefined;
            const isActive = pl.status === "active";
            return (
              <div
                key={pl.id}
                data-testid={`agency-placement-card-${pl.id}`}
                className={`glass-panel rounded-2xl p-4 flex flex-wrap items-start justify-between gap-3 border ${
                  isActive ? "border-emerald-300/80" : "border-slate-200/80"
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-micro font-bold uppercase px-2 py-0.5 rounded-full border ${
                        isActive
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : pl.status === "paused"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                      }`}
                    >
                      {isActive
                        ? t("Active", "Aktívne", "Aktív")
                        : pl.status === "paused"
                        ? t("Paused", "Pozastavené", "Szüneteltetve")
                        : t("Ended", "Ukončené", "Lezárt")}
                    </span>
                    <span className="text-body font-bold text-slate-900 inline-flex items-center gap-1.5">
                      <Building2 className="size-4 text-teal-600" />
                      {company?.name || pl.companyClientId}
                    </span>
                    {pl.jobRole && (
                      <span className="text-ui text-slate-600">· {pl.jobRole}</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-caption text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="size-3.5 text-slate-400" />
                      {formatDateLocalized(pl.startDate, lang)} →{" "}
                      {pl.endDate ? formatDateLocalized(pl.endDate, lang) : t("Ongoing", "Trvá", "Folyamatban")}
                    </span>
                    {wp && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5 text-slate-400" />
                        {wp.name}
                      </span>
                    )}
                    {contact && (
                      <span className="inline-flex items-center gap-1">
                        <User className="size-3.5 text-slate-400" />
                        {contact.name}
                        {contact.contactRole ? ` (${contact.contactRole})` : ""}
                      </span>
                    )}
                  </div>

                  {rights.payments && (
                    <div className="text-caption font-mono text-slate-700 flex flex-wrap items-center gap-3">
                      <span>
                        {t("Worker Pay:", "Mzda:", "Bér:")} {pl.payRate ?? 0} {pl.currency}/{pl.payRateType === "hourly" ? "h" : "m"}
                      </span>
                      <span>
                        {t("Client Bill:", "Fakturácia:", "Számlázás:")} {pl.billRate ?? 0} {pl.currency}/{pl.billRateType === "hourly" ? "h" : "m"}
                      </span>
                    </div>
                  )}
                  {pl.notes && <div className="text-caption text-slate-500">{pl.notes}</div>}
                </div>

                {rights.edit && isActive && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(pl, "ended")}
                    className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-caption font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <StopCircle className="size-3.5" />
                    {t("End Placement", "Ukončiť umiestnenie", "Lezárás")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSavePlacement}
            className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg p-5 space-y-4"
            data-testid="agency-placement-modal"
          >
            <div className="flex items-center justify-between">
              <h3 className="type-panel-title text-slate-900">
                {t("Assign Worker to External Company", "Prideliť pracovníka do firmy", "Dolgozó kihelyezése céghez")}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-caption font-semibold text-slate-500 cursor-pointer"
              >
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
            </div>

            <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3">
              <div className="ws-sm:col-span-2">
                <label className="type-overline text-slate-500 block mb-1">
                  {t("External Company (Client)", "Externá firma (klient)", "Külső cég (ügyfél)")} *
                </label>
                <select
                  required
                  data-testid="agency-placement-company"
                  value={form.companyClientId}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      companyClientId: e.target.value,
                      workplaceId: "",
                      contactLeadId: "",
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-ui"
                >
                  <option value="">{t("Select company…", "Vyberte firmu…", "Válasszon céget…")}</option>
                  {companyLeads.map((comp) => (
                    <option key={comp.id} value={comp.id}>
                      {comp.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ws-sm:col-span-2">
                <label className="type-overline text-slate-500 block mb-1">
                  {t("Workplace / Site", "Pracovisko / Prevádzka", "Telephely / Munkahely")}
                </label>
                <div className="flex gap-2">
                  <select
                    value={form.workplaceId}
                    onChange={(e) => setForm((p) => ({ ...p, workplaceId: e.target.value }))}
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-ui"
                  >
                    <option value="">—</option>
                    {companyWorkplaces.map((wp) => (
                      <option key={wp.id} value={wp.id}>
                        {wp.name}
                      </option>
                    ))}
                  </select>
                </div>
                {form.companyClientId && (
                  <div className="mt-1.5 flex gap-2">
                    <input
                      type="text"
                      value={newWorkplaceName}
                      onChange={(e) => setNewWorkplaceName(e.target.value)}
                      placeholder={t("Quick add site name…", "Rýchlo pridať pracovisko…", "Új telephely neve…")}
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-caption"
                    />
                    <button
                      type="button"
                      disabled={creatingWorkplace || !newWorkplaceName.trim()}
                      onClick={handleQuickWorkplace}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-caption font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Plus className="size-3.5" />
                      {t("Add Site", "Pridať", "Hozzáadás")}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="type-overline text-slate-500 block mb-1">
                  {t("Company Contact Person", "Kontaktná osoba firmy", "Céges kapcsolattartó")}
                </label>
                <select
                  value={form.contactLeadId}
                  onChange={(e) => setForm((p) => ({ ...p, contactLeadId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-ui"
                >
                  <option value="">—</option>
                  {companyContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.contactRole ? ` (${c.contactRole})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="type-overline text-slate-500 block mb-1">
                  {t("Job Role", "Pracovná pozícia", "Munkakör")}
                </label>
                <input
                  type="text"
                  value={form.jobRole}
                  onChange={(e) => setForm((p) => ({ ...p, jobRole: e.target.value }))}
                  placeholder={t("Line Operator", "Operátor výroby", "Operátor")}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-ui"
                />
              </div>

              <div>
                <label className="type-overline text-slate-500 block mb-1">
                  {t("Start Date", "Dátum nástupu", "Kezdés dátuma")} *
                </label>
                <input
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-ui"
                />
              </div>

              <div>
                <label className="type-overline text-slate-500 block mb-1">
                  {t("End Date (Optional)", "Dátum ukončenia", "Végdátum")}
                </label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-ui"
                />
              </div>

              {rights.payments && (
                <>
                  <div>
                    <label className="type-overline text-slate-500 block mb-1">
                      {t("Worker Pay / h", "Mzda pracovníka / h", "Dolgozói órabér")} ({form.currency})
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      data-testid="agency-placement-pay-rate"
                      value={form.payRate}
                      onChange={(e) => setForm((p) => ({ ...p, payRate: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-ui font-mono"
                    />
                  </div>
                  <div>
                    <label className="type-overline text-slate-500 block mb-1">
                      {t("Client Bill / h", "Fakturácia klientovi / h", "Számlázási óradíj")} ({form.currency})
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      data-testid="agency-placement-bill-rate"
                      value={form.billRate}
                      onChange={(e) => setForm((p) => ({ ...p, billRate: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-ui font-mono"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-ui font-medium cursor-pointer"
              >
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
              <button
                type="submit"
                disabled={saving || !form.companyClientId}
                data-testid="agency-placement-submit"
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-ui font-semibold cursor-pointer disabled:opacity-50"
              >
                {saving ? t("Saving…", "Ukladám…", "Mentés…") : t("Save Placement", "Potvrdiť umiestnenie", "Kihelyezés mentése")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
