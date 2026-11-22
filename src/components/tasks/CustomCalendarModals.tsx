import React, { useMemo, useState } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import type { CustomCalendar, CustomCalendarEvent, Lead, Project, UserProfile } from "../../types";
import type { Language } from "../../utils/translations";
import { ColorPicker } from "../ui/ColorPicker";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";
import { findOverlappingCustomEvents } from "../../utils/customCalendarsApi";
import { projectDisplayName } from "../../utils/projects";

export const CustomCalendarFormModal: React.FC<{
  calendar?: CustomCalendar | null;
  lang: Language;
  defaultPinned?: boolean;
  onSave: (data: { id?: string; name: string; color: string; description: string; pinToBar: boolean }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onClose: () => void;
}> = ({ calendar, lang, defaultPinned = true, onSave, onDelete, onClose }) => {
  const t = (en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);
  const [name, setName] = useState(calendar?.name || "");
  const [color, setColor] = useState(calendar?.color || "#6366f1");
  const [description, setDescription] = useState(calendar?.description || "");
  const [pinToBar, setPinToBar] = useState(defaultPinned);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSave({
        id: calendar?.id,
        name: trimmed,
        color,
        description: description.trim(),
        pinToBar,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-body font-bold text-gray-900">
            {calendar
              ? t("Edit Custom Calendar", "Upraviť vlastný kalendár", "Egyéni naptár szerkesztése")
              : t("New Custom Calendar", "Nový vlastný kalendár", "Új egyéni naptár")}
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded-md text-gray-400 hover:text-gray-700 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-caption font-semibold text-gray-600 block mb-1">
              {t("Calendar Name", "Názov kalendára", "Naptár neve")}
            </label>
            <input
              autoFocus
              type="text"
              maxLength={150}
              required
              data-testid="custom-calendar-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("e.g. Meeting Room, Company Van, Showroom", "napr. Zasadačka, Firemné auto, Showroom", "pl. Tárgyaló, Céges autó, Bemutatóterem")}
              className="w-full h-10 px-3 bg-white border border-gray-200 rounded-md text-ui text-gray-900 focus:outline-none focus:ring-2 focus:ring-entity-ring focus:border-entity"
            />
          </div>

          <div>
            <label className="text-caption font-semibold text-gray-600 block mb-1">
              {t("Calendar Color", "Farba kalendára", "Naptár színe")}
            </label>
            <ColorPicker variant="field" value={color} onChange={setColor} />
          </div>

          <div>
            <label className="text-caption font-semibold text-gray-600 block mb-1">
              {t("Description (optional)", "Popis (voliteľné)", "Leírás (opcionális)")}
            </label>
            <input
              type="text"
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("What this calendar is used for...", "Na čo sa tento kalendár používa...", "Mire szolgál ez a naptár...")}
              className="w-full h-10 px-3 bg-white border border-gray-200 rounded-md text-ui text-gray-900 focus:outline-none focus:ring-2 focus:ring-entity-ring focus:border-entity"
            />
          </div>

          {!calendar && (
            <label className="flex items-center gap-2 text-ui text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={pinToBar}
                onChange={(e) => setPinToBar(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-[var(--entity-accent-solid)]"
              />
              <span>{t("Pin next to Tasks & other favorite calendars", "Pripnúť vedľa Úloh a obľúbených kalendárov", "Kitűzés a Feladatok és kedvenc naptárak mellé")}</span>
            </label>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-gray-200">
            <div>
              {calendar && onDelete && (
                <HoldToConfirmButton
                  tone="danger"
                  lang={lang}
                  what={calendar.name}
                  onConfirm={async () => {
                    await onDelete(calendar.id);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-caption font-semibold text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{t("Delete", "Vymazať", "Törlés")}</span>
                </HoldToConfirmButton>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-ui font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer">
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
              <button
                type="submit"
                disabled={saving || !name.trim()}
                data-testid="custom-calendar-save-btn"
                className="px-4 py-2 rounded-md text-ui font-semibold bg-entity-solid hover:bg-entity-solid-hover text-white shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {t("Save", "Uložiť", "Mentés")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export const CustomCalendarEventModal: React.FC<{
  calendar: CustomCalendar;
  event?: CustomCalendarEvent | null;
  initialDate?: string;
  existingEvents: CustomCalendarEvent[];
  users: UserProfile[];
  leads: Lead[];
  projects: Project[];
  currentUserName?: string;
  lang: Language;
  onSave: (data: {
    id?: string;
    calendarId: string;
    title: string;
    startDate: string;
    endDate: string;
    startTime: string | null;
    endTime: string | null;
    notes: string | null;
    color: string | null;
    owner: string | null;
    relatedLeadId: string | null;
    relatedProjectId: string | null;
  }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onClose: () => void;
}> = ({
  calendar,
  event,
  initialDate,
  existingEvents,
  users,
  leads,
  projects,
  currentUserName,
  lang,
  onSave,
  onDelete,
  onClose,
}) => {
  const t = (en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);
  const todayStr = initialDate || new Date().toISOString().slice(0, 10);

  const [title, setTitle] = useState(event?.title || "");
  const [startDate, setStartDate] = useState(event?.startDate || todayStr);
  const [endDate, setEndDate] = useState(event?.endDate || todayStr);
  const [allDay, setAllDay] = useState(event ? !event.startTime : false);
  const [startTime, setStartTime] = useState(event?.startTime || "09:00");
  const [endTime, setEndTime] = useState(event?.endTime || "10:00");
  const [owner, setOwner] = useState(event?.owner || currentUserName || "");
  const [relatedLeadId, setRelatedLeadId] = useState(event?.relatedLeadId || "");
  const [relatedProjectId, setRelatedProjectId] = useState(event?.relatedProjectId || "");
  const [useCustomColor, setUseCustomColor] = useState(Boolean(event?.color));
  const [color, setColor] = useState(event?.color || calendar.color);
  const [notes, setNotes] = useState(event?.notes || "");
  const [saving, setSaving] = useState(false);

  const overlaps = useMemo(
    () =>
      findOverlappingCustomEvents(existingEvents, {
        id: event?.id,
        calendarId: calendar.id,
        startDate,
        endDate: endDate >= startDate ? endDate : startDate,
        startTime: allDay ? null : startTime,
        endTime: allDay ? null : endTime,
      }),
    [existingEvents, event?.id, calendar.id, startDate, endDate, allDay, startTime, endTime]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startDate || saving) return;
    setSaving(true);
    try {
      await onSave({
        id: event?.id,
        calendarId: calendar.id,
        title: title.trim(),
        startDate,
        endDate: endDate >= startDate ? endDate : startDate,
        startTime: allDay ? null : startTime || null,
        endTime: allDay ? null : endTime || null,
        notes: notes.trim() || null,
        color: useCustomColor ? color : null,
        owner: owner.trim() || null,
        relatedLeadId: relatedLeadId || null,
        relatedProjectId: relatedProjectId || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: calendar.color }} />
            <h3 className="text-body font-bold text-gray-900 truncate">
              {event
                ? t(`Edit Event — ${calendar.name}`, `Upraviť udalosť — ${calendar.name}`, `Esemény szerkesztése — ${calendar.name}`)
                : t(`New Event — ${calendar.name}`, `Nová udalosť — ${calendar.name}`, `Új esemény — ${calendar.name}`)}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-md text-gray-400 hover:text-gray-700 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {overlaps.length > 0 && (
            <div
              data-testid="custom-calendar-overlap-warning"
              className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-caption"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <div className="font-semibold">
                  {t(
                    "Time slot overlaps an existing booking:",
                    "Čas sa prekrýva s existujúcou rezerváciou:",
                    "Az időpont ütközik egy meglévő foglalással:"
                  )}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {overlaps.slice(0, 3).map((ov) => (
                    <li key={ov.id}>
                      • {ov.title} ({ov.startTime ? `${ov.startTime}${ov.endTime ? `–${ov.endTime}` : ""}` : t("All day", "Celý deň", "Egész nap")})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div>
            <label className="text-caption font-semibold text-gray-600 block mb-1">
              {t("Event Title", "Názov udalosti", "Esemény címe")}
            </label>
            <input
              autoFocus
              type="text"
              required
              maxLength={255}
              data-testid="custom-event-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("e.g. Client kickoff meeting", "napr. Stretnutie s klientom", "pl. Ügyféltalálkozó")}
              className="w-full h-10 px-3 bg-white border border-gray-200 rounded-md text-ui text-gray-900 focus:outline-none focus:ring-2 focus:ring-entity-ring focus:border-entity"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-caption font-semibold text-gray-600 block mb-1">
                {t("Start Date", "Dátum od", "Kezdés dátuma")}
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setStartDate(v);
                  if (endDate < v) setEndDate(v);
                }}
                className="w-full h-10 px-3 bg-white border border-gray-200 rounded-md text-ui text-gray-900 focus:outline-none focus:ring-2 focus:ring-entity-ring"
              />
            </div>
            <div>
              <label className="text-caption font-semibold text-gray-600 block mb-1">
                {t("End Date", "Dátum do", "Befejezés dátuma")}
              </label>
              <input
                type="date"
                required
                min={startDate}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-gray-200 rounded-md text-ui text-gray-900 focus:outline-none focus:ring-2 focus:ring-entity-ring"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 text-ui text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-[var(--entity-accent-solid)]"
              />
              <span>{t("All-day event", "Celodenná udalosť", "Egész napos esemény")}</span>
            </label>
            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-caption font-semibold text-gray-600 block mb-1">{t("Start Time", "Čas od", "Kezdés")}</label>
                  <input
                    type="time"
                    data-testid="custom-event-start-time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full h-10 px-3 bg-white border border-gray-200 rounded-md text-ui text-gray-900 focus:outline-none focus:ring-2 focus:ring-entity-ring"
                  />
                </div>
                <div>
                  <label className="text-caption font-semibold text-gray-600 block mb-1">{t("End Time", "Čas do", "Befejezés")}</label>
                  <input
                    type="time"
                    data-testid="custom-event-end-time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full h-10 px-3 bg-white border border-gray-200 rounded-md text-ui text-gray-900 focus:outline-none focus:ring-2 focus:ring-entity-ring"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3">
            <div>
              <label className="text-caption font-semibold text-gray-600 block mb-1">{t("Booked By", "Rezervoval", "Foglalta")}</label>
              <select
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-gray-200 rounded-md text-ui text-gray-900 focus:outline-none focus:ring-2 focus:ring-entity-ring"
              >
                <option value="">{t("— None —", "— Žiadny —", "— Nincs —")}</option>
                {users.map((u) => (
                  <option key={u.email || u.name} value={u.name}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-caption font-semibold text-gray-600 block mb-1">{t("Project (optional)", "Projekt (voliteľné)", "Projekt (opcionális)")}</label>
              <select
                value={relatedProjectId}
                onChange={(e) => setRelatedProjectId(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-gray-200 rounded-md text-ui text-gray-900 focus:outline-none focus:ring-2 focus:ring-entity-ring"
              >
                <option value="">{t("— None —", "— Žiadny —", "— Nincs —")}</option>
                {projects
                  .filter((p) => !p.archived)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {projectDisplayName(p, leads)}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <label className="inline-flex items-center gap-2 text-caption font-semibold text-gray-600 mb-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={useCustomColor}
                onChange={(e) => setUseCustomColor(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 accent-[var(--entity-accent-solid)]"
              />
              <span>{t("Override calendar color for this event", "Vlastná farba pre túto udalosť", "Egyéni szín ehhez az eseményhez")}</span>
            </label>
            {useCustomColor && <ColorPicker variant="field" value={color} onChange={setColor} />}
          </div>

          <div>
            <label className="text-caption font-semibold text-gray-600 block mb-1">{t("Notes", "Poznámka", "Megjegyzés")}</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 bg-white border border-gray-200 rounded-md text-ui text-gray-900 focus:outline-none focus:ring-2 focus:ring-entity-ring"
            />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-gray-200">
            <div>
              {event && onDelete && (
                <HoldToConfirmButton
                  tone="danger"
                  lang={lang}
                  what={event.title}
                  onConfirm={async () => {
                    await onDelete(event.id);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-caption font-semibold text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{t("Delete", "Vymazať", "Törlés")}</span>
                </HoldToConfirmButton>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-ui font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer">
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
              <button
                type="submit"
                disabled={saving || !title.trim()}
                data-testid="custom-event-save-btn"
                className="px-4 py-2 rounded-md text-ui font-semibold bg-entity-solid hover:bg-entity-solid-hover text-white shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {t("Save Event", "Uložiť udalosť", "Esemény mentése")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
