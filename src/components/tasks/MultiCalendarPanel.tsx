import React, { useEffect, useMemo, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, Clock, Plus } from "lucide-react";
import type {
  CustomCalendar,
  CustomCalendarEvent,
  Employee,
  EmployeeSalary,
  EmployeeVacation,
  FinancialRecord,
  InvoiceOffer,
  Lead,
  MeetingNote,
  Order,
  Project,
  ProjectType,
  SupportContract,
  Task,
  Ticket,
  UnifiedEntryRegistry,
  UnifiedEntryRow,
  WarehouseBatch,
} from "../../types";
import type { Language } from "../../utils/translations";
import type { ProjectStatusDef } from "../../utils/projects";
import type { OfferStatusDef } from "../../utils/offerStatuses";
import { formatMoney } from "../../utils/currency";
import { useTimeEntries } from "../../hooks/useTimeEntries";
import { formatDuration } from "../../utils/timeTracking";
import {
  buildCustomCalendarData,
  buildDeadlinesCalendarData,
  buildLogisticsCalendarData,
  buildMarketingCalendarData,
  buildPaymentCalendarData,
  buildSalesCalendarData,
  buildTeamCalendarData,
  buildWorkCalendarData,
  mondayOfIso,
  type HubCalendarItem,
  type HubCalendarRbac,
  type WeeklyPaymentRollup,
} from "../../utils/taskHubCalendars";

export interface TaskHubData {
  projectTypes: ProjectType[];
  projectStatuses?: readonly ProjectStatusDef[];
  financialRecords: FinancialRecord[];
  invoicesOffers: InvoiceOffer[];
  invoiceStatuses?: readonly OfferStatusDef[];
  employeeSalaries: EmployeeSalary[];
  employeeVacations: EmployeeVacation[];
  orders: Order[];
  warehouseBatches: WarehouseBatch[];
  meetingNotes: MeetingNote[];
  unifiedEntries: UnifiedEntryRegistry[];
  unifiedEntriesData: Record<string, UnifiedEntryRow[]>;
  supportContracts: SupportContract[];
  systemCurrency?: string;
  rbac: HubCalendarRbac;
}

interface MultiCalendarPanelProps {
  lensId: string;
  anchor: Date;
  scope: "month" | "week" | "timeline" | "hide";
  selectedDay: Date | null;
  onSelectDay: (day: Date | null) => void;
  weekdayNames: string[];
  dateLocale: string;
  todayStr: string;
  lang: Language;
  currentUserName: string;
  tasks: Task[];
  leads: Lead[];
  projects: Project[];
  tickets: Ticket[];
  employees: Employee[];
  hubData: TaskHubData;
  customCalendars: CustomCalendar[];
  customEvents: CustomCalendarEvent[];
  canEditCustom: boolean;
  onAddCustomEvent: (calendar: CustomCalendar, dateStr: string) => void;
  onEditCustomEvent: (calendar: CustomCalendar, event: CustomCalendarEvent) => void;
  onOpenTask?: (taskId: string) => void;
}

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const getMonthDays = (year: number, month: number): Date[] => {
  const date = new Date(year, month, 1);
  const days: Date[] = [];
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

const getMonthPadding = (year: number, month: number): number =>
  (new Date(year, month, 1).getDay() + 6) % 7;

const getWeekDays = (anchor: Date): Date[] => {
  const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
};

const pillToneClasses = (item: HubCalendarItem): string => {
  if (item.tone === "rose") return "bg-rose-50 text-rose-700 border-rose-200";
  if (item.tone === "emerald") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (item.tone === "amber") return "bg-amber-50 text-amber-700 border-amber-200";
  if (item.tone === "sky") return "bg-sky-50 text-sky-700 border-sky-200";
  if (item.tone === "violet") return "bg-violet-50 text-violet-700 border-violet-200";
  if (item.tone === "indigo") return "bg-entity-subtle text-entity-text border-entity-border";
  return "bg-gray-50 text-gray-700 border-gray-200";
};

export const MultiCalendarPanel: React.FC<MultiCalendarPanelProps> = ({
  lensId,
  anchor,
  scope,
  selectedDay,
  onSelectDay,
  weekdayNames,
  dateLocale,
  todayStr,
  lang,
  currentUserName,
  tasks,
  leads,
  projects,
  tickets,
  employees,
  hubData,
  customCalendars,
  customEvents,
  canEditCustom,
  onAddCustomEvent,
  onEditCustomEvent,
  onOpenTask,
}) => {
  const t = (en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);
  const currency = hubData.systemCurrency || "EUR";
  const fmtMoney = (amt: number, cur?: string) => formatMoney(amt, cur || currency, lang);

  // Work lens controls
  const [workScope, setWorkScope] = useState<"all" | "mine">("all");
  const [workProjectType, setWorkProjectType] = useState<string>("all");
  const [showTrackedHours, setShowTrackedHours] = useState(false);

  // Payment lens controls
  const [paymentFilter, setPaymentFilter] = useState<"all" | "invoice_due" | "planned_invoicing" | "expense">("all");

  // Lazy marketing state
  const [marketingData, setMarketingData] = useState<{
    campaigns: Array<{ id: string; name: string; status?: string; scheduledAt?: string | null; sentAt?: string | null }>;
    socialPosts: Array<{ id: string; content?: string; title?: string; status?: string; scheduledFor?: string | null; publishedAt?: string | null }>;
  }>({ campaigns: [], socialPosts: [] });

  const { rangeStart, rangeEnd, monthDays, weekDays, padding } = useMemo(() => {
    const mDays = getMonthDays(anchor.getFullYear(), anchor.getMonth());
    const wDays = getWeekDays(anchor);
    const padCount = getMonthPadding(anchor.getFullYear(), anchor.getMonth());
    const start = scope === "week" ? toIso(wDays[0]) : toIso(mDays[0]);
    const end = scope === "week" ? toIso(wDays[6]) : toIso(mDays[mDays.length - 1]);
    return { rangeStart: start, rangeEnd: end, monthDays: mDays, weekDays: wDays, padding: padCount };
  }, [anchor, scope]);

  useEffect(() => {
    if (lensId !== "marketing") return;
    let cancelled = false;
    (async () => {
      const next: typeof marketingData = { campaigns: [], socialPosts: [] };
      if (hubData.rbac.newsletter) {
        try {
          const res = await fetch("/api/newsletter.php?action=list_campaigns", { credentials: "include" });
          if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json?.campaigns)) next.campaigns = json.campaigns;
          }
        } catch {}
      }
      if (hubData.rbac.social) {
        try {
          const res = await fetch("/api/zernio.php?action=get_posts", { credentials: "include" });
          if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json?.posts)) next.socialPosts = json.posts;
          }
        } catch {}
      }
      if (!cancelled) setMarketingData(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [lensId, hubData.rbac.newsletter, hubData.rbac.social]);

  const { entries: trackedEntries } = useTimeEntries(
    lensId === "work" && showTrackedHours ? { from: rangeStart, to: rangeEnd } : null
  );

  const activeCustomCalendar = useMemo(
    () => (lensId.startsWith("custom:") ? customCalendars.find((c) => `custom:${c.id}` === lensId) || null : null),
    [lensId, customCalendars]
  );

  const { byDate, weeklyRollups } = useMemo(() => {
    if (lensId === "work") {
      const res = buildWorkCalendarData({
        projects,
        projectTypes: hubData.projectTypes,
        projectStatuses: hubData.projectStatuses,
        tasks,
        leads,
        rangeStart,
        rangeEnd,
        todayIso: todayStr,
        scope: workScope,
        currentUserName,
        projectTypeFilter: workProjectType,
      });
      if (showTrackedHours && trackedEntries.length > 0) {
        const byProjDay = new Map<string, number>();
        for (const e of trackedEntries) {
          if (!e.projectId || !e.entryDate) continue;
          const k = `${e.entryDate}:${e.projectId}`;
          byProjDay.set(k, (byProjDay.get(k) || 0) + (e.durationSec || 0));
        }
        const projMap = new Map(projects.map((p) => [p.id, p]));
        for (const [k, sec] of byProjDay.entries()) {
          if (sec <= 0) continue;
          const [date, pid] = k.split(":");
          const p = projMap.get(pid);
          const arr = res.byDate.get(date) || [];
          arr.push({
            id: `work:time:${k}`,
            date,
            title: `${p?.name || "Project"} (${formatDuration(sec)})`,
            color: "#0ea5e9",
            tone: "sky",
            category: "time",
            href: `#projects/${pid}`,
          });
          res.byDate.set(date, arr);
        }
      }
      return { byDate: res.byDate, weeklyRollups: new Map<string, WeeklyPaymentRollup>() };
    }

    if (lensId === "payments") {
      const res = buildPaymentCalendarData({
        financialRecords: hubData.financialRecords,
        invoicesOffers: hubData.invoicesOffers,
        invoiceStatuses: hubData.invoiceStatuses,
        projects,
        projectTypes: hubData.projectTypes,
        projectStatuses: hubData.projectStatuses,
        employeeSalaries: hubData.employeeSalaries,
        employees,
        orders: hubData.orders,
        leads,
        rangeStart,
        rangeEnd,
        todayIso: todayStr,
        defaultCurrency: currency,
      });
      if (paymentFilter !== "all") {
        const filtered = new Map<string, HubCalendarItem[]>();
        for (const [d, items] of res.byDate.entries()) {
          const matching = items.filter((i) => i.category === paymentFilter);
          if (matching.length > 0) filtered.set(d, matching);
        }
        return { byDate: filtered, weeklyRollups: res.weeklyRollups };
      }
      return res;
    }

    if (lensId === "team") {
      return { ...buildTeamCalendarData({ employees, employeeVacations: hubData.employeeVacations, rangeStart, rangeEnd }), weeklyRollups: new Map() };
    }
    if (lensId === "sales") {
      return { ...buildSalesCalendarData({ meetingNotes: hubData.meetingNotes, invoicesOffers: hubData.invoicesOffers, leads, rangeStart, rangeEnd, todayIso: todayStr }), weeklyRollups: new Map() };
    }
    if (lensId === "deadlines") {
      return { ...buildDeadlinesCalendarData({ unifiedEntries: hubData.unifiedEntries, unifiedEntriesData: hubData.unifiedEntriesData, supportContracts: hubData.supportContracts, tickets, rangeStart, rangeEnd, todayIso: todayStr }), weeklyRollups: new Map() };
    }
    if (lensId === "logistics") {
      return { ...buildLogisticsCalendarData({ orders: hubData.orders, warehouseBatches: hubData.warehouseBatches, rangeStart, rangeEnd, todayIso: todayStr }), weeklyRollups: new Map() };
    }
    if (lensId === "marketing") {
      return { ...buildMarketingCalendarData({ campaigns: marketingData.campaigns, socialPosts: marketingData.socialPosts, rangeStart, rangeEnd }), weeklyRollups: new Map() };
    }
    if (activeCustomCalendar) {
      return { ...buildCustomCalendarData({ calendar: activeCustomCalendar, events: customEvents, rangeStart, rangeEnd }), weeklyRollups: new Map() };
    }
    return { byDate: new Map<string, HubCalendarItem[]>(), weeklyRollups: new Map<string, WeeklyPaymentRollup>() };
  }, [
    lensId,
    projects,
    hubData,
    tasks,
    leads,
    rangeStart,
    rangeEnd,
    todayStr,
    workScope,
    currentUserName,
    workProjectType,
    showTrackedHours,
    trackedEntries,
    currency,
    paymentFilter,
    employees,
    tickets,
    marketingData,
    activeCustomCalendar,
    customEvents,
  ]);

  const handleItemClick = (item: HubCalendarItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.customEvent && activeCustomCalendar) {
      onEditCustomEvent(activeCustomCalendar, item.customEvent);
      return;
    }
    if (item.taskId && onOpenTask) {
      onOpenTask(item.taskId);
      return;
    }
    if (item.href) {
      window.location.hash = item.href.replace(/^#/, "");
    }
  };

  const renderWeekSummaryPill = (weekMonday: string) => {
    const roll = weeklyRollups.get(weekMonday);
    if (!roll) return null;
    const entries = Object.entries(roll.byCurrency);
    if (entries.length === 0) return null;
    const [cur, data] = entries[0];
    if (data.plannedInvoicing === 0 && data.invoicesDue === 0 && data.expenses === 0) return null;

    return (
      <div
        data-testid={`payment-week-rollup-${weekMonday}`}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1 bg-slate-50/90 border-b border-slate-200 text-micro"
      >
        <span className="font-bold text-slate-500 uppercase tracking-wider">
          {t("Week", "Týždeň", "Hét")} {weekMonday.slice(5)}
        </span>
        {data.plannedInvoicing > 0 && (
          <span className="font-semibold text-indigo-700">
            {t("To invoice (plan)", "Plán fakturácie", "Terv. számlázás")}: {fmtMoney(data.plannedInvoicing, cur)}
          </span>
        )}
        {data.invoicesDue > 0 && (
          <span className="font-semibold text-emerald-700">
            {t("Due", "Splatné", "Esedékes")}: {fmtMoney(data.invoicesDue, cur)}
          </span>
        )}
        {data.expenses > 0 && (
          <span className="font-semibold text-rose-700">
            {t("Expenses", "Výdavky", "Kiadások")}: −{fmtMoney(data.expenses, cur)}
          </span>
        )}
        <span className={`font-bold ml-auto tabular-nums ${data.net >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
          {t("Net", "Čistý tok", "Nettó")}: {data.net >= 0 ? "+" : ""}{fmtMoney(data.net, cur)}
        </span>
      </div>
    );
  };

  const renderLensToolbar = () => {
    if (lensId === "work") {
      return (
        <div className="px-3 py-2 border-b border-gray-200 bg-white flex flex-wrap items-center justify-between gap-2 text-caption">
          <div className="flex items-center gap-1.5">
            {(["all", "mine"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setWorkScope(s)}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-colors ${
                  workScope === s ? "bg-entity-subtle text-entity-text border border-entity-border" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {s === "all" ? t("All Projects", "Všetky projekty", "Minden projekt") : t("My Projects", "Moje projekty", "Saját projektek")}
              </button>
            ))}
            {hubData.projectTypes.length > 0 && (
              <select
                value={workProjectType}
                onChange={(e) => setWorkProjectType(e.target.value)}
                className="h-7 px-2 rounded-md border border-gray-200 bg-white text-caption text-gray-700"
              >
                <option value="all">{t("All types", "Všetky typy", "Minden típus")}</option>
                {hubData.projectTypes.map((pt) => (
                  <option key={pt.id} value={pt.id}>
                    {pt.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowTrackedHours((v) => !v)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border font-semibold cursor-pointer transition-colors ${
              showTrackedHours ? "bg-sky-50 border-sky-200 text-sky-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Clock className="h-3 w-3" />
            <span>{t("Tracked hours", "Odpracované hodiny", "Rögzített órák")}</span>
          </button>
        </div>
      );
    }

    if (lensId === "payments") {
      const chips: Array<{ id: typeof paymentFilter; label: string }> = [
        { id: "all", label: t("All", "Všetko", "Mind") },
        { id: "invoice_due", label: t("Invoices Due", "Splatné faktúry", "Lejáró számlák") },
        { id: "planned_invoicing", label: t("Planned Invoicing", "Plán fakturácie", "Terv. számlázás") },
        { id: "expense", label: t("Expenses", "Výdavky", "Kiadások") },
      ];
      return (
        <div className="px-3 py-2 border-b border-gray-200 bg-white flex flex-wrap items-center gap-1.5 text-caption">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setPaymentFilter(c.id)}
              className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-colors ${
                paymentFilter === c.id ? "bg-entity-subtle text-entity-text border border-entity-border" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      );
    }

    if (activeCustomCalendar) {
      return (
        <div className="px-3 py-2 border-b border-gray-200 bg-white flex items-center justify-between gap-2 text-caption">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: activeCustomCalendar.color }} />
            <span className="font-semibold text-gray-800 truncate">{activeCustomCalendar.name}</span>
            {activeCustomCalendar.description && (
              <span className="text-gray-400 truncate hidden ws-sm:inline">— {activeCustomCalendar.description}</span>
            )}
          </div>
          {canEditCustom && (
            <button
              type="button"
              data-testid="custom-calendar-add-event-btn"
              onClick={() => onAddCustomEvent(activeCustomCalendar, selectedDay ? toIso(selectedDay) : todayStr)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-entity-solid hover:bg-entity-solid-hover text-white font-semibold cursor-pointer shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t("Add Event", "Pridať udalosť", "Új esemény")}</span>
            </button>
          )}
        </div>
      );
    }

    return null;
  };

  if (selectedDay) {
    const selectedIso = toIso(selectedDay);
    const items = byDate.get(selectedIso) || [];
    return (
      <div className="flex flex-col h-full animate-in fade-in duration-150">
        {renderLensToolbar()}
        <div className="p-5 border-b border-gray-200 flex items-center justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => onSelectDay(null)}
              className="flex items-center gap-1 text-entity-text type-overline mb-1.5 cursor-pointer hover:opacity-80"
            >
              <ChevronLeft className="h-4 w-4" />
              {t("Back to Calendar", "Späť na kalendár", "Vissza a naptárhoz")}
            </button>
            <h2 className="type-metric text-gray-900 flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-entity-text" />
              {selectedDay.toLocaleDateString(dateLocale, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </h2>
          </div>
          {activeCustomCalendar && canEditCustom && (
            <button
              type="button"
              onClick={() => onAddCustomEvent(activeCustomCalendar, selectedIso)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-entity-solid text-white text-caption font-semibold cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("Add Event", "Pridať udalosť", "Új esemény")}
            </button>
          )}
        </div>

        <div className="p-5 space-y-2.5 bg-gray-50 flex-1">
          {items.length === 0 ? (
            <div className="p-6 rounded-lg border border-dashed border-gray-200 bg-white text-center text-ui font-semibold text-gray-400">
              {t("No items on this day.", "V tento deň nie sú žiadne položky.", "Ezen a napon nincs tétel.")}
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                onClick={(e) => handleItemClick(item, e)}
                className="p-3 rounded-lg bg-white border border-gray-200 hover:border-entity-border flex items-center justify-between gap-3 cursor-pointer shadow-2xs transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <div className="min-w-0">
                    <div className="font-semibold text-ui text-gray-900 truncate">{item.title}</div>
                    {(item.subtitle || item.startTime) && (
                      <div className="text-caption text-gray-500 truncate">
                        {item.startTime ? `${item.startTime}${item.endTime ? `–${item.endTime}` : ""} · ` : ""}
                        {item.subtitle || ""}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {typeof item.amount === "number" && (
                    <span className={`font-bold text-ui tabular-nums ${item.category === "expense" ? "text-rose-600" : "text-emerald-700"}`}>
                      {item.category === "expense" ? "−" : "+"}
                      {fmtMoney(item.amount, item.currency)}
                    </span>
                  )}
                  {item.badge && (
                    <span className={`px-2 py-0.5 rounded-md border text-micro font-semibold ${pillToneClasses(item)}`}>
                      {item.badge}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  if (scope === "week") {
    const mondayStr = toIso(weekDays[0]);
    return (
      <div className="flex flex-col h-full bg-white">
        {renderLensToolbar()}
        {lensId === "payments" && renderWeekSummaryPill(mondayStr)}
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200 shrink-0">
          {weekDays.map((date, idx) => {
            const dateStr = toIso(date);
            const isToday = dateStr === todayStr;
            return (
              <div key={dateStr} className={`py-2 text-center border-r border-gray-100 last:border-0 ${isToday ? "bg-entity-subtle/70" : ""}`}>
                <div className="type-overline text-gray-500">{weekdayNames[idx]}</div>
                <div className={`mt-1 mx-auto text-caption font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-entity-solid text-white" : "text-gray-600"}`}>
                  {date.getDate()}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex-1 grid grid-cols-7">
          {weekDays.map((date) => {
            const dateStr = toIso(date);
            const items = byDate.get(dateStr) || [];
            return (
              <div
                key={dateStr}
                onClick={() => onSelectDay(date)}
                className="min-h-55 border-r border-gray-100 last:border-0 p-1.5 flex flex-col gap-1.5 cursor-pointer hover:bg-gray-50"
              >
                {items.map((item) => (
                  <div
                    key={item.id}
                    onClick={(e) => handleItemClick(item, e)}
                    style={item.customEvent ? { borderLeftWidth: 3, borderLeftColor: item.color } : undefined}
                    className={`text-micro font-semibold px-1.5 py-1 rounded-md border ${item.dashed ? "border-dashed" : ""} ${pillToneClasses(item)}`}
                  >
                    {item.startTime && <span className="block font-bold tabular-nums opacity-75">{item.startTime}{item.endTime ? `–${item.endTime}` : ""}</span>}
                    <span className="block truncate">{item.title}</span>
                    {typeof item.amount === "number" && (
                      <span className="block font-bold tabular-nums">{item.category === "expense" ? "−" : "+"}{fmtMoney(item.amount, item.currency)}</span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Month Grid: split into week rows so Payments can render the weekly planned invoicing & net strip under each week
  const cells: Array<Date | null> = [...Array.from({ length: padding }, () => null), ...monthDays];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<Date | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="flex flex-col h-full bg-white" data-testid={`multi-calendar-panel-${lensId}`}>
      {renderLensToolbar()}
      <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200 shrink-0">
        {weekdayNames.map((d) => (
          <div key={d} className="py-2.5 text-center type-overline text-slate-500 border-r border-slate-100 last:border-0">
            {d}
          </div>
        ))}
      </div>

      <div className="flex-1 flex flex-col">
        {weeks.map((week, wIdx) => {
          const firstValid = week.find(Boolean);
          const weekMonday = firstValid ? mondayOfIso(toIso(firstValid)) : "";
          return (
            <React.Fragment key={wIdx}>
              <div className="grid grid-cols-7 flex-1">
                {week.map((date, cIdx) => {
                  if (!date) {
                    return <div key={`pad-${wIdx}-${cIdx}`} className="bg-slate-50/50 border-b border-r border-slate-100 min-h-20" />;
                  }
                  const dateStr = toIso(date);
                  const isToday = dateStr === todayStr;
                  const items = byDate.get(dateStr) || [];
                  const display = items.slice(0, 3);
                  const hidden = items.length - display.length;

                  return (
                    <div
                      key={dateStr}
                      onClick={() => onSelectDay(date)}
                      className={`min-h-20 border-b border-r border-gray-100 p-1.5 flex flex-col gap-1 cursor-pointer group hover:bg-gray-50 ${
                        isToday ? "bg-entity-subtle/40" : "bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        {activeCustomCalendar && canEditCustom ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddCustomEvent(activeCustomCalendar, dateStr);
                            }}
                            title={t("Add event", "Pridať udalosť", "Új esemény")}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-entity-text cursor-pointer"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        ) : <span />}
                        <span className={`text-micro font-bold w-5 h-5 flex items-center justify-center rounded-full ${isToday ? "bg-entity-solid text-white" : "text-gray-500"}`}>
                          {date.getDate()}
                        </span>
                      </div>

                      <div className="flex-1 space-y-1 overflow-hidden">
                        {display.map((item) => (
                          <div
                            key={item.id}
                            onClick={(e) => handleItemClick(item, e)}
                            style={item.customEvent ? { borderLeftWidth: 3, borderLeftColor: item.color } : undefined}
                            title={item.title}
                            className={`truncate text-micro font-semibold px-1 py-0.5 rounded border ${item.dashed ? "border-dashed" : ""} ${pillToneClasses(item)}`}
                          >
                            {item.startTime ? `${item.startTime} ` : ""}
                            {typeof item.amount === "number" ? `${item.category === "expense" ? "−" : "+"}${fmtMoney(item.amount, item.currency)} · ` : ""}
                            {item.title}
                          </div>
                        ))}
                        {hidden > 0 && <div className="text-micro font-bold text-slate-400 pl-1">+{hidden}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {lensId === "payments" && weekMonday && renderWeekSummaryPill(weekMonday)}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
