import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Calendar,
  ClipboardList,
  Clock,
  Download,
  FileText,
  HeartPulse,
  Lock,
  MessageSquare,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  Upload,
  UserCheck,
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

export const AgencyWorkerDetailView: React.FC<AgencyWorkerDetailViewProps> = ({
  workerId,
  lang,
  rights,
  settings,
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
    notes: "",
    defaultPayRate: "",
    defaultBillRate: "",
  });

  // Upload form state
  const [uploadCategory, setUploadCategory] = useState<AgencyFileCategory>("other");

  const loadDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAgencyWorkerDetail(workerId);
      setDetail(data);
      setProfileDraft((data.worker.profile || {}) as AgencyProfileData);
      setBasicDraft({
        fullName: data.worker.fullName || "",
        preferredName: data.worker.preferredName || "",
        email: data.worker.email || "",
        phone: data.worker.phone || "",
        nationality: data.worker.nationality || "",
        notes: data.worker.notes || "",
        defaultPayRate: data.worker.defaultPayRate !== null ? String(data.worker.defaultPayRate) : "",
        defaultBillRate: data.worker.defaultBillRate !== null ? String(data.worker.defaultBillRate) : "",
      });
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

  const tabs: Array<{ id: AgencyDetailTab; label: string }> = [
    { id: "overview", label: t("Overview & Timeline", "Prehľad a história", "Áttekintés és idővonal") },
    { id: "profile", label: t("Structured Profile", "Údaje (REYES schéma)", "Adatlap") },
    { id: "compliance", label: t("Checklist & Private Files", "Doklady a súbory", "Dokumentumok") },
    { id: "placements", label: t("Placements", "Umiestnenia", "Kihelyezések") },
    { id: "schedule", label: t("Schedule", "Rozpis zmien", "Műszakok") },
    { id: "tasks_tickets", label: t("Tasks & Tickets", "Úlohy a tikety", "Feladatok és jegyek") },
  ];

  const visibleTimeline = showWorkLogs
    ? timeline
    : timeline.filter((ev) => ev.eventType !== "work_log");

  return (
    <div className="space-y-4" data-testid="agency-worker-detail">
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-caption font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
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
            <div className="text-caption text-slate-500 flex flex-wrap items-center gap-3 mt-0.5">
              <span>{worker.nationality || t("Nationality unset", "Bez príslušnosti", "Állampolgárság nélkül")}</span>
              {worker.phone && <span>· {worker.phone}</span>}
              {worker.email && <span>· {worker.email}</span>}
              {activePlacement && (
                <span className="text-emerald-700 font-semibold">
                  · {activePlacement.jobRole || t("Placed", "Umiestnený", "Kihelyezve")}
                </span>
              )}
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

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            data-testid={`agency-detail-tab-${item.id}`}
            className={`px-3.5 py-2 rounded-xl text-ui font-semibold transition-colors cursor-pointer ${
              tab === item.id
                ? "bg-slate-900 text-white shadow-2xs"
                : "bg-white/80 text-slate-600 hover:text-slate-900 border border-slate-200/80"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 ws-lg:grid-cols-[1fr_340px] gap-4 items-start">
          <div className="glass-panel rounded-2xl p-4 space-y-4">
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
                    // Compact single-line work log card — intentionally much smaller than major milestones.
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

          <div className="space-y-4">
            {rights.edit && (
              <form onSubmit={handleLogEvent} className="glass-panel rounded-2xl p-4 space-y-3" data-testid="agency-log-event-form">
                <h3 className="type-panel-title text-slate-900">
                  {t("Log Event", "Pridať udalosť", "Esemény rögzítése")}
                </h3>
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
                <div>
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
                  <textarea
                    rows={2}
                    value={tlForm.description}
                    onChange={(e) => setTlForm((p) => ({ ...p, description: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-ui"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-ui font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="size-4" />
                  {t("Record Event", "Uložiť udalosť", "Mentés")}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {tab === "profile" && (
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="glass-panel rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="type-panel-title text-slate-900">
                {t("Core Identity & Rates", "Základné údaje a sadzby", "Alapadatok és díjak")}
              </h3>
              {rights.edit && (
                <button
                  type="submit"
                  disabled={saving}
                  data-testid="agency-save-profile-btn"
                  className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-ui font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="size-4" />
                  {saving ? t("Saving…", "Ukladám…", "Mentés…") : t("Save Profile", "Uložiť profil", "Profil mentése")}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 ws-sm:grid-cols-2 ws-md:grid-cols-3 gap-3">
              <div>
                <label className="type-overline text-slate-500 block mb-1">
                  {t("Full Name", "Celé meno", "Teljes név")} *
                </label>
                <input
                  type="text"
                  required
                  disabled={!rights.edit}
                  value={basicDraft.fullName}
                  onChange={(e) => setBasicDraft((p) => ({ ...p, fullName: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-ui"
                />
              </div>
              <div>
                <label className="type-overline text-slate-500 block mb-1">
                  {t("Nationality", "Štátna príslušnosť", "Állampolgárság")}
                </label>
                <input
                  type="text"
                  disabled={!rights.edit}
                  value={basicDraft.nationality}
                  onChange={(e) => setBasicDraft((p) => ({ ...p, nationality: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-ui"
                />
              </div>
              <div>
                <label className="type-overline text-slate-500 block mb-1">
                  {t("Phone", "Telefón", "Telefon")}
                </label>
                <input
                  type="text"
                  disabled={!rights.edit}
                  value={basicDraft.phone}
                  onChange={(e) => setBasicDraft((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-ui"
                />
              </div>
              <div>
                <label className="type-overline text-slate-500 block mb-1">
                  {t("Email", "E-mail", "E-mail")}
                </label>
                <input
                  type="email"
                  disabled={!rights.edit}
                  value={basicDraft.email}
                  onChange={(e) => setBasicDraft((p) => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-ui"
                />
              </div>
              {rights.payments && (
                <>
                  <div>
                    <label className="type-overline text-slate-500 block mb-1">
                      {t("Default Pay Rate", "Predvolená mzda", "Alap órabér")} ({worker.currency})
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      disabled={!rights.edit}
                      value={basicDraft.defaultPayRate}
                      onChange={(e) => setBasicDraft((p) => ({ ...p, defaultPayRate: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-ui font-mono"
                    />
                  </div>
                  <div>
                    <label className="type-overline text-slate-500 block mb-1">
                      {t("Default Bill Rate", "Fakturačná sadzba", "Számlázási díj")} ({worker.currency})
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      disabled={!rights.edit}
                      value={basicDraft.defaultBillRate}
                      onChange={(e) => setBasicDraft((p) => ({ ...p, defaultBillRate: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-ui font-mono"
                    />
                  </div>
                </>
              )}
            </div>
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
              <div key={sec.id} className="glass-panel rounded-2xl p-4 space-y-3">
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
        <div className="grid grid-cols-1 ws-lg:grid-cols-2 gap-4">
          <div className="glass-panel rounded-2xl p-4 space-y-3">
            <h3 className="type-panel-title text-slate-900 flex items-center gap-2">
              <ClipboardList className="size-4 text-teal-600" />
              {t("Compliance Checklist", "Kontrolný zoznam dokladov", "Megfelelőségi lista")}
            </h3>
            <div className="space-y-2.5">
              {checklist.map((item, idx) => {
                const expState = getComplianceExpiryState(item.expiresAt);
                return (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-white border border-slate-200 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-ui font-bold text-slate-900">{item.label}</div>
                      <select
                        disabled={!rights.edit}
                        value={item.status}
                        onChange={(e) =>
                          handleChecklistChange(idx, { status: e.target.value as AgencyChecklistStatus })
                        }
                        className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-caption font-semibold"
                      >
                        <option value="missing">{t("Missing", "Chýba", "Hiányzik")}</option>
                        <option value="submitted">{t("Submitted", "Odovzdané", "Leadva")}</option>
                        <option value="verified">{t("Verified", "Overené", "Ellenőrizve")}</option>
                        <option value="expired">{t("Expired", "Expirované", "Lejárt")}</option>
                      </select>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-micro text-slate-500 flex items-center gap-1">
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
                        className="px-2 py-1 rounded-lg border border-slate-200 text-caption"
                      />
                      {expState !== "ok" && (
                        <span
                          className={`text-micro font-bold px-2 py-0.5 rounded-full ${
                            expState === "expired"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {expState === "expired"
                            ? t("Expired", "Expirované", "Lejárt")
                            : t("Expiring soon", "Čoskoro expiruje", "Hamarosan lejár")}
                        </span>
                      )}
                      {rights.edit && (
                        <label className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-micro font-semibold text-slate-700 cursor-pointer">
                          <Upload className="size-3" />
                          {t("Attach", "Priložiť", "Csatolás")}
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              handleFileUpload(file, "other", item.id);
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

          <div className="glass-panel rounded-2xl p-4 space-y-3">
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
                    <div className="min-w-0">
                      <div className="text-ui font-semibold text-slate-800 truncate">{f.fileName}</div>
                      <div className="text-micro text-slate-400 uppercase">
                        {f.category} · {Math.round(f.sizeBytes / 1024)} KB
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={agencyFileUrl(f.id, true)}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
                        title={t("Download", "Stiahnuť", "Letöltés")}
                      >
                        <Download className="size-4" />
                      </a>
                      {rights.delete && (
                        <button
                          type="button"
                          onClick={async () => {
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
            <div className="glass-panel rounded-2xl p-6 text-ui text-slate-500">
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
            <div className="glass-panel rounded-2xl p-6 text-ui text-slate-500">
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
            <div className="glass-panel rounded-2xl p-6 text-ui text-slate-500">
              {t("Tasks & Tickets linked to this worker will appear here.", "Úlohy a tikety priradené k tomuto pracovníkovi.", "A dolgozóhoz rendelt feladatok és jegyek itt jelennek meg.")}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
