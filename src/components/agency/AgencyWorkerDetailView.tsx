import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckSquare,
  ClipboardList,
  Clock,
  Download,
  Eye,
  FileText,
  HeartPulse,
  Lock,
  MessageSquare,
  PencilLine,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  Upload,
  UserCheck,
  X,
} from "lucide-react";
import type { Lead } from "../../types";
import type { Language } from "../../utils/translations";
import {
  resolveLocalizedLabel,
  type AgencyChecklistStatus,
  type AgencyFileCategory,
  type AgencyPlacement,
  type AgencyProfileData,
  type AgencyProfileSchemaField,
  type AgencySettings,
  type AgencyTimelineEventType,
  type AgencyWorker,
  type AgencyWorkerChecklistItem,
  type AgencyWorkerDetailPayload,
  type AgencyWorkerFile,
  type AgencyWorkplace,
} from "../../types/agency";
import {
  agencyFileUrl,
  deleteAgencyFile,
  deleteAgencyWorker,
  fetchAgencyWorkerDetail,
  saveAgencyChecklist,
  saveAgencyTimelineEvent,
  saveAgencyWorker,
  uploadAgencyWorkerFile,
} from "../../utils/agencyApi";
import { getComplianceExpiryState } from "../../utils/agencyCalculations";
import type { AgencyRights } from "../../utils/agencyRights";
import { Tabs } from "../layout/Tabs";

export type AgencyDetailTab = "overview" | "profile" | "compliance" | "placements" | "schedule" | "tasks_tickets";

interface AgencyWorkerDetailViewProps {
  workerId: string;
  lang: Language;
  rights: AgencyRights;
  settings: AgencySettings;
  clients: Lead[];
  workplaces: AgencyWorkplace[];
  onBack: () => void;
  onWorkerUpdated: (worker: AgencyWorker) => void;
  onWorkerDeleted: (workerId: string) => void;
  renderPlacementsTab?: (ctx: {
    detail: AgencyWorkerDetailPayload;
    refresh: () => Promise<void>;
  }) => React.ReactNode;
  renderScheduleTab?: (ctx: {
    detail: AgencyWorkerDetailPayload;
    refresh: () => Promise<void>;
  }) => React.ReactNode;
  renderTasksTicketsTab?: (ctx: {
    detail: AgencyWorkerDetailPayload;
    refresh: () => Promise<void>;
    onQuickRenewTask?: (item: AgencyWorkerChecklistItem) => Promise<void>;
  }) => React.ReactNode;
  onQuickRenewTask?: (worker: AgencyWorker, item: AgencyWorkerChecklistItem) => Promise<void>;
}

const TIMELINE_EVENT_META: Record<
  AgencyTimelineEventType,
  { en: string; sk: string; hu: string; badgeClass: string; Icon: React.FC<{ className?: string }> }
> = {
  stage_change: { en: "Stage", sk: "Fáza", hu: "Fázis", badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200", Icon: UserCheck },
  contact: { en: "Contacted", sk: "Kontakt", hu: "Kapcsolat", badgeClass: "bg-sky-50 text-sky-700 border-sky-200", Icon: MessageSquare },
  placement: { en: "Company Placement", sk: "Pridelenie firmy", hu: "Céges kihelyezés", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: Building2 },
  sick_leave: { en: "Sick Leave", sk: "Práceneschopnosť", hu: "Betegszabadság", badgeClass: "bg-rose-50 text-rose-700 border-rose-200", Icon: HeartPulse },
  compliance: { en: "Compliance", sk: "Doklady", hu: "Dokumentum", badgeClass: "bg-amber-50 text-amber-700 border-amber-200", Icon: ShieldAlert },
  note: { en: "Note", sk: "Poznámka", hu: "Megjegyzés", badgeClass: "bg-slate-100 text-slate-700 border-slate-200", Icon: FileText },
  work_log: { en: "Shift Worked", sk: "Odpracovaná zmena", hu: "Ledolgozott műszak", badgeClass: "bg-slate-100 text-slate-600 border-slate-200", Icon: Clock },
};

function getInitials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AG";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

export const AgencyWorkerDetailView: React.FC<AgencyWorkerDetailViewProps> = ({
  workerId,
  lang,
  rights,
  settings,
  clients,
  workplaces,
  onBack,
  onWorkerUpdated,
  onWorkerDeleted,
  renderPlacementsTab,
  renderScheduleTab,
  renderTasksTicketsTab,
  onQuickRenewTask,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    lang === "sk" ? sk : lang === "hu" ? hu : en;

  const [detail, setDetail] = useState<AgencyWorkerDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<AgencyDetailTab>("overview");
  const [showWorkLogs, setShowWorkLogs] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditingLeft, setIsEditingLeft] = useState(false);

  // Quick timeline log form
  const [tlForm, setTlForm] = useState({
    eventType: "contact" as Exclude<AgencyTimelineEventType, "work_log">,
    title: "",
    description: "",
    occurredAt: new Date().toISOString().slice(0, 10),
  });

  // Editable profile state
  const [profileDraft, setProfileDraft] = useState<AgencyProfileData>({});
  const [basicDraft, setBasicDraft] = useState({
    fullName: "",
    preferredName: "",
    email: "",
    phone: "",
    nationality: "",
    dateOfBirth: "",
    assignedRecruiter: "",
    notes: "",
    defaultPayRate: "",
    defaultBillRate: "",
  });

  // Upload form state
  const [uploadCategory, setUploadCategory] = useState<AgencyFileCategory>("other");
  const [previewFile, setPreviewFile] = useState<AgencyWorkerFile | null>(null);

  const syncDraftsFromWorker = (w: AgencyWorker) => {
    setProfileDraft((w.profile || {}) as AgencyProfileData);
    setBasicDraft({
      fullName: w.fullName || "",
      preferredName: w.preferredName || "",
      email: w.email || "",
      phone: w.phone || "",
      nationality: w.nationality || "",
      dateOfBirth: w.dateOfBirth || "",
      assignedRecruiter: w.assignedRecruiter || "",
      notes: w.notes || "",
      defaultPayRate: w.defaultPayRate !== null && w.defaultPayRate !== undefined ? String(w.defaultPayRate) : "",
      defaultBillRate: w.defaultBillRate !== null && w.defaultBillRate !== undefined ? String(w.defaultBillRate) : "",
    });
  };

  const loadDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAgencyWorkerDetail(workerId);
      setDetail(data);
      syncDraftsFromWorker(data.worker);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load worker");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [workerId]);

  if (loading && !detail) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center text-ui text-slate-500">
        {t("Loading profile…", "Načítavam profil…", "Profil betöltése…")}
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="glass-panel rounded-2xl p-6 space-y-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-ui font-semibold text-slate-700 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="size-4" />
          {t("Back", "Späť", "Vissza")}
        </button>
        <div className="text-body font-semibold text-rose-700">{error || t("Not found", "Nenájdené", "Nem található")}</div>
      </div>
    );
  }

  const { worker, placements, checklist, files, timeline } = detail;
  const activePlacement: AgencyPlacement | undefined = placements.find((p) => p.status === "active");
  const activeCompanyName = activePlacement
    ? clients.find((c) => c.id === activePlacement.companyClientId)?.name || activePlacement.companyClientId
    : null;
  const activeWorkplaceName = activePlacement?.workplaceId
    ? workplaces.find((w) => w.id === activePlacement.workplaceId)?.name || null
    : null;

  const handleStageChange = async (nextStageId: string) => {
    if (!rights.edit) return;
    const saved = await saveAgencyWorker({
      ...worker,
      stageId: nextStageId,
    });
    onWorkerUpdated(saved);
    await loadDetail();
  };

  const handleLogEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rights.edit || !tlForm.title.trim()) return;
    setSaving(true);
    try {
      await saveAgencyTimelineEvent({
        workerId: worker.id,
        eventType: tlForm.eventType,
        title: tlForm.title.trim(),
        description: tlForm.description.trim(),
        occurredAt: tlForm.occurredAt,
      });
      setTlForm((p) => ({ ...p, title: "", description: "" }));
      await loadDetail();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rights.edit) return;
    setSaving(true);
    try {
      const saved = await saveAgencyWorker({
        id: worker.id,
        fullName: basicDraft.fullName.trim() || worker.fullName,
        preferredName: basicDraft.preferredName.trim(),
        email: basicDraft.email.trim(),
        phone: basicDraft.phone.trim(),
        nationality: basicDraft.nationality.trim(),
        dateOfBirth: basicDraft.dateOfBirth.trim(),
        assignedRecruiter: basicDraft.assignedRecruiter.trim(),
        notes: basicDraft.notes,
        stageId: worker.stageId,
        workerStatus: worker.workerStatus,
        profile: profileDraft,
        ...(rights.payments
          ? {
               defaultPayRate: basicDraft.defaultPayRate !== "" ? Number(basicDraft.defaultPayRate) : 0,
               defaultBillRate: basicDraft.defaultBillRate !== "" ? Number(basicDraft.defaultBillRate) : 0,
             }
          : {}),
      });
      setIsEditingLeft(false);
      onWorkerUpdated(saved);
      await loadDetail();
    } finally {
      setSaving(false);
    }
  };

  const handleChecklistChange = async (idx: number, patch: Partial<AgencyWorkerChecklistItem>) => {
    if (!rights.edit) return;
    const updated = checklist.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    await saveAgencyChecklist(worker.id, updated);
    await loadDetail();
  };

  const handleFileUpload = async (file: File | undefined, cat: AgencyFileCategory, checklistItemId?: string | null) => {
    if (!file || !rights.edit) return;
    await uploadAgencyWorkerFile(worker.id, cat, file, checklistItemId);
    await loadDetail();
  };

  const handleDeleteWorker = async () => {
    if (!rights.delete) return;
    await deleteAgencyWorker(worker.id);
    onWorkerDeleted(worker.id);
  };

  const setProfileValue = (sectionId: string, fieldKey: string, val: unknown) => {
    setProfileDraft((prev) => ({
      ...prev,
      [sectionId]: {
        ...(prev[sectionId] || {}),
        [fieldKey]: val,
      },
    }));
  };

  const renderSchemaField = (sectionId: string, field: AgencyProfileSchemaField) => {
    const val = profileDraft[sectionId]?.[field.key];
    const strVal = val === undefined || val === null ? "" : String(val);

    if (field.type === "checkbox") {
      return (
        <label key={field.key} className="inline-flex items-center gap-2 text-ui text-slate-800 cursor-pointer pt-5">
          <input
            type="checkbox"
            disabled={!rights.edit}
            checked={Boolean(val)}
            onChange={(e) => setProfileValue(sectionId, field.key, e.target.checked)}
          />
          <span>{resolveLocalizedLabel(field.label, lang)}</span>
        </label>
      );
    }
    if (field.type === "select") {
      return (
        <div key={field.key}>
          <label className="type-overline text-slate-500 block mb-1">
            {resolveLocalizedLabel(field.label, lang)} {field.required ? "*" : ""}
          </label>
          <select
            disabled={!rights.edit}
            value={strVal}
            onChange={(e) => setProfileValue(sectionId, field.key, e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-ui"
          >
            <option value="">—</option>
            {(field.options || []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );
    }
    if (field.type === "textarea") {
      return (
        <div key={field.key} className="ws-sm:col-span-2">
          <label className="type-overline text-slate-500 block mb-1">
            {resolveLocalizedLabel(field.label, lang)} {field.required ? "*" : ""}
          </label>
          <textarea
            rows={2}
            disabled={!rights.edit}
            value={strVal}
            onChange={(e) => setProfileValue(sectionId, field.key, e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-ui"
          />
        </div>
      );
    }
    return (
      <div key={field.key}>
        <label className="type-overline text-slate-500 block mb-1">
          {resolveLocalizedLabel(field.label, lang)} {field.required ? "*" : ""}
        </label>
        <input
          type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
          disabled={!rights.edit}
          value={strVal}
          onChange={(e) => setProfileValue(sectionId, field.key, e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-ui"
        />
      </div>
    );
  };

  const verifiedDocsCount = checklist.filter((c) => c.status === "verified").length;
  const passportNum = String(profileDraft.passport?.number || "");
  const passportValid = String(profileDraft.passport?.validUntil || "");
  const permitNum = String(profileDraft.permit?.permitNumber || "");

  const visibleTimeline = showWorkLogs
    ? timeline
    : timeline.filter((ev) => ev.eventType !== "work_log");

  return (
    <div className="space-y-5" data-testid="agency-worker-detail">
      {/* Top Action & Stage Bar */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-caption font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="size-3.5" />
            {t("Back", "Späť", "Vissza")}
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-title font-bold text-slate-900 truncate">{worker.fullName}</h2>
              {worker.workerCode && (
                <span className="text-micro font-mono px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600">
                  {worker.workerCode}
                </span>
              )}
              <span
                className={`text-micro font-bold uppercase px-2 py-0.5 rounded-full border ${
                  worker.workerStatus === "rented"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-sky-50 text-sky-700 border-sky-200"
                }`}
              >
                {worker.workerStatus === "rented"
                  ? t("Rented Employee", "Prenajatý zamestnanec", "Kölcsönzött dolgozó")
                  : t("Candidate", "Kandidát", "Jelölt")}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            disabled={!rights.edit}
            value={worker.stageId}
            onChange={(e) => handleStageChange(e.target.value)}
            aria-label={t("Stage", "Fáza", "Fázis")}
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-ui font-semibold text-slate-800"
          >
            {settings.stages.map((st) => (
              <option key={st.id} value={st.id}>
                {resolveLocalizedLabel(st.label, lang)}
              </option>
            ))}
          </select>
          {rights.delete && (
            <button
              type="button"
              onClick={handleDeleteWorker}
              className="p-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
              title={t("Delete profile", "Zmazať profil", "Profil törlése")}
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Master Dual-Panel Dashboard Grid (matches Leads & Clients Detail Layout) */}
      <div className="grid grid-cols-1 ws-lg:grid-cols-12 gap-6 items-start">
        {/* LEFT PANEL: Active Company Card + Crucial Worker Information */}
        <div className="ws-lg:col-span-5 space-y-6">
          {activePlacement && (
            <div className="glass-panel p-5 rounded-[28px] border-2 border-emerald-400 bg-emerald-50/70 shadow-xl space-y-3 text-emerald-950">
              <div className="border-b-2 border-emerald-200/50 pb-2 flex items-center justify-between gap-2">
                <span className="text-ui font-bold text-emerald-700 flex items-center gap-1.5">
                  <Building2 className="size-4 text-emerald-600 shrink-0" />
                  {t("Active Host Company", "Aktuálne pridelená firma", "Aktuális fogadó cég")}
                </span>
                <button
                  type="button"
                  onClick={() => setTab("placements")}
                  className="px-2.5 py-0.5 rounded-full type-overline bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-200 cursor-pointer"
                >
                  {t("Manage", "Spravovať", "Kezelés")}
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-2 border-emerald-700 flex items-center justify-center font-heading font-bold text-body shadow">
                  {getInitials(activeCompanyName || "CO")}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-body font-bold text-slate-900 truncate">{activeCompanyName}</h4>
                  <div className="text-caption text-emerald-800 truncate">
                    {activePlacement.jobRole || t("Rented Worker", "Prenajatý pracovník", "Kölcsönzött dolgozó")}
                    {activeWorkplaceName ? ` · ${activeWorkplaceName}` : ""}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-200/60 text-caption">
                <div>
                  <span className="type-overline text-emerald-700/80 block">{t("Since", "Od", "Kezdés")}</span>
                  <span className="font-mono font-bold text-slate-900">{activePlacement.startDate}</span>
                </div>
                {rights.payments && (
                  <div>
                    <span className="type-overline text-emerald-700/80 block">{t("Pay / Bill Rate", "Mzda / Fakturácia", "Bér / Számlázás")}</span>
                    <span className="font-mono font-bold text-slate-900">
                      {activePlacement.payRate ?? "—"} / {activePlacement.billRate ?? "—"} {activePlacement.currency}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="glass-panel p-6 rounded-[28px] border-2 border-teal-400 bg-white shadow-xl space-y-5">
            <div className="border-b-2 border-slate-100 pb-4 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 text-white border-2 border-teal-700 flex items-center justify-center font-heading font-bold text-body shadow-md shrink-0">
                  {getInitials(basicDraft.fullName || worker.fullName)}
                </div>
                <div className="min-w-0">
                  <h3 className="text-body font-heading font-bold text-slate-900 uppercase tracking-tight truncate">
                    {t("Key Worker Details", "Kľúčové údaje pracovníka", "Kulcsadatok")}
                  </h3>
                  <p className="type-overline text-slate-400 mt-0.5">
                    {t("Identity, contact & rates", "Identita, kontakt a sadzby", "Személyazonosság, kapcsolat és díjak")}
                  </p>
                </div>
              </div>

              {rights.edit && (
                <button
                  type="button"
                  onClick={() => {
                    if (isEditingLeft) syncDraftsFromWorker(worker);
                    setIsEditingLeft(!isEditingLeft);
                  }}
                  className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all border-2 shadow-2xs cursor-pointer ${
                    isEditingLeft
                      ? "bg-rose-50 border-rose-300 text-rose-600 hover:bg-rose-100"
                      : "bg-teal-50 border-teal-300 text-teal-700 hover:bg-teal-100"
                  }`}
                  title={
                    isEditingLeft
                      ? t("Cancel editing", "Zrušiť úpravy", "Szerkesztés megszakítása")
                      : t("Edit details", "Upraviť údaje", "Adatok szerkesztése")
                  }
                >
                  {isEditingLeft ? <X className="size-4" /> : <PencilLine className="size-4" />}
                </button>
              )}
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4 text-ui font-bold">
              <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="type-overline text-slate-500 block">
                    {t("Full Name", "Celé meno", "Teljes név")} *
                  </label>
                  <input
                    type="text"
                    required
                    readOnly={!isEditingLeft}
                    value={basicDraft.fullName}
                    onChange={(e) => setBasicDraft((p) => ({ ...p, fullName: e.target.value }))}
                    className={`w-full px-3 py-2 rounded-xl focus:outline-none transition-all ${
                      isEditingLeft
                        ? "bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-teal-500 text-slate-800"
                        : "bg-transparent border-0 pl-0 text-slate-900 text-body font-bold cursor-default"
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="type-overline text-slate-500 block">
                    {t("Nationality", "Štátna príslušnosť", "Állampolgárság")}
                  </label>
                  <input
                    type="text"
                    readOnly={!isEditingLeft}
                    value={basicDraft.nationality}
                    onChange={(e) => setBasicDraft((p) => ({ ...p, nationality: e.target.value }))}
                    placeholder="—"
                    className={`w-full px-3 py-2 rounded-xl focus:outline-none transition-all ${
                      isEditingLeft
                        ? "bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-teal-500 text-slate-800"
                        : "bg-transparent border-0 pl-0 text-slate-900 text-body font-bold cursor-default"
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="type-overline text-slate-500 block">
                    {t("Phone", "Telefón", "Telefon")}
                  </label>
                  <input
                    type="text"
                    readOnly={!isEditingLeft}
                    value={basicDraft.phone}
                    onChange={(e) => setBasicDraft((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="—"
                    className={`w-full px-3 py-2 rounded-xl focus:outline-none transition-all ${
                      isEditingLeft
                        ? "bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-teal-500 text-slate-800"
                        : "bg-transparent border-0 pl-0 text-slate-900 font-bold cursor-default"
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="type-overline text-slate-500 block">
                    {t("Email", "E-mail", "E-mail")}
                  </label>
                  <input
                    type="email"
                    readOnly={!isEditingLeft}
                    value={basicDraft.email}
                    onChange={(e) => setBasicDraft((p) => ({ ...p, email: e.target.value }))}
                    placeholder="—"
                    className={`w-full px-3 py-2 rounded-xl focus:outline-none transition-all ${
                      isEditingLeft
                        ? "bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-teal-500 text-slate-800"
                        : "bg-transparent border-0 pl-0 text-slate-900 font-bold cursor-default"
                    }`}
                  />
                </div>

                {rights.personal && (
                  <div className="space-y-1">
                    <label className="type-overline text-slate-500 block">
                      {t("Date of Birth", "Dátum narodenia", "Születési dátum")}
                    </label>
                    <input
                      type={isEditingLeft ? "date" : "text"}
                      readOnly={!isEditingLeft}
                      value={basicDraft.dateOfBirth || (isEditingLeft ? "" : "—")}
                      onChange={(e) => setBasicDraft((p) => ({ ...p, dateOfBirth: e.target.value }))}
                      className={`w-full px-3 py-2 rounded-xl focus:outline-none transition-all font-mono ${
                        isEditingLeft
                          ? "bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-teal-500 text-slate-800"
                          : "bg-transparent border-0 pl-0 text-slate-900 font-bold cursor-default"
                      }`}
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="type-overline text-slate-500 block">
                    {t("Recruiter", "Náborár", "Toborzó")}
                  </label>
                  <input
                    type="text"
                    readOnly={!isEditingLeft}
                    value={basicDraft.assignedRecruiter}
                    onChange={(e) => setBasicDraft((p) => ({ ...p, assignedRecruiter: e.target.value }))}
                    placeholder="—"
                    className={`w-full px-3 py-2 rounded-xl focus:outline-none transition-all ${
                      isEditingLeft
                        ? "bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-teal-500 text-slate-800"
                        : "bg-transparent border-0 pl-0 text-slate-900 font-bold cursor-default"
                    }`}
                  />
                </div>

                {rights.payments && (
                  <>
                    <div className="space-y-1">
                      <label className="type-overline text-slate-500 block">
                        {t("Default Pay Rate", "Základná mzda", "Alap órabér")} ({worker.currency})
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        readOnly={!isEditingLeft}
                        value={basicDraft.defaultPayRate}
                        onChange={(e) => setBasicDraft((p) => ({ ...p, defaultPayRate: e.target.value }))}
                        placeholder="0"
                        className={`w-full px-3 py-2 rounded-xl focus:outline-none transition-all font-mono ${
                          isEditingLeft
                            ? "bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-teal-500 text-slate-800"
                            : "bg-transparent border-0 pl-0 text-slate-900 font-bold cursor-default"
                        }`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="type-overline text-slate-500 block">
                        {t("Default Bill Rate", "Fakturačná sadzba", "Számlázási díj")} ({worker.currency})
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        readOnly={!isEditingLeft}
                        value={basicDraft.defaultBillRate}
                        onChange={(e) => setBasicDraft((p) => ({ ...p, defaultBillRate: e.target.value }))}
                        placeholder="0"
                        className={`w-full px-3 py-2 rounded-xl focus:outline-none transition-all font-mono ${
                          isEditingLeft
                            ? "bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-teal-500 text-slate-800"
                            : "bg-transparent border-0 pl-0 text-slate-900 font-bold cursor-default"
                        }`}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Crucial Document & Compliance Summary on Left Panel */}
              <div className="border-t-2 border-slate-100 pt-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="type-overline text-slate-500">
                    {t("Documents & Compliance", "Doklady a súlad", "Okmányok és megfelelőség")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTab("compliance")}
                    className="text-micro font-bold text-teal-700 hover:underline cursor-pointer"
                  >
                    {verifiedDocsCount}/{checklist.length} {t("verified", "overených", "ellenőrizve")}
                  </button>
                </div>
                {rights.personal ? (
                  <div className="grid grid-cols-2 gap-2 text-caption">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="type-overline text-slate-400 block">{t("Passport", "Pas", "Útlevél")}</span>
                      <span className="font-mono font-bold text-slate-800">{passportNum || "—"}</span>
                      {passportValid && <span className="text-micro text-slate-500 block">{passportValid}</span>}
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="type-overline text-slate-400 block">{t("Permit", "Povolenie", "Engedély")}</span>
                      <span className="font-mono font-bold text-slate-800">{permitNum || "—"}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-caption text-amber-700 flex items-center gap-1.5">
                    <Lock className="size-3.5 shrink-0" />
                    <span>{t("Protected (agency.personal)", "Chránené (agency.personal)", "Védett (agency.personal)")}</span>
                  </div>
                )}
              </div>

              {/* Internal Notes */}
              <div className="border-t-2 border-slate-100 pt-3.5 space-y-1">
                <label className="type-overline text-slate-500 block">
                  {t("Internal Notes", "Interné poznámky", "Belső megjegyzés")}
                </label>
                <textarea
                  rows={2}
                  readOnly={!isEditingLeft}
                  value={basicDraft.notes}
                  onChange={(e) => setBasicDraft((p) => ({ ...p, notes: e.target.value }))}
                  placeholder={t("Add notes…", "Pridať poznámku…", "Megjegyzés…")}
                  className={`w-full px-3 py-2 rounded-xl focus:outline-none transition-all font-normal ${
                    isEditingLeft
                      ? "bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-teal-500 text-slate-800"
                      : "bg-slate-50/60 border border-slate-200/60 text-slate-700 cursor-default"
                  }`}
                />
              </div>

              {isEditingLeft && rights.edit && (
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-ui font-bold inline-flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Save className="size-4" />
                  {saving ? t("Saving…", "Ukladám…", "Mentés…") : t("Save Changes", "Uložiť zmeny", "Módosítások mentése")}
                </button>
              )}
            </form>
          </div>
        </div>

        {/* RIGHT PANEL: Tabbed Workspace (Timeline, Details, Compliance, Placements, Schedule, Tasks & Tickets) */}
        <div className="ws-lg:col-span-7">
          <div className="glass-panel p-6 rounded-[28px] border-2 border-teal-400 bg-white shadow-xl space-y-6">
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                {
                  key: "overview",
                  testId: "agency-detail-tab-overview",
                  icon: <Clock className="size-4" />,
                  label: t("Timeline", "História", "Idővonal"),
                  count: timeline.length || undefined,
                },
                {
                  key: "profile",
                  testId: "agency-detail-tab-profile",
                  icon: <FileText className="size-4" />,
                  label: t("Details", "Údaje", "Adatok"),
                },
                {
                  key: "compliance",
                  testId: "agency-detail-tab-compliance",
                  icon: <ClipboardList className="size-4" />,
                  label: t("Documents", "Doklady a súbory", "Dokumentumok"),
                  count: files.length || undefined,
                },
                {
                  key: "placements",
                  testId: "agency-detail-tab-placements",
                  icon: <Building2 className="size-4" />,
                  label: t("Placements", "Umiestnenia", "Kihelyezések"),
                  count: placements.length || undefined,
                },
                {
                  key: "schedule",
                  testId: "agency-detail-tab-schedule",
                  icon: <Calendar className="size-4" />,
                  label: t("Schedule", "Rozpis zmien", "Műszakok"),
                },
                {
                  key: "tasks_tickets",
                  testId: "agency-detail-tab-tasks_tickets",
                  icon: <CheckSquare className="size-4" />,
                  label: t("Tasks & Tickets", "Úlohy a tikety", "Feladatok és jegyek"),
                },
              ]}
            />

            {tab === "overview" && (
              <div className="space-y-6">
                {rights.edit && (
                  <form
                    onSubmit={handleLogEvent}
                    className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-3"
                    data-testid="agency-log-event-form"
                  >
                    <h3 className="text-ui font-bold text-teal-700 flex items-center gap-1.5 border-b border-slate-200/80 pb-2">
                      <PencilLine className="size-4 text-teal-600" />
                      {t("Log Timeline Event", "Pridať udalosť do histórie", "Esemény rögzítése")}
                    </h3>
                    <div className="grid grid-cols-1 ws-sm:grid-cols-3 gap-3">
                      <div>
                        <label className="type-overline text-slate-500 block mb-1">
                          {t("Event Type", "Typ udalosti", "Típus")}
                        </label>
                        <select
                          value={tlForm.eventType}
                          onChange={(e) =>
                            setTlForm((p) => ({
                              ...p,
                              eventType: e.target.value as Exclude<AgencyTimelineEventType, "work_log">,
                            }))
                          }
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-ui"
                        >
                          <option value="contact">{t("Contacted", "Kontaktovaný", "Kapcsolatfelvétel")}</option>
                          <option value="sick_leave">{t("Sick Leave / Illness", "PN / Choroba", "Betegszabadság")}</option>
                          <option value="note">{t("Note", "Poznámka", "Megjegyzés")}</option>
                          <option value="compliance">{t("Compliance", "Doklady", "Dokumentum")}</option>
                        </select>
                      </div>
                      <div className="ws-sm:col-span-2">
                        <label className="type-overline text-slate-500 block mb-1">
                          {t("Title", "Názov", "Cím")} *
                        </label>
                        <input
                          type="text"
                          required
                          value={tlForm.title}
                          onChange={(e) => setTlForm((p) => ({ ...p, title: e.target.value }))}
                          placeholder={t("Called candidate about onboarding…", "Telefonát ohľadom nástupu…", "Telefonhívás…")}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-ui"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 ws-sm:grid-cols-3 gap-3 items-end">
                      <div>
                        <label className="type-overline text-slate-500 block mb-1">
                          {t("Date", "Dátum", "Dátum")}
                        </label>
                        <input
                          type="date"
                          value={tlForm.occurredAt}
                          onChange={(e) => setTlForm((p) => ({ ...p, occurredAt: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-ui"
                        />
                      </div>
                      <div>
                        <label className="type-overline text-slate-500 block mb-1">
                          {t("Details", "Detaily", "Részletek")}
                        </label>
                        <input
                          type="text"
                          value={tlForm.description}
                          onChange={(e) => setTlForm((p) => ({ ...p, description: e.target.value }))}
                          placeholder={t("Optional details…", "Voliteľný popis…", "Részletek…")}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-ui"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-ui font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="size-4" />
                        {t("Record Event", "Uložiť udalosť", "Mentés")}
                      </button>
                    </div>
                  </form>
                )}

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="type-panel-title text-slate-900">
                      {t("Lifecycle Timeline", "Časová os udalostí", "Életút idővonal")}
                    </h3>
                    <label className="inline-flex items-center gap-1.5 text-caption text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showWorkLogs}
                        onChange={(e) => setShowWorkLogs(e.target.checked)}
                      />
                      {t("Show compact shift work logs", "Zobraziť kompaktné záznamy zmien", "Műszaknaplók megjelenítése")}
                    </label>
                  </div>

                  {visibleTimeline.length === 0 ? (
                    <div className="text-ui text-slate-400 py-6 text-center">
                      {t("No timeline events yet.", "Zatiaľ žiadne udalosti.", "Még nincsenek események.")}
                    </div>
                  ) : (
                    <div className="space-y-2" data-testid="agency-worker-timeline">
                      {visibleTimeline.map((ev) => {
                        const meta = TIMELINE_EVENT_META[ev.eventType] || TIMELINE_EVENT_META.note;
                        const Icon = meta.Icon;
                        if (ev.eventType === "work_log") {
                          return (
                            <div
                              key={ev.id}
                              data-timeline-kind="work_log"
                              data-testid={`agency-timeline-item-${ev.eventType}`}
                              className="py-1 px-2.5 rounded-lg bg-slate-50/90 border border-slate-200/70 flex items-center justify-between gap-2 text-micro text-slate-600"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Clock className="size-3 text-slate-400 shrink-0" />
                                <span className="truncate font-medium">{ev.title}</span>
                                {ev.description && <span className="text-slate-400 truncate">· {ev.description}</span>}
                              </div>
                              <span className="font-mono text-slate-400 shrink-0">{ev.occurredAt.slice(0, 10)}</span>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={ev.id}
                            data-timeline-kind="milestone"
                            data-testid={`agency-timeline-item-${ev.eventType}`}
                            className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-1.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-micro font-semibold ${meta.badgeClass}`}>
                                  <Icon className="size-3.5" />
                                  {t(meta.en, meta.sk, meta.hu)}
                                </span>
                                <span className="text-body font-bold text-slate-900">{ev.title}</span>
                              </div>
                              <span className="text-caption font-mono text-slate-400">{ev.occurredAt.slice(0, 16)}</span>
                            </div>
                            {ev.description && (
                              <p className="text-ui text-slate-600 leading-relaxed">{ev.description}</p>
                            )}
                            {ev.createdBy && (
                              <div className="text-micro text-slate-400">{ev.createdBy}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "profile" && (
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="type-panel-title text-slate-900">
                    {t("Worker Profile Details", "Podrobné údaje pracovníka", "Részletes adatok")}
                  </h3>
                  {rights.edit && (
                    <button
                      type="submit"
                      disabled={saving}
                      data-testid="agency-save-profile-btn"
                      className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-ui font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save className="size-4" />
                      {saving ? t("Saving…", "Ukladám…", "Mentés…") : t("Save Details", "Uložiť údaje", "Adatok mentése")}
                    </button>
                  )}
                </div>

                {!rights.personal && (
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-ui font-semibold flex items-center gap-2">
                    <Lock className="size-4 shrink-0" />
                    {t(
                      "Sensitive personal, passport, permit, address and family fields are hidden (agency.personal permission required).",
                      "Citlivé osobné údaje, pas, povolenia, adresy a rodinné údaje sú skryté (vyžaduje oprávnenie agency.personal).",
                      "Az érzékeny személyes, útlevél, engedély és családi adatok rejtve vannak (agency.personal jogosultság szükséges)."
                    )}
                  </div>
                )}

                {settings.profileSchema
                  .filter((sec) => sec.enabled && (!sec.sensitive || rights.personal))
                  .map((sec) => (
                    <div key={sec.id} className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="type-panel-title text-slate-900">
                          {resolveLocalizedLabel(sec.label, lang)}
                        </h4>
                        {sec.sensitive && (
                          <span className="inline-flex items-center gap-1 text-micro font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            <Lock className="size-3" />
                            {t("Protected", "Chránené", "Védett")}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 ws-sm:grid-cols-2 ws-md:grid-cols-3 gap-3">
                        {sec.fields.map((field) => renderSchemaField(sec.id, field))}
                        {(sec.customFields || []).map((field) => renderSchemaField(sec.id, field))}
                      </div>
                    </div>
                  ))}
              </form>
            )}

            {tab === "compliance" && (
              <div className="space-y-5">
                <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-3">
                  <h3 className="type-panel-title text-slate-900 flex items-center gap-2">
                    <ClipboardList className="size-4 text-teal-600" />
                    {t("Compliance Checklist", "Kontrolný zoznam dokladov", "Megfelelőségi lista")}
                  </h3>
                  <div className="space-y-2.5">
                    {checklist.map((item, idx) => {
                      const expState = getComplianceExpiryState(item.expiresAt);
                      const tplItem = settings.checklistItems.find((tpl) => tpl.key === item.itemKey);
                      const isRequired = Boolean(tplItem?.required);
                      const attachedFile =
                        (item.fileId ? files.find((f) => f.id === item.fileId) : undefined) ||
                        files.find((f) => f.checklistItemId === item.id);
                      const hasDoc = Boolean(attachedFile) || item.status === "submitted" || item.status === "verified";
                      const isExpiredState = item.status === "expired" || expState === "expired";

                      const rowClasses = isExpiredState
                        ? "bg-rose-50/80 border-rose-300"
                        : hasDoc
                          ? "bg-emerald-50/80 border-emerald-300"
                          : isRequired
                            ? "bg-rose-50/80 border-rose-300"
                            : "bg-amber-50/80 border-amber-300";

                      return (
                        <div
                          key={item.id}
                          data-testid={`agency-checklist-row-${item.itemKey}`}
                          className={`p-3 rounded-xl border space-y-2 transition-colors ${rowClasses}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <span className="text-ui font-bold text-slate-900">
                                {tplItem ? resolveLocalizedLabel(tplItem.label, lang) : item.label}
                              </span>
                              {isRequired ? (
                                <span
                                  className={`text-micro font-bold px-2 py-0.5 rounded-full border ${
                                    hasDoc && !isExpiredState
                                      ? "bg-emerald-100/80 text-emerald-800 border-emerald-300"
                                      : "bg-rose-100/80 text-rose-800 border-rose-300"
                                  }`}
                                >
                                  {t("Required", "Povinné", "Kötelező")}
                                </span>
                              ) : (
                                <span
                                  className={`text-micro font-bold px-2 py-0.5 rounded-full border ${
                                    hasDoc && !isExpiredState
                                      ? "bg-emerald-100/80 text-emerald-800 border-emerald-300"
                                      : "bg-amber-100/80 text-amber-800 border-amber-300"
                                  }`}
                                >
                                  {t("Optional", "Nepovinné", "Opcionális")}
                                </span>
                              )}
                            </div>
                            <select
                              disabled={!rights.edit}
                              value={item.status}
                              onChange={(e) =>
                                handleChecklistChange(idx, { status: e.target.value as AgencyChecklistStatus })
                              }
                              className={`px-2.5 py-1 rounded-lg border text-caption font-semibold ${
                                isExpiredState
                                  ? "bg-white/90 border-rose-300 text-rose-800"
                                  : hasDoc
                                    ? "bg-white/90 border-emerald-300 text-emerald-800"
                                    : isRequired
                                      ? "bg-white/90 border-rose-300 text-rose-800"
                                      : "bg-white/90 border-amber-300 text-amber-800"
                              }`}
                            >
                              <option value="missing">{t("Missing", "Chýba", "Hiányzik")}</option>
                              <option value="submitted">{t("Submitted", "Odovzdané", "Leadva")}</option>
                              <option value="verified">{t("Verified", "Overené", "Ellenőrizve")}</option>
                              <option value="expired">{t("Expired", "Expirované", "Lejárt")}</option>
                            </select>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="text-micro text-slate-600 flex items-center gap-1">
                              <Calendar className="size-3" />
                              {t("Expires:", "Platnosť do:", "Lejárat:")}
                            </label>
                            <input
                              type="date"
                              disabled={!rights.edit}
                              value={item.expiresAt || ""}
                              onChange={(e) =>
                                handleChecklistChange(idx, { expiresAt: e.target.value || null })
                              }
                              className="px-2 py-1 rounded-lg bg-white/90 border border-slate-200 text-caption"
                            />
                            {expState !== "ok" && (
                              <span
                                className={`text-micro font-bold px-2 py-0.5 rounded-full ${
                                  expState === "expired"
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {expState === "expired"
                                  ? t("Expired", "Expirované", "Lejárt")
                                  : t("Expiring soon", "Čoskoro expiruje", "Hamarosan lejár")}
                              </span>
                            )}
                            {attachedFile && (
                              <button
                                type="button"
                                onClick={() => setPreviewFile(attachedFile)}
                                data-testid={`agency-checklist-file-${item.itemKey}`}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/95 hover:bg-white border border-emerald-300 text-emerald-800 text-caption font-semibold shadow-2xs cursor-pointer max-w-60"
                                title={attachedFile.fileName}
                              >
                                <FileText className="size-3.5 shrink-0 text-emerald-600" />
                                <span className="truncate underline decoration-emerald-400 underline-offset-2">
                                  {attachedFile.fileName}
                                </span>
                              </button>
                            )}
                            {rights.edit && (
                              <label className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/90 hover:bg-white border border-slate-200/90 text-micro font-semibold text-slate-700 cursor-pointer shadow-2xs">
                                <Upload className="size-3" />
                                {attachedFile
                                  ? t("Replace", "Nahradiť", "Csere")
                                  : t("Attach", "Priložiť", "Csatolás")}
                                <input
                                  type="file"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    const inferredCat: AgencyFileCategory =
                                      item.itemKey === "passport"
                                        ? "passport"
                                        : item.itemKey === "permit"
                                          ? "permit"
                                          : item.itemKey === "medical"
                                            ? "medical"
                                            : item.itemKey === "contract"
                                              ? "contract"
                                              : "other";
                                    handleFileUpload(file, inferredCat, item.id);
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            )}
                            {onQuickRenewTask && (expState === "expired" || expState === "expiring") && (
                              <button
                                type="button"
                                onClick={() => onQuickRenewTask(worker, item)}
                                className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-micro font-semibold cursor-pointer"
                              >
                                {t("+ Renewal Task", "+ Úloha na obnovenie", "+ Megújítási feladat")}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="type-panel-title text-slate-900">
                      {t("Private Worker Documents", "Súkromné dokumenty", "Privát dokumentumok")}
                    </h3>
                    {rights.edit && (
                      <div className="flex items-center gap-2">
                        <select
                          value={uploadCategory}
                          onChange={(e) => setUploadCategory(e.target.value as AgencyFileCategory)}
                          className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-caption"
                        >
                          <option value="cv">CV</option>
                          <option value="passport">{t("Passport", "Pas", "Útlevél")}</option>
                          <option value="permit">{t("Permit", "Povolenie", "Engedély")}</option>
                          <option value="medical">{t("Medical", "Lekárska prehliadka", "Orvosi")}</option>
                          <option value="contract">{t("Contract", "Zmluva", "Szerződés")}</option>
                          <option value="other">{t("Other", "Iné", "Egyéb")}</option>
                        </select>
                        <label className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-caption font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                          <Upload className="size-3.5" />
                          {t("Upload", "Nahrať", "Feltöltés")}
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              handleFileUpload(f, uploadCategory, null);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                  {files.length === 0 ? (
                    <div className="text-ui text-slate-400 py-8 text-center">
                      {t("No private documents uploaded yet.", "Zatiaľ neboli nahraté žiadne dokumenty.", "Még nincsenek feltöltött dokumentumok.")}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {files.map((f) => (
                        <div
                          key={f.id}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-slate-200"
                        >
                          <button
                            type="button"
                            onClick={() => setPreviewFile(f)}
                            className="min-w-0 text-left hover:text-teal-700 cursor-pointer flex-1"
                          >
                            <div className="text-ui font-semibold text-slate-800 hover:text-teal-700 underline decoration-slate-300 underline-offset-2 truncate">
                              {f.fileName}
                            </div>
                            <div className="text-micro text-slate-400 uppercase">
                              {f.category} · {Math.round(f.sizeBytes / 1024)} KB
                            </div>
                          </button>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setPreviewFile(f)}
                              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
                              title={t("Preview", "Náhľad", "Előnézet")}
                            >
                              <Eye className="size-4" />
                            </button>
                            <a
                              href={agencyFileUrl(f.id, true)}
                              download={f.fileName}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
                              title={t("Download full resolution", "Stiahnuť v plnom rozlíšení", "Letöltés teljes felbontásban")}
                            >
                              <Download className="size-4" />
                            </a>
                            {rights.delete && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (previewFile?.id === f.id) setPreviewFile(null);
                                  await deleteAgencyFile(f.id);
                                  await loadDetail();
                                }}
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "placements" && (
              <div>
                {renderPlacementsTab ? (
                  renderPlacementsTab({ detail, refresh: loadDetail })
                ) : (
                  <div className="p-6 text-ui text-slate-500">
                    {t("Placements panel ready.", "Panel umiestnení pripravený.", "Kihelyezési panel kész.")}
                  </div>
                )}
              </div>
            )}

            {tab === "schedule" && (
              <div>
                {renderScheduleTab ? (
                  renderScheduleTab({ detail, refresh: loadDetail })
                ) : (
                  <div className="p-6 text-ui text-slate-500">
                    {t("Shift schedule tab ready.", "Rozpis zmien pripravený.", "Műszakbeosztás kész.")}
                  </div>
                )}
              </div>
            )}

            {tab === "tasks_tickets" && (
              <div>
                {renderTasksTicketsTab ? (
                  renderTasksTicketsTab({
                    detail,
                    refresh: loadDetail,
                    onQuickRenewTask: onQuickRenewTask ? (item) => onQuickRenewTask(worker, item) : undefined,
                  })
                ) : (
                  <div className="p-6 text-ui text-slate-500">
                    {t("Tasks & Tickets linked to this worker will appear here.", "Úlohy a tikety priradené k tomuto pracovníkovi.", "A dolgozóhoz rendelt feladatok és jegyek itt jelennek meg.")}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {previewFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
          onClick={() => setPreviewFile(null)}
          data-testid="agency-file-preview-modal"
        >
          <div
            className="w-full max-w-4xl max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="size-5 text-teal-600 shrink-0" />
                <div className="min-w-0">
                  <div className="text-body font-bold text-slate-900 truncate">{previewFile.fileName}</div>
                  <div className="text-micro text-slate-500 uppercase">
                    {previewFile.category} · {Math.max(1, Math.round(previewFile.sizeBytes / 1024))} KB
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={agencyFileUrl(previewFile.id, true)}
                  download={previewFile.fileName}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="agency-file-preview-download"
                  className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-ui font-semibold inline-flex items-center gap-1.5"
                >
                  <Download className="size-4" />
                  {t(
                    "Download Full Resolution",
                    "Stiahnuť v plnom rozlíšení",
                    "Letöltés teljes felbontásban"
                  )}
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 cursor-pointer"
                  aria-label="Close"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-900/5 p-4 flex items-center justify-center min-h-80">
              {previewFile.mimeType.startsWith("image/") ||
              /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(previewFile.fileName) ? (
                <img
                  src={agencyFileUrl(previewFile.id, false)}
                  alt={previewFile.fileName}
                  className="max-w-full max-h-[74vh] object-contain rounded-xl shadow-md bg-white"
                />
              ) : previewFile.mimeType === "application/pdf" || /\.pdf$/i.test(previewFile.fileName) ? (
                <iframe
                  src={agencyFileUrl(previewFile.id, false)}
                  title={previewFile.fileName}
                  className="w-full h-[74vh] rounded-xl border border-slate-200 bg-white"
                />
              ) : (
                <div className="p-8 text-center space-y-3 bg-white rounded-2xl border border-slate-200 max-w-md">
                  <FileText className="size-10 text-teal-600 mx-auto" />
                  <div className="text-body font-bold text-slate-900">{previewFile.fileName}</div>
                  <p className="text-ui text-slate-500">
                    {t(
                      "Direct inline preview is not available for this file format. Use the button above to download it in full resolution.",
                      "Priamy náhľad pre tento formát nie je dostupný. Použite tlačidlo vyššie na stiahnutie v plnom rozlíšení.",
                      "Ehhez a fájlformátumhoz nem érhető el közvetlen előnézet. A fenti gombbal letöltheti teljes felbontásban."
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
