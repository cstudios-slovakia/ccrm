import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  HeartPulse,
  Lock,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { Lead } from "../../types";
import type { Language } from "../../utils/translations";
import { resolveLocalizedLabel } from "../../types/agency";
import type {
  AgencyBootstrapPayload,
  AgencyPlacement,
  AgencyShift,
  AgencyShiftStatus,
  AgencyWorker,
} from "../../types/agency";
import type { AgencyRights } from "../../utils/agencyRights";
import { deleteAgencyShift, saveAgencyShifts } from "../../utils/agencyApi";
import {
  addDays,
  builtinHolidays,
  daysInMonth,
  holidayName,
  isWeekend,
  type HolidayDay,
} from "../../utils/holidays";

interface AgencyScheduleViewProps {
  bootstrap: AgencyBootstrapPayload;
  clients: Lead[];
  rights: AgencyRights;
  isAdmin: boolean;
  lang: Language;
  singleWorkerId?: string;
  onChanged: () => Promise<void>;
  onOpenWorker?: (workerId: string) => void;
}

const STATUS_BADGE: Record<AgencyShiftStatus, { short: string; cls: string }> = {
  scheduled: { short: "SC", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  worked: { short: "OK", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  sick: { short: "PN", cls: "bg-rose-100 text-rose-800 border-rose-300" },
  absent: { short: "AB", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  holiday: { short: "SV", cls: "bg-amber-100 text-amber-800 border-amber-300" },
};

function currentYm(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const dt = new Date(Date.UTC(y || 2026, (m || 1) - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthDayDates(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const count = daysInMonth(y, m);
  return Array.from({ length: count }, (_, idx) => `${ym}-${String(idx + 1).padStart(2, "0")}`);
}

export const AgencyScheduleView: React.FC<AgencyScheduleViewProps> = ({
  bootstrap,
  clients,
  rights,
  isAdmin,
  lang,
  singleWorkerId,
  onChanged,
  onOpenWorker,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    lang === "sk" ? sk : lang === "hu" ? hu : en;

  const [periodYm, setPeriodYm] = useState<string>(currentYm);
  const [companyFilter, setCompanyFilter] = useState<string>("");
  const [workplaceFilter, setWorkplaceFilter] = useState<string>("");
  const [country, setCountry] = useState<"SK" | "HU">(bootstrap.settings.holidayCountry || "SK");
  const [holidays, setHolidays] = useState<HolidayDay[]>(() =>
    builtinHolidays(bootstrap.settings.holidayCountry || "SK", Number(currentYm().slice(0, 4)))
  );
  const [fillPresetId, setFillPresetId] = useState<string>(
    () => bootstrap.settings.shiftTemplates[0]?.id || ""
  );
  const [skipHolidaysOnFill, setSkipHolidaysOnFill] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cell editor state
  const [editingCell, setEditingCell] = useState<{
    worker: AgencyWorker;
    workDate: string;
    placement: AgencyPlacement | null;
    existing: AgencyShift | null;
  } | null>(null);
  const [cellForm, setCellForm] = useState<{
    shiftTemplateId: string;
    shiftLabel: string;
    startTime: string;
    endTime: string;
    hours: number;
    overtimeHours: number;
    status: AgencyShiftStatus;
    sickNote: string;
    notes: string;
  }>({
    shiftTemplateId: "",
    shiftLabel: "",
    startTime: "06:00",
    endTime: "14:00",
    hours: 8,
    overtimeHours: 0,
    status: "worked",
    sickNote: "",
    notes: "",
  });

  const yearNum = Number(periodYm.slice(0, 4)) || new Date().getFullYear();

  useEffect(() => {
    let alive = true;
    const fallback = builtinHolidays(country, yearNum);
    setHolidays(fallback);
    fetch(`/api/holidays.php?country=${encodeURIComponent(country)}&year=${yearNum}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data || !Array.isArray(data.days)) return;
        setHolidays(data.days as HolidayDay[]);
      })
      .catch(() => {
        // Keep builtinHolidays fallback
      });
    return () => {
      alive = false;
    };
  }, [country, yearNum]);

  const holidayByDate = useMemo(() => {
    const map = new Map<string, HolidayDay>();
    for (const d of holidays) {
      map.set(d.date, d);
    }
    return map;
  }, [holidays]);

  const monthDates = useMemo(() => monthDayDates(periodYm), [periodYm]);

  const clientNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clients) {
      map.set(c.id, c.name);
    }
    return map;
  }, [clients]);

  const paidLocks = useMemo(() => {
    const set = new Set<string>();
    for (const p of bootstrap.payments) {
      if (p.status === "paid") {
        set.add(`${p.workerId}:${p.periodYm}`);
      }
    }
    return set;
  }, [bootstrap.payments]);

  const activePlacementByWorker = useMemo(() => {
    const map = new Map<string, AgencyPlacement>();
    for (const pl of bootstrap.placements) {
      if (pl.status === "active") {
        map.set(pl.workerId, pl);
      } else if (!map.has(pl.workerId)) {
        map.set(pl.workerId, pl);
      }
    }
    return map;
  }, [bootstrap.placements]);

  const visibleWorkers = useMemo(() => {
    if (singleWorkerId) {
      return bootstrap.workers.filter((w) => w.id === singleWorkerId);
    }
    return bootstrap.workers.filter((w) => {
      if (w.workerStatus === "archived") return false;
      const pl = activePlacementByWorker.get(w.id);
      const hasShiftInMonth = bootstrap.shifts.some(
        (s) => s.workerId === w.id && s.workDate.startsWith(periodYm)
      );
      if (companyFilter) {
        const matchesPlacement = pl?.companyClientId === companyFilter;
        const matchesShift = bootstrap.shifts.some(
          (s) =>
            s.workerId === w.id &&
            s.workDate.startsWith(periodYm) &&
            s.companyClientId === companyFilter
        );
        if (!matchesPlacement && !matchesShift) return false;
      }
      if (workplaceFilter) {
        const matchesWp = pl?.workplaceId === workplaceFilter;
        const matchesShiftWp = bootstrap.shifts.some(
          (s) =>
            s.workerId === w.id &&
            s.workDate.startsWith(periodYm) &&
            s.workplaceId === workplaceFilter
        );
        if (!matchesWp && !matchesShiftWp) return false;
      }
      return w.workerStatus === "rented" || Boolean(pl) || hasShiftInMonth;
    });
  }, [
    bootstrap.workers,
    bootstrap.shifts,
    singleWorkerId,
    companyFilter,
    workplaceFilter,
    periodYm,
    activePlacementByWorker,
  ]);

  const shiftByWorkerDate = useMemo(() => {
    const map = new Map<string, AgencyShift>();
    for (const sh of bootstrap.shifts) {
      if (!sh.workDate.startsWith(periodYm)) continue;
      map.set(`${sh.workerId}:${sh.workDate}`, sh);
    }
    return map;
  }, [bootstrap.shifts, periodYm]);

  const companyOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const pl of bootstrap.placements) ids.add(pl.companyClientId);
    for (const wp of bootstrap.workplaces) ids.add(wp.companyClientId);
    return Array.from(ids).map((id) => ({ id, name: clientNameMap.get(id) || id }));
  }, [bootstrap.placements, bootstrap.workplaces, clientNameMap]);

  const workplaceOptions = useMemo(() => {
    return bootstrap.workplaces.filter((wp) => !companyFilter || wp.companyClientId === companyFilter);
  }, [bootstrap.workplaces, companyFilter]);

  const openCellEditor = (worker: AgencyWorker, workDate: string) => {
    const existing = shiftByWorkerDate.get(`${worker.id}:${workDate}`) || null;
    const pl =
      (existing?.placementId && bootstrap.placements.find((p) => p.id === existing.placementId)) ||
      activePlacementByWorker.get(worker.id) ||
      null;
    const defaultTpl =
      bootstrap.settings.shiftTemplates.find((tpl) => tpl.id === fillPresetId) ||
      bootstrap.settings.shiftTemplates[0];
    const holiday = holidayByDate.get(workDate);

    setErrorMsg(null);
    setEditingCell({ worker, workDate, placement: pl, existing });
    if (existing) {
      setCellForm({
        shiftTemplateId: existing.shiftTemplateId || "",
        shiftLabel: existing.shiftLabel,
        startTime: existing.startTime || "06:00",
        endTime: existing.endTime || "14:00",
        hours: Number(existing.hours || 0),
        overtimeHours: Number(existing.overtimeHours || 0),
        status: existing.status,
        sickNote: existing.sickNote || "",
        notes: existing.notes || "",
      });
    } else {
      setCellForm({
        shiftTemplateId: defaultTpl?.id || "",
        shiftLabel: defaultTpl?.code || (holiday ? "HOL" : "S1"),
        startTime: defaultTpl?.startTime || "06:00",
        endTime: defaultTpl?.endTime || "14:00",
        hours: holiday ? 0 : Number(defaultTpl?.defaultHours ?? 8),
        overtimeHours: 0,
        status: holiday ? "holiday" : "worked",
        sickNote: "",
        notes: holiday ? holidayName(holiday, country, lang) : "",
      });
    }
  };

  const applyTemplateToCellForm = (tplId: string) => {
    const tpl = bootstrap.settings.shiftTemplates.find((x) => x.id === tplId);
    if (!tpl) {
      setCellForm((prev) => ({ ...prev, shiftTemplateId: "" }));
      return;
    }
    setCellForm((prev) => ({
      ...prev,
      shiftTemplateId: tpl.id,
      shiftLabel: tpl.code,
      startTime: tpl.startTime,
      endTime: tpl.endTime,
      hours: prev.status === "sick" ? 0 : Number(tpl.defaultHours || 8),
    }));
  };

  const handleSaveCell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCell || !rights.edit) return;
    const companyClientId =
      editingCell.existing?.companyClientId ||
      editingCell.placement?.companyClientId ||
      companyFilter ||
      clients.find((c) => c.clientType === "business" || c.clientType === "partner")?.id ||
      "";
    if (!companyClientId) {
      setErrorMsg(
        t(
          "Assign a company placement before logging shifts.",
          "Pred záznamom zmien priraďte pracovníkovi umiestnenie vo firme.",
          "Műszak rögzítése előtt adjon meg céges kihelyezést."
        )
      );
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      await saveAgencyShifts([
        {
          id: editingCell.existing?.id,
          workerId: editingCell.worker.id,
          placementId: editingCell.placement?.id ?? editingCell.existing?.placementId ?? null,
          companyClientId,
          workplaceId: editingCell.placement?.workplaceId ?? editingCell.existing?.workplaceId ?? null,
          workDate: editingCell.workDate,
          shiftTemplateId: cellForm.shiftTemplateId || null,
          shiftLabel: cellForm.shiftLabel,
          startTime: cellForm.startTime,
          endTime: cellForm.endTime,
          hours: cellForm.status === "sick" || cellForm.status === "absent" ? 0 : Number(cellForm.hours || 0),
          overtimeHours: cellForm.status === "sick" || cellForm.status === "absent" ? 0 : Number(cellForm.overtimeHours || 0),
          status: cellForm.status,
          sickNote: cellForm.status === "sick" ? cellForm.sickNote : "",
          notes: cellForm.notes,
        },
      ]);
      await onChanged();
      setEditingCell(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save shift");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCell = async () => {
    if (!editingCell?.existing || !rights.edit) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await deleteAgencyShift(editingCell.existing.id);
      await onChanged();
      setEditingCell(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete shift");
    } finally {
      setSaving(false);
    }
  };

  const handleFillMonFri = async () => {
    if (!rights.edit || visibleWorkers.length === 0) return;
    const tpl =
      bootstrap.settings.shiftTemplates.find((x) => x.id === fillPresetId) ||
      bootstrap.settings.shiftTemplates[0];
    if (!tpl) return;

    const batch: Array<Partial<AgencyShift> & { workerId: string; companyClientId: string; workDate: string }> = [];
    for (const w of visibleWorkers) {
      if (!isAdmin && paidLocks.has(`${w.id}:${periodYm}`)) continue;
      const pl = activePlacementByWorker.get(w.id);
      const companyClientId = pl?.companyClientId || companyFilter;
      if (!companyClientId) continue;

      for (const iso of monthDates) {
        if (isWeekend(iso)) continue;
        if (skipHolidaysOnFill && holidayByDate.has(iso)) continue;
        if (pl?.startDate && iso < pl.startDate) continue;
        if (pl?.endDate && iso > pl.endDate) continue;
        if (shiftByWorkerDate.has(`${w.id}:${iso}`)) continue;
        batch.push({
          workerId: w.id,
          placementId: pl?.id ?? null,
          companyClientId,
          workplaceId: pl?.workplaceId ?? null,
          workDate: iso,
          shiftTemplateId: tpl.id,
          shiftLabel: tpl.code,
          startTime: tpl.startTime,
          endTime: tpl.endTime,
          hours: Number(tpl.defaultHours || 8),
          overtimeHours: 0,
          status: "worked",
        });
      }
    }

    if (batch.length === 0) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await saveAgencyShifts(batch);
      await onChanged();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Bulk fill failed");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyPreviousWeek = async () => {
    if (!rights.edit || visibleWorkers.length === 0) return;
    const batch: Array<Partial<AgencyShift> & { workerId: string; companyClientId: string; workDate: string }> = [];
    for (const w of visibleWorkers) {
      if (!isAdmin && paidLocks.has(`${w.id}:${periodYm}`)) continue;
      const workerShifts = bootstrap.shifts
        .filter((s) => s.workerId === w.id && s.workDate.startsWith(periodYm))
        .sort((a, b) => a.workDate.localeCompare(b.workDate));
      for (const sh of workerShifts) {
        const nextIso = addDays(sh.workDate, 7);
        if (!nextIso.startsWith(periodYm)) continue;
        if (skipHolidaysOnFill && holidayByDate.has(nextIso)) continue;
        if (shiftByWorkerDate.has(`${w.id}:${nextIso}`)) continue;
        batch.push({
          workerId: w.id,
          placementId: sh.placementId,
          companyClientId: sh.companyClientId,
          workplaceId: sh.workplaceId,
          workDate: nextIso,
          shiftTemplateId: sh.shiftTemplateId,
          shiftLabel: sh.shiftLabel,
          startTime: sh.startTime,
          endTime: sh.endTime,
          hours: sh.hours,
          overtimeHours: sh.overtimeHours,
          status: sh.status,
          sickNote: sh.sickNote,
          notes: sh.notes,
        });
      }
    }
    if (batch.length === 0) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await saveAgencyShifts(batch);
      await onChanged();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Copy week failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="agency-schedule-view">
      {/* Toolbar */}
      <div className=" rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 bg-gray-100 rounded-md p-1 border border-gray-200">
            <button
              type="button"
              onClick={() => setPeriodYm((p) => shiftMonth(p, -1))}
              className="p-1.5 rounded-lg hover:bg-white text-gray-600 cursor-pointer"
              title={t("Previous month", "Predošlý mesiac", "Előző hónap")}
            >
              <ChevronLeft className="size-4" />
            </button>
            <input
              type="month"
              value={periodYm}
              onChange={(e) => e.target.value && setPeriodYm(e.target.value)}
              data-testid="agency-schedule-month"
              className="bg-transparent text-ui font-bold text-gray-800 px-2 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setPeriodYm((p) => shiftMonth(p, 1))}
              className="p-1.5 rounded-lg hover:bg-white text-gray-600 cursor-pointer"
              title={t("Next month", "Ďalší mesiac", "Következő hónap")}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {!singleWorkerId && (
            <>
              <select
                value={companyFilter}
                onChange={(e) => {
                  setCompanyFilter(e.target.value);
                  setWorkplaceFilter("");
                }}
                data-testid="agency-schedule-company-filter"
                className="h-9 px-3 rounded-md border border-gray-200 bg-white text-caption font-semibold text-gray-700"
              >
                <option value="">{t("All companies", "Všetky firmy", "Minden cég")}</option>
                {companyOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                value={workplaceFilter}
                onChange={(e) => setWorkplaceFilter(e.target.value)}
                className="h-9 px-3 rounded-md border border-gray-200 bg-white text-caption font-semibold text-gray-700"
              >
                <option value="">{t("All workplaces", "Všetky pracoviská", "Minden munkahely")}</option>
                {workplaceOptions.map((wp) => (
                  <option key={wp.id} value={wp.id}>
                    {wp.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <select
            value={country}
            onChange={(e) => setCountry(e.target.value as "SK" | "HU")}
            data-testid="agency-schedule-country"
            className="h-9 px-3 rounded-md border border-gray-200 bg-white text-caption font-semibold text-gray-700"
          >
            <option value="SK">{t("Holidays: SK", "Sviatky: SK", "Ünnepek: SK")}</option>
            <option value="HU">{t("Holidays: HU", "Sviatky: HU", "Ünnepek: HU")}</option>
          </select>
        </div>

        {rights.edit && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={fillPresetId}
              onChange={(e) => setFillPresetId(e.target.value)}
              className="h-9 px-3 rounded-md border border-gray-200 bg-white text-caption font-semibold text-gray-700"
            >
              {bootstrap.settings.shiftTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.code} — {resolveLocalizedLabel(tpl.name, lang)} ({tpl.defaultHours}h)
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1.5 text-caption text-gray-600 px-2">
              <input
                type="checkbox"
                checked={skipHolidaysOnFill}
                onChange={(e) => setSkipHolidaysOnFill(e.target.checked)}
              />
              <span>{t("Skip holidays", "Vynechať sviatky", "Ünnepek kihagyása")}</span>
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={handleFillMonFri}
              data-testid="agency-schedule-fill-btn"
              className="px-3 py-1.5 rounded-md bg-[#5c6f28] text-white text-caption font-semibold inline-flex items-center gap-1.5 hover:bg-[#4a5a20] disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="size-3.5" />
              <span>{t("Fill Mon–Fri", "Vyplniť Po–Pi", "H–P kitöltése")}</span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleCopyPreviousWeek}
              data-testid="agency-schedule-copy-week-btn"
              className="px-3 py-1.5 rounded-md bg-white border border-gray-200 text-gray-700 text-caption font-semibold inline-flex items-center gap-1.5 hover:border-gray-300 disabled:opacity-50 cursor-pointer"
            >
              <Copy className="size-3.5" />
              <span>{t("Copy +1 week", "Kopírovať +1 týždeň", "Másolás +1 hét")}</span>
            </button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-ui font-semibold">
          {errorMsg}
        </div>
      )}

      {/* Matrix Grid */}
      <div className=" rounded-lg overflow-hidden">
        {visibleWorkers.length === 0 ? (
          <div className="p-10 text-center text-ui text-gray-500">
            <CalendarDays className="size-8 mx-auto text-gray-300 mb-2" />
            {t(
              "No rented employees or scheduled shifts for this selection.",
              "Pre tento výber nie sú žiadni prenajatí zamestnanci ani naplánované zmeny.",
              "Ehhez a szűréshez nincs kölcsönzött dolgozó vagy beosztott műszak."
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-caption">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="sticky left-0 z-10 bg-gray-50 text-left px-3 py-2.5 min-w-44 font-bold text-gray-700 border-r border-gray-200">
                    {t("Worker / Placement", "Pracovník / Firma", "Dolgozó / Cég")}
                  </th>
                  {monthDates.map((iso) => {
                    const hol = holidayByDate.get(iso);
                    const wknd = isWeekend(iso);
                    const dayNum = Number(iso.slice(8, 10));
                    const d = new Date(`${iso}T00:00:00`);
                    const wkLabel = d.toLocaleDateString(
                      lang === "sk" ? "sk-SK" : lang === "hu" ? "hu-HU" : "en-US",
                      { weekday: "narrow" }
                    );
                    return (
                      <th
                        key={iso}
                        title={hol ? holidayName(hol, country, lang) : iso}
                        data-holiday={hol ? "true" : "false"}
                        data-testid={hol ? `holiday-col-${iso}` : undefined}
                        className={`px-1 py-2 text-center min-w-9 border-r border-gray-100 ${
                          hol
                            ? "bg-amber-100/80 text-amber-900"
                            : wknd
                            ? "bg-gray-100/80 text-gray-500"
                            : "text-gray-600"
                        }`}
                      >
                        <div className="font-bold leading-none">{dayNum}</div>
                        <div className="text-micro font-medium mt-0.5 leading-none">{wkLabel}</div>
                        {hol && (
                          <div className="text-micro font-extrabold text-amber-700 mt-0.5 leading-none">
                            ★
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th className="px-3 py-2 text-right font-bold text-gray-700 min-w-20">
                    {t("Totals", "Spolu", "Össz.")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleWorkers.map((w) => {
                  const pl = activePlacementByWorker.get(w.id);
                  const isLocked = !isAdmin && paidLocks.has(`${w.id}:${periodYm}`);
                  let totalHrs = 0;
                  let sickCount = 0;
                  for (const iso of monthDates) {
                    const sh = shiftByWorkerDate.get(`${w.id}:${iso}`);
                    if (!sh) continue;
                    if (sh.status === "sick") sickCount += 1;
                    else if (sh.status !== "absent") totalHrs += Number(sh.hours || 0) + Number(sh.overtimeHours || 0);
                  }
                  return (
                    <tr key={w.id} className="border-b border-gray-100 hover:bg-gray-50/40">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r border-gray-200 align-middle">
                        <div className="flex items-center justify-between gap-1.5">
                          {onOpenWorker ? (
                            <button
                              type="button"
                              onClick={() => onOpenWorker(w.id)}
                              className="font-bold text-gray-900 hover:text-[#4a5a20] text-left truncate cursor-pointer"
                            >
                              {w.fullName}
                            </button>
                          ) : (
                            <span className="font-bold text-gray-900 truncate">{w.fullName}</span>
                          )}
                          {isLocked && (
                            <span
                              title={t("Paid period locked", "Vyplatené obdobie zamknuté", "Kifizetett időszak zárolva")}
                              className="text-amber-600 shrink-0"
                            >
                              <Lock className="size-3.5" />
                            </span>
                          )}
                        </div>
                        {pl && (
                          <div className="text-micro text-gray-500 truncate">
                            {clientNameMap.get(pl.companyClientId) || pl.companyClientId}
                          </div>
                        )}
                      </td>
                      {monthDates.map((iso) => {
                        const sh = shiftByWorkerDate.get(`${w.id}:${iso}`);
                        const hol = holidayByDate.get(iso);
                        const wknd = isWeekend(iso);
                        const badge = sh ? STATUS_BADGE[sh.status] : null;
                        return (
                          <td
                            key={iso}
                            className={`p-0.5 border-r border-gray-100 text-center align-middle ${
                              hol ? "bg-amber-50/60" : wknd ? "bg-gray-50/70" : ""
                            }`}
                          >
                            <button
                              type="button"
                              disabled={!rights.edit || isLocked}
                              onClick={() => openCellEditor(w, iso)}
                              data-testid={`agency-shift-cell-${w.id}-${iso}`}
                              title={
                                sh
                                  ? `${sh.status}: ${sh.shiftLabel || ""} ${sh.hours}h${sh.sickNote ? ` (${sh.sickNote})` : ""}`
                                  : hol
                                  ? holidayName(hol, country, lang)
                                  : iso
                              }
                              className={`w-full min-h-8 rounded-md border text-micro font-bold flex flex-col items-center justify-center transition-colors ${
                                sh && badge
                                  ? badge.cls
                                  : "border-transparent hover:border-gray-300 text-gray-300 hover:text-gray-600"
                              } ${rights.edit && !isLocked ? "cursor-pointer" : "cursor-default"}`}
                            >
                              {sh ? (
                                sh.status === "sick" ? (
                                  <>
                                    <HeartPulse className="size-3" />
                                    <span className="leading-none">PN</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="leading-none">{sh.shiftLabel || badge?.short}</span>
                                    <span className="leading-none font-normal opacity-80">
                                      {Number(sh.hours || 0)}h
                                    </span>
                                  </>
                                )
                              ) : (
                                <span>·</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-mono font-bold text-gray-800 whitespace-nowrap">
                        <div>{Math.round(totalHrs * 10) / 10}h</div>
                        {sickCount > 0 && (
                          <div className="text-micro text-rose-600 font-semibold">
                            {sickCount}d {t("sick", "PN", "beteg")}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Shift & Sick Leave Modal Editor */}
      {editingCell && (
        <div className="fixed inset-0 z-[1000] bg-gray-900/40  flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveCell}
            data-testid="agency-shift-editor"
            className="bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-md p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-body font-bold text-gray-900">{editingCell.worker.fullName}</h3>
                <p className="text-caption text-gray-500">
                  {editingCell.workDate}
                  {holidayByDate.has(editingCell.workDate) && (
                    <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                      ★ {holidayName(holidayByDate.get(editingCell.workDate)!, country, lang)}
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(["worked", "scheduled", "sick", "absent", "holiday"] as AgencyShiftStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setCellForm((prev) => ({ ...prev, status: st }))}
                  data-testid={st === "sick" ? "agency-shift-sick-toggle" : `agency-shift-status-${st}`}
                  className={`px-2.5 py-1.5 rounded-lg border text-caption font-semibold cursor-pointer ${
                    cellForm.status === st
                      ? st === "sick"
                        ? "bg-rose-600 text-white border-rose-700"
                        : "bg-gray-900 text-white border-gray-900"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {st === "worked"
                    ? t("Worked", "Odpracované", "Ledolgozva")
                    : st === "scheduled"
                    ? t("Scheduled", "Naplánované", "Beosztva")
                    : st === "sick"
                    ? t("Sick leave", "Práceneschopnosť", "Betegszabadság")
                    : st === "absent"
                    ? t("Absent", "Absencia", "Hiányzás")
                    : t("Holiday", "Sviatok", "Ünnepnap")}
                </button>
              ))}
            </div>

            {cellForm.status !== "sick" && cellForm.status !== "absent" ? (
              <div className="space-y-3">
                <div>
                  <label className="block type-overline text-gray-500 mb-1">
                    {t("Shift Template", "Šablóna zmeny", "Műszak sablon")}
                  </label>
                  <select
                    value={cellForm.shiftTemplateId}
                    onChange={(e) => applyTemplateToCellForm(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-gray-200 bg-white text-ui"
                  >
                    <option value="">{t("— Custom shift —", "— Vlastná zmena —", "— Egyéni műszak —")}</option>
                    {bootstrap.settings.shiftTemplates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.code} — {resolveLocalizedLabel(tpl.name, lang)} ({tpl.startTime}–{tpl.endTime})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block type-overline text-gray-500 mb-1">
                      {t("Code", "Kód", "Kód")}
                    </label>
                    <input
                      type="text"
                      value={cellForm.shiftLabel}
                      onChange={(e) => setCellForm((p) => ({ ...p, shiftLabel: e.target.value }))}
                      className="w-full h-9 px-2.5 rounded-md border border-gray-200 text-ui"
                    />
                  </div>
                  <div>
                    <label className="block type-overline text-gray-500 mb-1">
                      {t("Start", "Od", "Kezdés")}
                    </label>
                    <input
                      type="time"
                      value={cellForm.startTime}
                      onChange={(e) => setCellForm((p) => ({ ...p, startTime: e.target.value }))}
                      className="w-full h-9 px-2.5 rounded-md border border-gray-200 text-ui"
                    />
                  </div>
                  <div>
                    <label className="block type-overline text-gray-500 mb-1">
                      {t("End", "Do", "Vége")}
                    </label>
                    <input
                      type="time"
                      value={cellForm.endTime}
                      onChange={(e) => setCellForm((p) => ({ ...p, endTime: e.target.value }))}
                      className="w-full h-9 px-2.5 rounded-md border border-gray-200 text-ui"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block type-overline text-gray-500 mb-1">
                      {t("Regular hours", "Bežné hodiny", "Normál óra")}
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={cellForm.hours}
                      onChange={(e) => setCellForm((p) => ({ ...p, hours: Number(e.target.value) }))}
                      className="w-full h-9 px-2.5 rounded-md border border-gray-200 text-ui"
                    />
                  </div>
                  <div>
                    <label className="block type-overline text-gray-500 mb-1">
                      {t("Overtime hours", "Nadčasy (h)", "Túlóra (ó)")}
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={cellForm.overtimeHours}
                      onChange={(e) => setCellForm((p) => ({ ...p, overtimeHours: Number(e.target.value) }))}
                      className="w-full h-9 px-2.5 rounded-md border border-gray-200 text-ui"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="block type-overline text-rose-700 mb-1">
                  {t("Sick leave reason / certificate note", "Dôvod PN / poznámka lekára", "Betegszabadság megjegyzés")}
                </label>
                <input
                  type="text"
                  value={cellForm.sickNote}
                  onChange={(e) => setCellForm((p) => ({ ...p, sickNote: e.target.value }))}
                  data-testid="agency-shift-sick-note"
                  placeholder={t("e.g. Flu, medical certificate submitted", "napr. Chrípka, potvrdenie od lekára", "pl. Influenza, orvosi igazolás")}
                  className="w-full h-9 px-3 rounded-md border border-rose-200 bg-rose-50/40 text-ui"
                />
              </div>
            )}

            <div>
              <label className="block type-overline text-gray-500 mb-1">
                {t("Notes", "Poznámka", "Megjegyzés")}
              </label>
              <input
                type="text"
                value={cellForm.notes}
                onChange={(e) => setCellForm((p) => ({ ...p, notes: e.target.value }))}
                className="w-full h-9 px-3 rounded-md border border-gray-200 text-ui"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              {editingCell.existing ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleDeleteCell}
                  data-testid="agency-shift-delete-btn"
                  className="px-3 py-1.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-caption font-semibold inline-flex items-center gap-1 hover:bg-rose-100 cursor-pointer"
                >
                  <Trash2 className="size-3.5" />
                  <span>{t("Clear", "Zmazať", "Törlés")}</span>
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCell(null)}
                  className="px-3 py-1.5 rounded-md bg-white border border-gray-200 text-caption font-semibold text-gray-700 cursor-pointer"
                >
                  {t("Cancel", "Zrušiť", "Mégse")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  data-testid="agency-shift-save-btn"
                  className="px-4 py-1.5 rounded-md bg-[#5c6f28] text-white text-caption font-semibold hover:bg-[#4a5a20] disabled:opacity-50 cursor-pointer"
                >
                  {saving ? t("Saving…", "Ukladám…", "Mentés…") : t("Save shift", "Uložiť zmenu", "Mentés")}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
