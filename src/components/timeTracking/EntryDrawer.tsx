import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, Copy, Trash2, Unlink, X } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";
import { resolveWorkCountry, type HolidayCountry } from "../../utils/holidays.ts";
import { matchOpenTasks, matchOpenTickets } from "../../utils/timeLinks.ts";
import { isClosedTicketStatus } from "../../utils/tickets";
import { isEntryLocked, lockReason, type LockReasonCode } from "../../utils/timeLock.ts";
import { isAdminRoleName } from "../../utils/permissions.ts";
import {
  clockTime,
  formatDuration,
  isoFromLocal,
  needsLinkConfirmation,
  parseDurationInput,
  todayIso,
  type TimeEntry,
} from "../../utils/timeTracking.ts";
import { TimeApiError, createEntry, timeErrorMessage, updateEntry, type EntryInput } from "../../utils/timeTrackingApi.ts";
import type { Task } from "../../types";
import { ProjectPicker } from "./ProjectPicker";
import { canRenameTitle, renameHint, useMoney, useTimeLookups, type TimeDeps } from "./shared";

interface Props {
  entry: TimeEntry;
  deps: TimeDeps;
  recentProjectIds: string[];
  secondsByProject?: Record<string, number>;
  onClose: () => void;
  onDelete: (entry: TimeEntry) => void;
}

const SOURCE_LABEL: Record<string, [string, string, string]> = {
  timer: ["timer", "časovač", "időzítő"],
  manual: ["manual entry", "ručný záznam", "kézi rögzítés"],
  day: ["daily log", "denný záznam", "napi napló"],
  calendar: ["calendar", "kalendár", "naptár"],
  timesheet: ["timesheet", "výkaz", "munkalap"],
  extension: ["Chrome extension", "rozšírenie pre Chrome", "Chrome-bővítmény"],
  activity: ["activity capture", "zachytená aktivita", "rögzített tevékenység"],
  toggl: ["Toggl import", "import z Toggl", "Toggl-import"],
  clockify: ["Clockify import", "import z Clockify", "Clockify-import"],
  ticket_legacy: ["old ticket time", "starý čas tiketu", "régi jegyidő"],
};

/** The right-hand drawer for one entry, opened from any list. */
export function EntryDrawer({ entry, deps, recentProjectIds, secondsByProject, onClose, onDelete }: Props) {
  const tt = useTimeTracking();
  const { t, viewer, userId } = tt;
  const lookups = useTimeLookups(deps);
  const money = useMoney(deps);
  const rename = canRenameTitle(entry, deps);
  const hint = renameHint(entry, t);

  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const [projectId, setProjectId] = useState<string | null>(entry.projectId);
  const [taskId, setTaskId] = useState<string | null>(entry.taskId);
  const [ticketId, setTicketId] = useState<string | null>(entry.taskId ? null : entry.ticketId);
  const [unlinkedTitle, setUnlinkedTitle] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<Task | null>(null);
  const [taskQuery, setTaskQuery] = useState("");
  const [ticketQuery, setTicketQuery] = useState("");
  const [date, setDate] = useState(entry.entryDate);
  const [start, setStart] = useState(clockTime(entry.startAt));
  const [end, setEnd] = useState(clockTime(entry.endAt));
  const [dur, setDur] = useState(entry.durationSec !== null ? formatDuration(entry.durationSec) : "");
  const [person, setPerson] = useState(entry.userId);
  const [billable, setBillable] = useState(entry.billable);
  const [tags, setTags] = useState(entry.tags.join(", "));

  const linkedTask = taskId ? lookups.taskById.get(taskId) ?? null : null;
  const linkedTicket = ticketId ? deps.tickets.find((row) => row.id === ticketId) ?? null : null;
  const isLinked = !!taskId || (!!ticketId && unlinkedTitle === null);
  const ownText = isLinked ? "" : title;
  const suggestions = useMemo(() => (isLinked ? [] : matchOpenTasks(deps.tasks, taskQuery, deps.isTaskDone)), [deps.tasks, deps.isTaskDone, taskQuery, isLinked]);
  const ticketSuggestions = useMemo(
    () => (isLinked || !deps.canLinkTicket ? [] : matchOpenTickets(deps.tickets, ticketQuery, (row) => isClosedTicketStatus(row.status))),
    [deps.canLinkTicket, deps.tickets, ticketQuery, isLinked],
  );
  const locale = deps.language === "sk" ? "sk-SK" : deps.language === "hu" ? "hu-HU" : "en-US";

  const close = () => {
    setClosing(true);
    window.setTimeout(onClose, 180);
  };

  const unlink = () => {
    // The entry's own title starts as the task's title at this moment (the server does the same).
    const current = linkedTask?.title ?? linkedTicket?.title ?? linkedTicket?.subject ?? entry.title;
    setTaskId(null);
    setTicketId(null);
    setUnlinkedTitle(current);
    setTitle(current);
  };

  const link = (task: Task) => {
    setTaskId(task.id);
    setTitle(task.title);
    setTaskQuery("");
    setPendingLink(null);
    const resolved = lookups.resolveTaskProject(task);
    if (!projectId && resolved.projectId) setProjectId(resolved.projectId);
  };

  const requestLink = (task: Task) => {
    // Linking drops the entry's own text: ask first when it would lose something different.
    if (needsLinkConfirmation(title, task.title)) setPendingLink(task);
    else link(task);
  };

  const buildTimes = (): Partial<EntryInput> | string => {
    if (entry.running) {
      return start ? { startAt: isoFromLocal(date, start), entryDate: date } : { entryDate: date };
    }
    const seconds = parseDurationInput(dur);
    if (start && end) {
      const s = isoFromLocal(date, start);
      let e = isoFromLocal(date, end);
      if (e <= s) e = new Date(new Date(e).getTime() + 86_400_000).toISOString(); // past midnight
      return { entryDate: date, startAt: s, endAt: e };
    }
    if (start && seconds) return { entryDate: date, startAt: isoFromLocal(date, start), endAt: null, durationSec: seconds };
    if (seconds) return { entryDate: date, startAt: null, endAt: null, durationSec: seconds };
    return "duration_required";
  };

  const save = async () => {
    if (saving || lockedForViewer) return;
    const times = buildTimes();
    if (typeof times === "string") {
      tt.notify(timeErrorMessage(times, t), "warning");
      return;
    }
    setSaving(true);
    try {
      // Renaming a linked entry renames the TASK, through the app's own task save path.
      if (entry.titleSource === "task" && taskId === entry.taskId && title.trim() && title.trim() !== entry.title.trim() && rename.can && entry.taskId) {
        deps.onRenameTask(entry.taskId, title.trim());
      }
      if (entry.titleSource === "ticket" && ticketId === entry.ticketId && title.trim() && title.trim() !== entry.title.trim() && rename.can && entry.ticketId) {
        deps.onRenameTicket(entry.ticketId, title.trim());
      }
      const patch: EntryInput = {
        ...times,
        projectId,
        taskId,
        ticketId: taskId ? null : ticketId,
        billable,
        tags: tags.split(",").map((x) => x.trim()).filter(Boolean),
      };
      if (!isLinked) patch.description = ownText.trim() || null;
      if (viewer.canTeam && person !== entry.userId) patch.userId = person;
      await updateEntry(entry.id, patch);
      tt.bump();
      close();
    } catch (e) {
      tt.notify(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    try {
      await createEntry({
        description: entry.titleSource === "entry" ? entry.title : null,
        taskId: entry.taskId,
        ticketId: entry.taskId ? null : entry.ticketId,
        projectId: entry.projectId,
        entryDate: entry.entryDate,
        durationSec: entry.durationSec ?? 0,
        billable: entry.billable,
        tags: entry.tags,
        source: "manual",
        userId: entry.userId !== userId ? entry.userId : undefined,
      });
      tt.bump();
      close();
    } catch (e) {
      tt.notify(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");
    }
  };

  // ----- cost panel (own entries, or anyone's with time_tracking_costs) -----
  const country: HolidayCountry = useMemo(() => {
    const emp = deps.employees.find((e) => e.id === entry.employeeId);
    return resolveWorkCountry(emp?.workCountry ?? null, entry.userId === userId ? tt.workCountry : tt.defaultCountry);
  }, [deps.employees, entry.employeeId, entry.userId, userId, tt.workCountry, tt.defaultCountry]);
  const showCost = "costRate" in entry;
  const monthLabel = new Date(`${entry.entryDate}T12:00:00`).toLocaleDateString(locale, { month: "short", year: "numeric" });
  const sourceName = (s: string | undefined) =>
    ({
      monthly: t("monthly salary", "mesačná mzda", "havi fizetés"),
      daily: t("daily rate", "denná sadzba", "napidíj"),
      hourly: t("hourly rate", "hodinová sadzba", "órabér"),
      contractor_hourly: t("contractor, hourly", "dodávateľ, hodinová", "vállalkozó, órabér"),
      contractor_daily: t("contractor, man-day", "dodávateľ, osobodeň", "vállalkozó, ember-nap"),
      contractor_monthly: t("contractor, retainer", "dodávateľ, paušál", "vállalkozó, havidíj"),
      none: t("no rate", "bez sadzby", "nincs díj"),
    })[s ?? "none"] ?? "";
  const billableValue = viewer.canCosts && entry.billable && entry.billableRate && entry.durationSec ? (entry.durationSec / 3600) * entry.billableRate : null;

  const person_ = deps.users.find((u) => u.id === entry.userId);
  const recordedBy = deps.users.find((u) => u.id === entry.recordedByUserId);
  const sourceText = SOURCE_LABEL[entry.source] ? t(...SOURCE_LABEL[entry.source]) : entry.source;
  const originTask = entry.originType === "task" && entry.originId ? lookups.taskById.get(entry.originId) : null;
  const isAdmin = isAdminRoleName(deps.currentUser.role);
  const lockSettings = {
    lockAfterDays: tt.settings.lockAfterDays,
    paidPayrollMonths: entry.paidPayrollMonth ? [entry.entryDate.slice(0, 7)] : [],
    isAdmin,
  };
  const reason = lockReason(entry, lockSettings, todayIso());
  const lockedForViewer = isEntryLocked(entry, lockSettings, todayIso());
  const readOnly = !viewer.canEdit || lockedForViewer;
  const reasonText = (code: LockReasonCode) =>
    code === "age"
      ? t("it is older than the lock", "je starší ako zámok", "régebbi a zárolásnál")
      : code === "paid_payroll"
        ? t("its payroll month is paid", "jeho mzdový mesiac je uhradený", "a bérhónap ki van fizetve")
        : t("the week was submitted", "týždeň bol odoslaný", "a hét be lett küldve");

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100000] flex justify-end" data-testid="entry-drawer">
      <div onClick={close} className={`absolute inset-0 bg-slate-900/40 backdrop-blur-sm ${closing ? "animate-fade-out" : "animate-fade-in"}`} />
      <div className={`relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-6 shadow-2xl ${closing ? "animate-slide-out-right" : "animate-slide-in-right"}`}>
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <span className="type-overline inline-flex items-center gap-1.5 rounded-full border border-teal-200/80 bg-teal-50 px-2.5 py-0.5 text-teal-700">
            <Clock className="size-3.5" />
            {readOnly ? t("Time entry", "Záznam času", "Időbejegyzés") : t("Edit time entry", "Upraviť záznam času", "Időbejegyzés szerkesztése")}
          </span>
          <button type="button" onClick={close} aria-label={t("Close", "Zavrieť", "Bezárás")} className="rounded-lg p-1 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600 active:scale-95 cursor-pointer">
            <X className="size-5" />
          </button>
        </div>

        {reason && (
          <p className={`mt-4 rounded-xl px-3 py-2 text-ui ${isAdmin ? "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-700"}`} data-testid="entry-locked">
            {isAdmin
              ? t(`Locked because ${reasonText(reason)}. Saving writes an audit log entry.`, `Zamknuté, pretože ${reasonText(reason)}. Uloženie zapíše záznam do auditu.`, `Zárolva, mert ${reasonText(reason)}. A mentés auditbejegyzést ír.`)
              : t(`This entry is read-only because ${reasonText(reason)}.`, `Tento záznam je len na čítanie, pretože ${reasonText(reason)}.`, `Ez a bejegyzés csak olvasható, mert ${reasonText(reason)}.`)}
          </p>
        )}

        <div className="mt-4 grid gap-4">
          {/* Title */}
          <label className="grid gap-1">
            <span className="type-label text-slate-600">{t("Title", "Názov", "Cím")}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              readOnly={readOnly || (isLinked && !rename.can)}
              title={isLinked && !rename.can ? (entry.titleSource === "ticket" ? t("Tickets are renamed in the Support Tickets module.", "Tikety sa premenúvajú v module Tikety podpory.", "A jegyeket a Támogatási jegyek modulban nevezheti át.") : t("You cannot edit this task, so you cannot rename it.", "Túto úlohu nemôžete upravovať, preto ju nemôžete premenovať.", "Ezt a feladatot nem szerkesztheti, ezért nem nevezheti át.")) : undefined}
              data-testid="entry-title"
              className={`h-10 rounded-xl border border-slate-200 px-3 text-ui outline-none focus:border-primary read-only:bg-slate-50 ${entry.titleDeleted ? "text-slate-400 italic" : ""}`}
            />
            {isLinked && hint && rename.can && <span className="type-meta text-slate-500">{hint}</span>}
            {entry.titleDeleted && <span className="type-meta text-amber-700">{t("The linked task or ticket was deleted.", "Prepojená úloha alebo tiket bol odstránený.", "A kapcsolt feladat vagy jegy törölve lett.")}</span>}
            {entry.legacyNote && <span className="type-meta text-slate-500">{entry.legacyNote}</span>}
          </label>

          {/* Project */}
          <div className="grid gap-1">
            <span className="type-label text-slate-600">{t("Project", "Projekt", "Projekt")} *</span>
            <ProjectPicker
              projects={deps.projects}
              leads={deps.leads}
              projectTypes={deps.projectTypes}
              value={projectId}
              onChange={setProjectId}
              t={t}
              recentIds={recentProjectIds}
              secondsByProject={secondsByProject}
              onCreateProject={deps.onCreateProject}
              disabled={readOnly || !deps.canPickProject}
            />
          </div>

          {/* Task link */}
          <div className="grid gap-1">
            <span className="type-label text-slate-600">{t("Task", "Úloha", "Feladat")}</span>
            {taskId ? (
              <div className="flex items-center gap-2 rounded-xl bg-teal-50 px-3 py-2 text-ui font-semibold text-teal-800" data-testid="entry-linked-task">
                <span className="min-w-0 flex-1 truncate">{linkedTask?.title ?? entry.title}</span>
                {!readOnly && (
                  <button type="button" onClick={unlink} title={t("Unlink the task: the entry keeps this title as its own", "Odpojiť úlohu: záznam si ponechá tento názov", "Feladat leválasztása: a bejegyzés megtartja ezt a címet")} data-testid="entry-unlink" className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900 cursor-pointer">
                    <Unlink className="size-4" />
                  </button>
                )}
              </div>
            ) : (
              !readOnly && (
                <div className="relative">
                  <input value={taskQuery} onChange={(e) => setTaskQuery(e.target.value)} placeholder={t("Link an open task…", "Prepojiť otvorenú úlohu…", "Nyitott feladat kapcsolása…")} data-testid="entry-task-search" className="h-10 w-full rounded-xl border border-slate-200 px-3 text-ui outline-none focus:border-primary" />
                  {suggestions.length > 0 && (
                    <div className="absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                      {suggestions.map((s) => (
                        <button key={s.id} type="button" onClick={() => requestLink(s)} data-testid="entry-task-option" className="block w-full truncate px-3 py-2 text-left text-ui font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer">
                          {s.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
            {pendingLink && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-ui text-amber-900" data-testid="entry-link-confirm">
                {t("The entry's title will be replaced by the task's title.", "Názov záznamu bude nahradený názvom úlohy.", "A bejegyzés címét a feladat címe váltja fel.")}
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => link(pendingLink)} data-testid="entry-link-confirm-ok" className="h-8 rounded-lg bg-amber-600 px-3 text-ui font-semibold text-white cursor-pointer">{t("Link task", "Prepojiť úlohu", "Feladat kapcsolása")}</button>
                  <button type="button" onClick={() => setPendingLink(null)} className="h-8 rounded-lg px-3 text-ui font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer">{t("Cancel", "Zrušiť", "Mégse")}</button>
                </div>
              </div>
            )}
          </div>

          {deps.canLinkTicket && !taskId && (
            <div className="grid gap-1">
              <span className="type-label text-slate-600">{t("Ticket", "Tiket", "Jegy")}</span>
              {ticketId ? (
                <div className="flex items-center gap-2 rounded-xl bg-teal-50 px-3 py-2 text-ui font-semibold text-teal-800" data-testid="entry-linked-ticket">
                  <span className="min-w-0 flex-1 truncate">{linkedTicket?.title || linkedTicket?.subject || entry.title}</span>
                  {!readOnly && (
                    <button type="button" onClick={unlink} data-testid="entry-unlink-ticket" className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900 cursor-pointer">
                      <Unlink className="size-4" />
                    </button>
                  )}
                </div>
              ) : (
                !readOnly && (
                  <div className="relative">
                    <input value={ticketQuery} onChange={(e) => setTicketQuery(e.target.value)} placeholder={t("Link an open ticket…", "Prepojiť otvorený tiket…", "Nyitott jegy kapcsolása…")} data-testid="entry-ticket-search" className="h-10 w-full rounded-xl border border-slate-200 px-3 text-ui outline-none focus:border-primary" />
                    {ticketSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                        {ticketSuggestions.map((s) => (
                          <button key={s.id} type="button" onClick={() => { setTicketId(s.id); setTitle(s.title || s.subject); setTicketQuery(""); if (!projectId && s.projectId) setProjectId(s.projectId); }} data-testid="entry-ticket-option" className="block w-full truncate px-3 py-2 text-left text-ui font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer">
                            {s.title || s.subject}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}

          {/* When */}
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 grid gap-1">
              <span className="type-label text-slate-600">{t("Date", "Dátum", "Dátum")}</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} readOnly={readOnly} className="h-10 rounded-xl border border-slate-200 px-3 text-ui outline-none focus:border-primary" data-testid="entry-date" />
            </label>
            <label className="grid gap-1">
              <span className="type-label text-slate-600">{t("Start", "Začiatok", "Kezdet")}</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} readOnly={readOnly} className="h-10 rounded-xl border border-slate-200 px-3 text-ui tabular-nums outline-none focus:border-primary" data-testid="entry-start" />
            </label>
            <label className="grid gap-1">
              <span className="type-label text-slate-600">{t("End", "Koniec", "Vég")}</span>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} readOnly={readOnly || entry.running} className="h-10 rounded-xl border border-slate-200 px-3 text-ui tabular-nums outline-none focus:border-primary" data-testid="entry-end" />
            </label>
            {!entry.running && (
              <label className="col-span-2 grid gap-1">
                <span className="type-label text-slate-600">{t("Duration", "Trvanie", "Időtartam")}</span>
                <input value={dur} onChange={(e) => setDur(e.target.value)} readOnly={readOnly || (!!start && !!end)} placeholder="1:30" className="h-10 rounded-xl border border-slate-200 px-3 text-ui tabular-nums outline-none focus:border-primary read-only:bg-slate-50" data-testid="entry-duration" />
                <span className="type-meta text-slate-500">{t("Start and end are optional: leave them empty to keep the entry hours-only.", "Začiatok a koniec sú voliteľné: nechajte ich prázdne pre záznam iba v hodinách.", "A kezdet és a vég nem kötelező: hagyja üresen, ha csak óraszámot rögzít.")}</span>
              </label>
            )}
          </div>

          {/* Person */}
          {viewer.canTeam && (
            <label className="grid gap-1">
              <span className="type-label text-slate-600">{t("Person", "Osoba", "Személy")}</span>
              <select value={person} onChange={(e) => setPerson(e.target.value)} disabled={readOnly} className="h-10 rounded-xl border border-slate-200 bg-white px-2 text-ui" data-testid="entry-person">
                {deps.users.filter((u) => u.id).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
          )}

          <label className="grid gap-1">
            <span className="type-label text-slate-600">{t("Tags", "Štítky", "Címkék")}</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} readOnly={readOnly} placeholder={t("comma, separated", "oddelené, čiarkou", "vesszővel, elválasztva")} className="h-10 rounded-xl border border-slate-200 px-3 text-ui outline-none focus:border-primary" />
          </label>

          <label className="flex cursor-pointer items-center gap-3">
            <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} disabled={readOnly} className="size-4 accent-emerald-600" data-testid="entry-billable" />
            <span className="text-ui font-semibold text-slate-800">{t("Billable", "Fakturovateľné", "Számlázható")}</span>
            {viewer.canCosts && entry.billableRate ? <span className="type-meta tabular-nums text-emerald-700">{money(entry.billableRate)}/h</span> : null}
          </label>

          {/* Cost */}
          {showCost && (
            <div className="rounded-2xl bg-slate-50 p-4" data-testid="entry-cost-panel">
              <div className="type-overline text-slate-500">{t("Cost", "Náklad", "Költség")}</div>
              {entry.costRate === null || entry.costRate === undefined ? (
                <div className="mt-1 text-ui font-semibold text-amber-700">{t("No rate — no employee linked", "Bez sadzby — nie je pripojený zamestnanec", "Nincs díj — nincs munkatárs hozzárendelve")}</div>
              ) : (
                <>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <span className="text-ui text-slate-600">{money(entry.costRate)}/h · {sourceName(entry.costRateSource)}</span>
                    <span className="text-title font-bold tabular-nums text-violet-700">{entry.cost !== null && entry.cost !== undefined ? money(entry.cost) : "—"}</span>
                  </div>
                  <div className="mt-1 type-meta text-slate-500" data-testid="entry-rate-basis">
                    {entry.costRateBasisDays ? `${monthLabel} · ${country} · ${entry.costRateBasisDays} ${t("working days", "pracovných dní", "munkanap")} · ` : `${monthLabel} · `}
                    {t("the rate is frozen when the entry is saved", "sadzba sa zafixuje pri uložení záznamu", "a díj a mentéskor rögzül")}
                  </div>
                </>
              )}
              {billableValue !== null && (
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-ui">
                  <span className="text-slate-600">{t("Billable value", "Fakturovateľná hodnota", "Számlázható érték")}</span>
                  <span className="font-semibold tabular-nums text-emerald-700">{money(billableValue)}</span>
                </div>
              )}
            </div>
          )}

          {/* Provenance */}
          <p className="type-meta text-slate-500" data-testid="entry-provenance">
            {t("Recorded by", "Zaznamenal", "Rögzítette")} {recordedBy?.name ?? "—"} {t("with", "cez", "ezzel:")} {sourceText}
            {entry.createdAt ? ` ${t("on", "dňa", "ekkor:")} ${new Date(entry.createdAt.replace(" ", "T")).toLocaleDateString(locale)}` : ""}
            {originTask ? `, ${t("started from task", "spustené z úlohy", "feladatból indítva:")} “${originTask.title}”` : ""}
            {person_ && entry.userId !== entry.recordedByUserId ? ` · ${t("time of", "čas používateľa", "személy:")} ${person_.name}` : ""}
          </p>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-1">
            {!readOnly && (
              <>
                <HoldToConfirmButton onConfirm={() => { onDelete(entry); close(); }} what={entry.title} lang={deps.language} icon={<Trash2 className="size-4" />} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-ui font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer" data-testid="entry-delete">
                  {t("Hold to delete", "Podržte pre odstránenie", "Tartsa a törléshez")}
                </HoldToConfirmButton>
                <button type="button" onClick={duplicate} title={t("Duplicate", "Duplikovať", "Másolás")} aria-label={t("Duplicate", "Duplikovať", "Másolás")} className="inline-flex size-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer">
                  <Copy className="size-4" />
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={close} className="h-9 rounded-xl px-3 text-ui font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer">{t("Cancel", "Zrušiť", "Mégse")}</button>
            {!readOnly && (
              <button type="button" onClick={save} disabled={saving} data-testid="entry-save" className="h-9 rounded-xl bg-primary px-4 text-ui font-semibold text-primary-foreground transition-all active:scale-95 disabled:opacity-60 cursor-pointer">
                {t("Save", "Uložiť", "Mentés")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

