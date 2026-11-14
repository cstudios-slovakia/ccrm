import React, { useEffect, useState } from "react";
import { Plus, RotateCcw, Trash2, Lock, Unlock } from "lucide-react";
import type { FinancialCategory } from "../../types";
import type { Language } from "../../utils/translations";
import {
  DEFAULT_AGENCY_PROFILE_SCHEMA,
  DEFAULT_AGENCY_SETTINGS,
  resolveLocalizedLabel,
  type AgencyChecklistTemplateItem,
  type AgencyProfileSchemaField,
  type AgencySchemaFieldType,
  type AgencySettings,
  type AgencyShiftTemplate,
  type AgencyStage,
  type AgencyStageGroup,
} from "../../types/agency";
import { fetchAgencyBootstrap, saveAgencySettings } from "../../utils/agencyApi";
import { SectionCard, SaveStatus } from "../settings/SectionCard";
import type { AutosaveStatus } from "../settings/useAutosave";

interface AgencySettingsSectionProps {
  section: "workflow" | "schema" | "shifts";
  lang: Language;
  canEdit: boolean;
  financialCategories?: FinancialCategory[];
}

const STAGE_GROUPS: Array<{ value: AgencyStageGroup; en: string; sk: string; hu: string }> = [
  { value: "new", en: "New", sk: "Nový", hu: "Új" },
  { value: "in_progress", en: "In progress", sk: "V procese", hu: "Folyamatban" },
  { value: "ready", en: "Ready", sk: "Pripravený", hu: "Kész" },
  { value: "placed", en: "Placed / Rented", sk: "Prenajatý", hu: "Kihelyezve" },
  { value: "closed", en: "Closed", sk: "Uzavretý", hu: "Lezárva" },
];

const FIELD_TYPES: AgencySchemaFieldType[] = ["text", "date", "select", "textarea", "number", "checkbox"];

export const AgencySettingsSection: React.FC<AgencySettingsSectionProps> = ({
  section,
  lang,
  canEdit,
  financialCategories = [],
}) => {
  const t = (en: string, sk: string, hu: string) =>
    lang === "sk" ? sk : lang === "hu" ? hu : en;

  const [settings, setSettings] = useState<AgencySettings>(DEFAULT_AGENCY_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<AutosaveStatus>("idle");
  const [newFieldDraft, setNewFieldDraft] = useState<Record<string, { label: string; type: AgencySchemaFieldType; required: boolean; options: string }>>({});
  const [newSectionDraft, setNewSectionDraft] = useState<{ label: string; sensitive: boolean }>({ label: "", sensitive: false });

  useEffect(() => {
    let active = true;
    fetchAgencyBootstrap()
      .then((res) => {
        if (active && res.settings) {
          setSettings(res.settings);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const persist = async (next: AgencySettings) => {
    setSettings(next);
    if (!canEdit) return;
    setSaveState("saving");
    try {
      const saved = await saveAgencySettings(next);
      setSettings(saved);
      setSaveState("saved");
    } catch {
      setSaveState("idle");
    }
  };

  const expenseCategories = financialCategories.filter((c) => c.type === "expense");

  if (!loaded) {
    return (
      <SectionCard
        title={t("Agency & Leasing", "Personálna agentúra", "Munkaerő-közvetítés")}
        description={t("Loading settings…", "Načítavanie nastavení…", "Beállítások betöltése…")}
      >
        <div className="text-ui text-slate-400 py-6 text-center">
          {t("Loading…", "Načítavam…", "Betöltés…")}
        </div>
      </SectionCard>
    );
  }

  if (section === "workflow") {
    const updateStage = (idx: number, patch: Partial<AgencyStage>) => {
      const nextStages = settings.stages.map((st, i) => (i === idx ? { ...st, ...patch } : st));
      setSettings((prev) => ({ ...prev, stages: nextStages }));
    };

    const addStage = () => {
      const nextStages: AgencyStage[] = [
        ...settings.stages,
        {
          id: `stage_${Date.now()}`,
          label: { en: "New stage", sk: "Nová fáza", hu: "Új fázis" },
          color: "#6366f1",
          group: "in_progress",
        },
      ];
      persist({ ...settings, stages: nextStages });
    };

    const removeStage = (idx: number) => {
      if (settings.stages.length <= 1) return;
      persist({ ...settings, stages: settings.stages.filter((_, i) => i !== idx) });
    };

    const updateChecklist = (idx: number, patch: Partial<AgencyChecklistTemplateItem>) => {
      const nextItems = settings.checklistItems.map((it, i) => (i === idx ? { ...it, ...patch } : it));
      setSettings((prev) => ({ ...prev, checklistItems: nextItems }));
    };

    const addChecklistItem = () => {
      const nextItems: AgencyChecklistTemplateItem[] = [
        ...settings.checklistItems,
        {
          key: `item_${Date.now()}`,
          label: { en: "New check", sk: "Nová kontrola", hu: "Új ellenőrzés" },
          hasExpiry: false,
          required: false,
        },
      ];
      persist({ ...settings, checklistItems: nextItems });
    };

    const removeChecklistItem = (idx: number) => {
      persist({ ...settings, checklistItems: settings.checklistItems.filter((_, i) => i !== idx) });
    };

    return (
      <>
        <SectionCard
          title={t("Recruitment Stages", "Náborové fázy kandidátov", "Jelölti fázisok")}
          description={t(
            "Customize the Kanban & pipeline stages candidates move through before placement.",
            "Prispôsobte fázy náboru kandidátov pred ich pridelením do firmy.",
            "A jelöltek kihelyezés előtti fázisainak testreszabása."
          )}
          action={
            <div className="flex items-center gap-2">
              <SaveStatus status={saveState} lang={lang} />
              {canEdit && (
                <button
                  type="button"
                  onClick={() => persist(settings)}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-caption font-semibold cursor-pointer"
                >
                  {t("Save", "Uložiť", "Mentés")}
                </button>
              )}
            </div>
          }
        >
          <div className="space-y-2">
            {settings.stages.map((st, idx) => (
              <div
                key={st.id}
                className="grid grid-cols-1 ws-sm:grid-cols-[auto_1fr_180px_auto] gap-2 items-center p-2.5 rounded-xl bg-slate-50 border border-slate-200"
              >
                <input
                  type="color"
                  disabled={!canEdit}
                  value={st.color || "#64748b"}
                  onChange={(e) => updateStage(idx, { color: e.target.value })}
                  className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer bg-white"
                  aria-label={t("Stage color", "Farba fázy", "Fázis színe")}
                />
                <input
                  type="text"
                  disabled={!canEdit}
                  value={resolveLocalizedLabel(st.label, lang)}
                  onChange={(e) =>
                    updateStage(idx, {
                      label:
                        typeof st.label === "object"
                          ? { ...st.label, [lang]: e.target.value }
                          : e.target.value,
                    })
                  }
                  onBlur={() => persist(settings)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-ui text-slate-800"
                />
                <select
                  disabled={!canEdit}
                  value={st.group}
                  onChange={(e) => {
                    const group = e.target.value as AgencyStageGroup;
                    const next = settings.stages.map((item, i) => (i === idx ? { ...item, group } : item));
                    persist({ ...settings, stages: next });
                  }}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-ui text-slate-700"
                >
                  {STAGE_GROUPS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {t(g.en, g.sk, g.hu)}
                    </option>
                  ))}
                </select>
                {canEdit && (
                  <button
                    type="button"
                    disabled={settings.stages.length <= 1}
                    onClick={() => removeStage(idx)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 cursor-pointer"
                    aria-label={t("Remove stage", "Odstrániť fázu", "Fázis törlése")}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={addStage}
              className="mt-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-ui font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="size-3.5" />
              {t("Add Stage", "Pridať fázu", "Fázis hozzáadása")}
            </button>
          )}
        </SectionCard>

        <SectionCard
          title={t("Compliance Checklist Templates", "Šablóna povinnej agendy a dokladov", "Megfelelőségi lista sablon")}
          description={t(
            "Default documents & expiry checks automatically created for every new candidate.",
            "Predvolené doklady a kontroly platnosti vytvárané pre každého kandidáta.",
            "Alapértelmezett dokumentumok és lejárati ellenőrzések minden új jelölthöz."
          )}
        >
          <div className="space-y-2">
            {settings.checklistItems.map((it, idx) => (
              <div
                key={it.key}
                className="grid grid-cols-1 ws-sm:grid-cols-[1fr_auto_auto_auto] gap-2.5 items-center p-2.5 rounded-xl bg-slate-50 border border-slate-200"
              >
                <input
                  type="text"
                  disabled={!canEdit}
                  value={resolveLocalizedLabel(it.label, lang)}
                  onChange={(e) =>
                    updateChecklist(idx, {
                      label:
                        typeof it.label === "object"
                          ? { ...it.label, [lang]: e.target.value }
                          : e.target.value,
                    })
                  }
                  onBlur={() => persist(settings)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-ui text-slate-800"
                />
                <label className="inline-flex items-center gap-1.5 text-caption text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={Boolean(it.hasExpiry)}
                    onChange={(e) => {
                      const next = settings.checklistItems.map((item, i) =>
                        i === idx ? { ...item, hasExpiry: e.target.checked } : item
                      );
                      persist({ ...settings, checklistItems: next });
                    }}
                  />
                  {t("Has expiry", "S expiráciou", "Van lejárata")}
                </label>
                <label className="inline-flex items-center gap-1.5 text-caption text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={Boolean(it.required)}
                    onChange={(e) => {
                      const next = settings.checklistItems.map((item, i) =>
                        i === idx ? { ...item, required: e.target.checked } : item
                      );
                      persist({ ...settings, checklistItems: next });
                    }}
                  />
                  {t("Required", "Povinné", "Kötelező")}
                </label>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeChecklistItem(idx)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                    aria-label={t("Remove item", "Odstrániť položku", "Elem törlése")}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={addChecklistItem}
              className="mt-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-ui font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="size-3.5" />
              {t("Add Checklist Item", "Pridať položku", "Elem hozzáadása")}
            </button>
          )}
        </SectionCard>
      </>
    );
  }

  if (section === "schema") {
    const schema = settings.profileSchema?.length ? settings.profileSchema : DEFAULT_AGENCY_PROFILE_SCHEMA;

    const toggleSectionFlag = (secId: string, flag: "enabled" | "sensitive", val: boolean) => {
      const nextSchema = schema.map((sec) => (sec.id === secId ? { ...sec, [flag]: val } : sec));
      persist({ ...settings, profileSchema: nextSchema });
    };

    const toggleFieldRequired = (secId: string, fieldKey: string, isCustom: boolean, val: boolean) => {
      const nextSchema = schema.map((sec) => {
        if (sec.id !== secId) return sec;
        if (isCustom) {
          return {
            ...sec,
            customFields: sec.customFields.map((f) => (f.key === fieldKey ? { ...f, required: val } : f)),
          };
        }
        return {
          ...sec,
          fields: sec.fields.map((f) => (f.key === fieldKey ? { ...f, required: val } : f)),
        };
      });
      persist({ ...settings, profileSchema: nextSchema });
    };

    const addCustomField = (secId: string) => {
      const draft = newFieldDraft[secId];
      if (!draft || !draft.label.trim()) return;
      const newField: AgencyProfileSchemaField = {
        key: `custom_${Date.now()}`,
        label: { en: draft.label.trim(), sk: draft.label.trim(), hu: draft.label.trim() },
        type: draft.type,
        required: draft.required,
        system: false,
        ...(draft.type === "select" && draft.options.trim()
          ? { options: draft.options.split(",").map((s) => s.trim()).filter(Boolean) }
          : {}),
      };
      const nextSchema = schema.map((sec) =>
        sec.id === secId ? { ...sec, customFields: [...(sec.customFields || []), newField] } : sec
      );
      setNewFieldDraft((prev) => ({
        ...prev,
        [secId]: { label: "", type: "text", required: false, options: "" },
      }));
      persist({ ...settings, profileSchema: nextSchema });
    };

    const removeCustomField = (secId: string, fieldKey: string) => {
      const nextSchema = schema.map((sec) =>
        sec.id === secId
          ? { ...sec, customFields: (sec.customFields || []).filter((f) => f.key !== fieldKey) }
          : sec
      );
      persist({ ...settings, profileSchema: nextSchema });
    };

    const BUILTIN_SECTION_IDS = new Set(["applicant", "passport", "permit", "stayWork", "addresses", "family"]);

    const addCustomSection = () => {
      const title = newSectionDraft.label.trim();
      if (!title) return;
      const newSec = {
        id: `section_${Date.now()}`,
        label: { en: title, sk: title, hu: title },
        enabled: true,
        sensitive: newSectionDraft.sensitive,
        system: false,
        fields: [],
        customFields: [],
      };
      setNewSectionDraft({ label: "", sensitive: false });
      persist({ ...settings, profileSchema: [...schema, newSec] });
    };

    const renameCustomSection = (secId: string, nextTitle: string) => {
      const nextSchema = schema.map((sec) =>
        sec.id === secId
          ? { ...sec, label: { en: nextTitle, sk: nextTitle, hu: nextTitle } }
          : sec
      );
      setSettings((prev) => ({ ...prev, profileSchema: nextSchema }));
    };

    const removeCustomSection = (secId: string) => {
      if (BUILTIN_SECTION_IDS.has(secId)) return;
      persist({ ...settings, profileSchema: schema.filter((sec) => sec.id !== secId) });
    };

    const resetSchemaToDefault = () => {
      persist({ ...settings, profileSchema: DEFAULT_AGENCY_PROFILE_SCHEMA });
    };

    return (
      <SectionCard
        title={t("Candidate & Worker Data Schema", "Schéma údajov kandidáta a zamestnanca", "Jelölt és dolgozó adatsablon")}
        description={t(
          "Customize visible sections, required fields, and extra agency fields.",
          "Upravte sekcie, povinné polia alebo pridajte vlastné.",
          "Testreszabhatja a szekciókat és mezőket."
        )}
        action={
          <div className="flex items-center gap-2">
            <SaveStatus status={saveState} lang={lang} />
            {canEdit && (
              <button
                type="button"
                onClick={resetSchemaToDefault}
                className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-caption font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="size-3.5" />
                {t("Reset Default Schema", "Obnoviť predvolenú schému", "Alapértelmezett visszaállítása")}
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          {schema.map((sec) => {
            const draft = newFieldDraft[sec.id] || { label: "", type: "text" as AgencySchemaFieldType, required: false, options: "" };
            const isCustomSec = !BUILTIN_SECTION_IDS.has(sec.id) && sec.system === false;
            return (
              <div
                key={sec.id}
                data-testid={`agency-schema-section-${sec.id}`}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {isCustomSec && canEdit ? (
                      <input
                        type="text"
                        value={resolveLocalizedLabel(sec.label, lang)}
                        onChange={(e) => renameCustomSection(sec.id, e.target.value)}
                        onBlur={() => persist(settings)}
                        className="text-body font-bold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200 focus:border-teal-500 focus:outline-none"
                      />
                    ) : (
                      <div className="text-body font-bold text-slate-900">
                        {resolveLocalizedLabel(sec.label, lang)}
                      </div>
                    )}
                    <div className="text-micro text-slate-500">
                      {sec.fields.length + (sec.customFields?.length || 0)}{" "}
                      {t("fields", "polí", "mező")}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 text-caption font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={sec.sensitive}
                        onChange={(e) => toggleSectionFlag(sec.id, "sensitive", e.target.checked)}
                      />
                      {sec.sensitive ? <Lock className="size-3.5 text-amber-600" /> : <Unlock className="size-3.5 text-slate-400" />}
                      {t("Personal / Restricted", "Citlivé údaje", "Személyes / Korlátozott")}
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-caption font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={sec.enabled}
                        onChange={(e) => toggleSectionFlag(sec.id, "enabled", e.target.checked)}
                      />
                      {t("Enabled", "Aktívna", "Aktív")}
                    </label>
                    {!BUILTIN_SECTION_IDS.has(sec.id) && canEdit && (
                      <button
                        type="button"
                        data-testid={`agency-remove-section-${sec.id}`}
                        onClick={() => removeCustomSection(sec.id)}
                        title={t("Delete Block", "Odstrániť blok", "Blokk törlése")}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </div>

                {sec.enabled && (
                  <div className="grid grid-cols-1 ws-md:grid-cols-2 gap-2">
                    {sec.fields.map((field) => (
                      <div
                        key={field.key}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200"
                      >
                        <div className="min-w-0">
                          <div className="text-ui font-medium text-slate-800 truncate">
                            {resolveLocalizedLabel(field.label, lang)}
                          </div>
                          <div className="text-micro text-slate-400 font-mono">
                            {field.key} · {field.type}
                          </div>
                        </div>
                        <label className="inline-flex items-center gap-1 text-micro text-slate-600 shrink-0 cursor-pointer">
                          <input
                            type="checkbox"
                            disabled={!canEdit}
                            checked={Boolean(field.required)}
                            onChange={(e) => toggleFieldRequired(sec.id, field.key, false, e.target.checked)}
                          />
                          {t("Required", "Povinné", "Kötelező")}
                        </label>
                      </div>
                    ))}
                    {(sec.customFields || []).map((field) => (
                      <div
                        key={field.key}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-indigo-50/60 border border-indigo-200"
                      >
                        <div className="min-w-0">
                          <div className="text-ui font-medium text-indigo-900 truncate">
                            {resolveLocalizedLabel(field.label, lang)}
                          </div>
                          <div className="text-micro text-indigo-500 font-mono">
                            custom · {field.type}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <label className="inline-flex items-center gap-1 text-micro text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              disabled={!canEdit}
                              checked={Boolean(field.required)}
                              onChange={(e) => toggleFieldRequired(sec.id, field.key, true, e.target.checked)}
                            />
                            {t("Req.", "Pov.", "Köt.")}
                          </label>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => removeCustomField(sec.id, field.key)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {sec.enabled && canEdit && (
                  <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={draft.label}
                      data-testid={`agency-new-field-label-${sec.id}`}
                      onChange={(e) =>
                        setNewFieldDraft((prev) => ({
                          ...prev,
                          [sec.id]: { ...draft, label: e.target.value },
                        }))
                      }
                      placeholder={t("New custom field label", "Názov vlastného poľa", "Új egyedi mező neve")}
                      className="flex-1 min-w-40 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-ui"
                    />
                    <select
                      value={draft.type}
                      onChange={(e) =>
                        setNewFieldDraft((prev) => ({
                          ...prev,
                          [sec.id]: { ...draft, type: e.target.value as AgencySchemaFieldType },
                        }))
                      }
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-ui"
                    >
                      {FIELD_TYPES.map((ft) => (
                        <option key={ft} value={ft}>
                          {ft}
                        </option>
                      ))}
                    </select>
                    {draft.type === "select" && (
                      <input
                        type="text"
                        value={draft.options}
                        onChange={(e) =>
                          setNewFieldDraft((prev) => ({
                            ...prev,
                            [sec.id]: { ...draft, options: e.target.value },
                          }))
                        }
                        placeholder="A, B, C"
                        className="w-36 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-ui"
                      />
                    )}
                    <button
                      type="button"
                      data-testid={`agency-add-field-${sec.id}`}
                      onClick={() => addCustomField(sec.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-caption font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="size-3.5" />
                      {t("Add Field", "Pridať pole", "Mező hozzáadása")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {canEdit && (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 flex-1 min-w-56">
                <input
                  type="text"
                  value={newSectionDraft.label}
                  data-testid="agency-new-section-label"
                  onChange={(e) => setNewSectionDraft((prev) => ({ ...prev, label: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomSection();
                    }
                  }}
                  placeholder={t(
                    "New custom block name (e.g. Education, Bank Account, Uniform & Sizes…)",
                    "Názov nového bloku údajov (napr. Vzdelanie, Bankový účet, Konfekčné veľkosti…)",
                    "Új adatblokk neve (pl. Végzettség, Bankszámla, Munkaruha méretek…)"
                  )}
                  className="flex-1 min-w-48 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-ui text-slate-800 focus:bg-white focus:border-teal-500 focus:outline-none"
                />
                <label className="inline-flex items-center gap-1.5 text-caption font-medium text-slate-700 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={newSectionDraft.sensitive}
                    onChange={(e) => setNewSectionDraft((prev) => ({ ...prev, sensitive: e.target.checked }))}
                  />
                  <Lock className="size-3.5 text-amber-600" />
                  {t("Personal / Restricted", "Citlivé údaje", "Személyes / Korlátozott")}
                </label>
              </div>
              <button
                type="button"
                data-testid="agency-add-section-btn"
                onClick={addCustomSection}
                className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-ui font-semibold inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Plus className="size-4" />
                {t("Add Block", "Pridať blok", "Blokk hozzáadása")}
              </button>
            </div>
          )}
        </div>
      </SectionCard>
    );
  }

  // section === "shifts"
  const updateShiftTpl = (idx: number, patch: Partial<AgencyShiftTemplate>) => {
    const next = settings.shiftTemplates.map((tpl, i) => (i === idx ? { ...tpl, ...patch } : tpl));
    setSettings((prev) => ({ ...prev, shiftTemplates: next }));
  };

  const addShiftTpl = () => {
    const next: AgencyShiftTemplate[] = [
      ...settings.shiftTemplates,
      {
        id: `shift_${Date.now()}`,
        code: "S",
        name: { en: "Custom Shift", sk: "Vlastná zmena", hu: "Egyéni műszak" },
        startTime: "08:00",
        endTime: "16:00",
        defaultHours: 8,
        payMultiplier: 1.0,
        billMultiplier: 1.0,
        color: "#0ea5e9",
      },
    ];
    persist({ ...settings, shiftTemplates: next });
  };

  const removeShiftTpl = (idx: number) => {
    if (settings.shiftTemplates.length <= 1) return;
    persist({ ...settings, shiftTemplates: settings.shiftTemplates.filter((_, i) => i !== idx) });
  };

  return (
    <>
      <SectionCard
        title={t("Customizable Shift Presets", "Vlastné šablóny zmien", "Testreszabható műszaksablonok")}
        description={t(
          "Define shift codes, start/end times, hours, and pay/billing multipliers used in the schedule.",
          "Definujte kódy zmien, časy, hodiny a mzdové/fakturačné koeficienty pre rozpis.",
          "Állítsa be a műszakkódokat, munkaidőt és bér-/számlázási szorzókat."
        )}
        action={
          <div className="flex items-center gap-2">
            <SaveStatus status={saveState} lang={lang} />
            {canEdit && (
              <button
                type="button"
                onClick={() => persist(settings)}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-caption font-semibold cursor-pointer"
              >
                {t("Save", "Uložiť", "Mentés")}
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-2">
          {settings.shiftTemplates.map((tpl, idx) => (
            <div
              key={tpl.id}
              className="grid grid-cols-2 ws-md:grid-cols-[auto_68px_1fr_92px_92px_72px_78px_78px_auto] gap-2 items-center p-2.5 rounded-xl bg-slate-50 border border-slate-200"
            >
              <input
                type="color"
                disabled={!canEdit}
                value={tpl.color || "#0ea5e9"}
                onChange={(e) => updateShiftTpl(idx, { color: e.target.value })}
                className="w-8 h-8 rounded-lg border border-slate-200 bg-white cursor-pointer"
              />
              <input
                type="text"
                disabled={!canEdit}
                value={tpl.code}
                onChange={(e) => updateShiftTpl(idx, { code: e.target.value.slice(0, 6) })}
                onBlur={() => persist(settings)}
                placeholder="R"
                className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-ui font-mono font-bold text-center"
              />
              <input
                type="text"
                disabled={!canEdit}
                value={resolveLocalizedLabel(tpl.name, lang)}
                onChange={(e) =>
                  updateShiftTpl(idx, {
                    name: typeof tpl.name === "object" ? { ...tpl.name, [lang]: e.target.value } : e.target.value,
                  })
                }
                onBlur={() => persist(settings)}
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-ui"
              />
              <input
                type="time"
                disabled={!canEdit}
                value={tpl.startTime}
                onChange={(e) => updateShiftTpl(idx, { startTime: e.target.value })}
                onBlur={() => persist(settings)}
                className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-ui font-mono"
              />
              <input
                type="time"
                disabled={!canEdit}
                value={tpl.endTime}
                onChange={(e) => updateShiftTpl(idx, { endTime: e.target.value })}
                onBlur={() => persist(settings)}
                className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-ui font-mono"
              />
              <input
                type="number"
                step="0.5"
                disabled={!canEdit}
                value={tpl.defaultHours}
                onChange={(e) => updateShiftTpl(idx, { defaultHours: Number(e.target.value) || 0 })}
                onBlur={() => persist(settings)}
                title={t("Hours", "Hodiny", "Óra")}
                className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-ui font-mono text-right"
              />
              <input
                type="number"
                step="0.05"
                disabled={!canEdit}
                value={tpl.payMultiplier}
                onChange={(e) => updateShiftTpl(idx, { payMultiplier: Number(e.target.value) || 1 })}
                onBlur={() => persist(settings)}
                title={t("Pay x", "Mzda x", "Bér x")}
                className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-ui font-mono text-right"
              />
              <input
                type="number"
                step="0.05"
                disabled={!canEdit}
                value={tpl.billMultiplier}
                onChange={(e) => updateShiftTpl(idx, { billMultiplier: Number(e.target.value) || 1 })}
                onBlur={() => persist(settings)}
                title={t("Bill x", "Fakturácia x", "Számlázás x")}
                className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-ui font-mono text-right"
              />
              {canEdit && (
                <button
                  type="button"
                  disabled={settings.shiftTemplates.length <= 1}
                  onClick={() => removeShiftTpl(idx)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 cursor-pointer"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={addShiftTpl}
            className="mt-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-ui font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="size-3.5" />
            {t("Add Shift Preset", "Pridať šablónu zmeny", "Műszaksablon hozzáadása")}
          </button>
        )}
      </SectionCard>

      <SectionCard
        title={t("Holidays, Multipliers & Payroll Sync", "Sviatky, príplatky a párovanie výplat", "Ünnepnapok, pótlékok és bér")}
        description={t(
          "Select the public holiday calendar shown on schedules and configure overtime/holiday rates & finance expense sync.",
          "Zvoľte kalendár štátnych sviatkov v rozpise a nastavte príplatky či automatický náklad vo financiách.",
          "Állítsa be az ünnepnap-naptárat, a túlóra-/ünnepi szorzókat és a pénzügyi szinkronizálást."
        )}
      >
        <div className="grid grid-cols-1 ws-sm:grid-cols-2 ws-md:grid-cols-3 gap-3">
          <div>
            <label className="type-overline text-slate-500 block mb-1">
              {t("Holiday Calendar Country", "Kalendár štátnych sviatkov", "Ünnepnap-naptár országa")}
            </label>
            <select
              disabled={!canEdit}
              value={settings.holidayCountry}
              onChange={(e) =>
                persist({ ...settings, holidayCountry: e.target.value === "HU" ? "HU" : "SK" })
              }
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-ui font-medium"
            >
              <option value="SK">Slovakia (SK)</option>
              <option value="HU">Hungary (HU)</option>
            </select>
          </div>
          <div>
            <label className="type-overline text-slate-500 block mb-1">
              {t("Overtime Multiplier", "Koeficient nadčasu", "Túlóra szorzó")}
            </label>
            <input
              type="number"
              step="0.05"
              disabled={!canEdit}
              value={settings.overtimeMultiplier}
              onChange={(e) => setSettings((p) => ({ ...p, overtimeMultiplier: Number(e.target.value) || 1.25 }))}
              onBlur={() => persist(settings)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-ui font-mono"
            />
          </div>
          <div>
            <label className="type-overline text-slate-500 block mb-1">
              {t("Holiday Multiplier", "Koeficient sviatku", "Ünnepnap szorzó")}
            </label>
            <input
              type="number"
              step="0.05"
              disabled={!canEdit}
              value={settings.holidayMultiplier}
              onChange={(e) => setSettings((p) => ({ ...p, holidayMultiplier: Number(e.target.value) || 1.5 }))}
              onBlur={() => persist(settings)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-ui font-mono"
            />
          </div>
          <div>
            <label className="type-overline text-slate-500 block mb-1">
              {t("Default Currency", "Predvolená mena", "Alapértelmezett pénznem")}
            </label>
            <select
              disabled={!canEdit}
              value={settings.defaultCurrency}
              onChange={(e) => persist({ ...settings, defaultCurrency: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-ui font-mono"
            >
              <option value="EUR">EUR</option>
              <option value="CZK">CZK</option>
              <option value="HUF">HUF</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <label className="type-overline text-slate-500 block mb-1">
              {t("Default Expense Category", "Kategória nákladu", "Kiadási kategória")}
            </label>
            <select
              disabled={!canEdit}
              value={settings.defaultExpenseCategoryId}
              onChange={(e) => persist({ ...settings, defaultExpenseCategoryId: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-ui"
            >
              <option value="fc-exp-payroll">
                {t("Payroll (Default)", "Mzdy (predvolené)", "Bérköltség (alapértelmezett)")}
              </option>
              {expenseCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end pb-1.5">
            <label className="inline-flex items-center gap-2 text-ui font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={settings.autoCreateExpense}
                onChange={(e) => persist({ ...settings, autoCreateExpense: e.target.checked })}
              />
              {t("Auto-sync Financial Expense", "Automatický náklad vo Financiách", "Pénzügyi kiadás szinkron")}
            </label>
          </div>
        </div>
      </SectionCard>
    </>
  );
};
