import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, CheckCircle2, Clock, Copy, Trash2, Unlink, X } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";
import { CustomSelect } from "../ui/CustomSelect";
import { Switch } from "../ui/Switch";
import { MarkdownReportEditor } from "./StopReportDialog";
import { resolveWorkCountry, type HolidayCountry } from "../../utils/holidays.ts";
import { clientForTask, matchOpenTasks, matchOpenTickets } from "../../utils/timeLinks.ts";
import { isClosedTicketStatus } from "../../utils/tickets";
import { isEntryLocked, lockReason, type LockReasonCode } from "../../utils/timeLock.ts";
import { isAdminRoleName } from "../../utils/permissions.ts";
import {
  clockTime,
  formatDuration,
  importedFrom,
  isoFromLocal,
  needsLinkConfirmation,
  parseDurationInput,
  todayIso,
  type TimeEntry,
} from "../../utils/timeTracking.ts";
import { duplicateInput } from "./entryDuplicate";
import { TimeApiError, createEntry, timeErrorMessage, updateEntry, type EntryInput } from "../../utils/timeTrackingApi.ts";
import type { Task } from "../../types";
import { ProjectPicker } from "./ProjectPicker";
import { projectClientName } from "./projectClient";
import { DrawerWorkedLine } from "./WorkedLine";
import { RateExplanation } from "./RateExplanation";
import { canRenameTitle, renameHint, useMoney, useTimeLookups, type TimeDeps } from "./shared";
import { entityAccentStyle } from "../../utils/entityAccent";
import { projectColor } from "../../utils/timeTracking.ts";

interface Props {
  entry: TimeEntry;
  deps: TimeDeps;
  recentProjectIds: string[];
  secondsByProject?: Record<string, number>;
  onClose: () => void;
  onDelete: (entry: TimeEntry) => void;
  /** A blank draft (not yet on the server): Save creates the entry; no delete or duplicate. */
  isNew?: boolean;
  /** The server just refused a create with `task_required`: the Task field reads as required even if this page's settings lag. */
  taskRequired?: boolean;
}

const SOURCE_LABEL: Record<string, [string, string, string]> = {
  timer: ["timer", "časovač", "időzítő"],
  manual: ["manual entry", "ručný záznam", "kézi rögzítés"],
  day: ["daily log", "denný záznam", "napi napló"],
  calendar: ["calendar", "kalendár", "naptár"],
  timesheet: ["timesheet", "výkaz", "munkalap"],
  extension: ["Chrome extension", "rozšírenie pre Chrome", "Chrome-bővítmény"],
  activity: ["activity capture", "zachytená aktivita", "rögzített tevékenység"],
  ticket_legacy: ["old ticket time", "starý čas tiketu", "régi jegyidő"],
};

/** The right-hand drawer for one entry, opened from any list. */
export function EntryDrawer({ entry, deps, recentProjectIds, secondsByProject, onClose, onDelete, isNew = false, taskRequired = false }: Props) {
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
  const [note, setNote] = useState(entry.note ?? "");

  const linkedTask = taskId ? lookups.taskById.get(taskId) ?? null : null;
  const linkedTicket = ticketId ? deps.tickets.find((row) => row.id === ticketId) ?? null : null;
  const isLinked = !!taskId || (!!ticketId && unlinkedTitle === null);
  const ownText = isLinked ? "" : title;
  const suggestions = useMemo(() => (isLinked ? [] : matchOpenTasks(deps.tasks, taskQuery, deps.isTaskDone)), [deps.tasks, deps.isTaskDone, taskQuery, isLinked]);
  const ticketSuggestions = useMemo(
    () => (isLinked || !deps.canLinkTicket ? [] : matchOpenTickets(deps.tickets, ticketQuery, (row) => isClosedTicketStatus(row.status))),
    [deps.canLinkTicket, deps.tickets, ticketQuery, isLinked],
  );
  const locale = deps.language === "sk" ? "sk-SK" : deps.language === "hu" ? "hu-HU" : "en-GB";

  const close = () => {
    setClosing(true);
    window.setTimeout(onClose, 180);
  };

  const unlink = () => {
    // The entry's own title starts as the task's title at this moment (the server does the same).
    const current = linkedTask?.title ?? linkedTicket?.title ?? linkedTicket?.subject ?? entry.title;
    const prevProject = linkedTask?.relatedProjectId || entry.projectId;
    setTaskId(null);
    setTicketId(null);
    setProjectId(prevProject ?? null);
    setUnlinkedTitle(current);
    setTitle(current);
  };

  const link = (task: Task) => {
    setTaskId(task.id);
    setTitle(task.title);
    setTaskQuery("");
    setPendingLink(null);
    setProjectId(task.relatedProjectId || null);
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
      const linkedTask = entry.taskId ? deps.tasks.find((tk) => tk.id === entry.taskId) : undefined;
      if (entry.titleSource === "task" && taskId === entry.taskId && title.trim() && title.trim() !== entry.title.trim() && rename.can && entry.taskId && linkedTask?.externalSource !== "clickup") {
        deps.onRenameTask(entry.taskId, title.trim());
      }
      if (entry.titleSource === "ticket" && ticketId === entry.ticketId && title.trim() && title.trim() !== entry.title.trim() && rename.can && entry.ticketId) {
        deps.onRenameTicket(entry.ticketId, title.trim());
      }
      const patch: EntryInput = {
        ...times,
        ...(taskId ? {} : { projectId }),
        taskId,
        ticketId: taskId ? null : ticketId,
        billable,
        note: note.trim() || null,
        tags: tags.split(",").map((x) => x.trim()).filter(Boolean),
      };
      if (!isLinked) patch.description = ownText.trim() || null;
      if (viewer.canTeam && person !== entry.userId) patch.userId = person;
      if (isNew) {
        await createEntry({ ...patch, source: "manual", originType: taskId ? "task" : undefined, originId: taskId ?? undefined });
      } else {
        await updateEntry(entry.id, patch);
      }
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
      await createEntry(duplicateInput(entry, userId));
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
  const importTool = importedFrom(entry.source);
  const hoursOnly = !entry.running && !entry.startAt && !entry.endAt;
  const workedSec = entry.workedMs !== null && entry.workedMs !== undefined ? Math.round(entry.workedMs / 1000) : entry.durationSec;
  const workedMatchesDuration = !entry.durationSec || !workedSec || Math.abs(workedSec - entry.durationSec) < 1;
  const sourceChip = isNew ? null : importTool
    ? t("Imported", "Importované", "Importált")
    : entry.source === "timer"
      ? t("Timer", "Časovač", "Időzítő")
      : hoursOnly
        ? t("Hours only", "Iba hodiny", "Csak órák")
        : entry.source === "manual"
          ? t("Manual", "Ručne", "Kézi")
          : null;
  const chipClass = "type-meta inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 font-semibold text-gray-600";
  const originTask = entry.originType === "task" && entry.originId ? lookups.taskById.get(entry.originId) : null;
  const provenanceWhen = (() => {
    const at = entry.startAt ? new Date(entry.startAt) : entry.createdAt ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(entry.createdAt) ? entry.createdAt.replace(" ", "T") : `${entry.createdAt.replace(" ", "T")}Z`) : null;
    if (!at || Number.isNaN(at.getTime())) return "";
    const day = at.toLocaleDateString(locale, { day: "numeric", month: "short" });
    return entry.startAt ? `${day} ${clockTime(entry.startAt)}` : `${day} ${at.getFullYear()}`;
  })();
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
    <div
      style={entityAccentStyle("time-tracking") as React.CSSProperties}
      className="fixed inset-0 z-[100000] flex justify-end"
      data-testid="entry-drawer"
    >
      <div onClick={close} className={`absolute inset-0 bg-gray-900/40 ${closing ? "animate-fade-out" : "animate-fade-in"}`} />
      <div className={`relative flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-xl ${closing ? "animate-slide-out-right" : "animate-slide-in-right"}`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-6 pt-6 pb-4 shrink-0">
          <span className="type-overline inline-flex items-center gap-1.5 rounded-md border border-entity-border bg-entity-subtle px-2.5 py-0.5 text-entity-text">
            <Clock className="size-3.5" />
            {readOnly ? t("Time entry", "Záznam času", "Időbejegyzés") : isNew ? t("New time entry", "Nový záznam času", "Új időbejegyzés") : t("Edit time entry", "Upraviť záznam času", "Időbejegyzés szerkesztése")}
          </span>
          <span className="ml-2 flex min-w-0 flex-1 flex-wrap items-center gap-1.5" data-testid="entry-source-chips">
            {(entry.taskId || originTask) && <span className={chipClass}>{t("Started from task", "Spustené z úlohy", "Feladatból indítva")}</span>}
            {sourceChip && <span className={chipClass}>{sourceChip}</span>}
          </span>
          <button type="button" onClick={close} aria-label={t("Close", "Zavrieť", "Bezárás")} className="rounded-md p-1 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95 cursor-pointer">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
        {reason && (
          <p className={`mb-4 rounded-md px-3 py-2 text-ui ${isAdmin ? "bg-amber-50 text-amber-900" : "bg-gray-100 text-gray-700"}`} data-testid="entry-locked">
            {isAdmin
              ? t(`Locked because ${reasonText(reason)}. Saving writes an audit log entry.`, `Zamknuté, pretože ${reasonText(reason)}. Uloženie zapíše záznam do auditu.`, `Zárolva, mert ${reasonText(reason)}. A mentés auditbejegyzést ír.`)
              : t(`This entry is read-only because ${reasonText(reason)}.`, `Tento záznam je len na čítanie, pretože ${reasonText(reason)}.`, `Ez a bejegyzés csak olvasható, mert ${reasonText(reason)}.`)}
          </p>
        )}

        <div className="grid gap-4">
          {/* Title */}
          <label className="grid gap-1">
            <span className="type-label text-gray-600">{t("Title", "Názov", "Cím")}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              readOnly={readOnly || (isLinked && !rename.can)}
              title={isLinked && !rename.can ? (entry.titleSource === "ticket" ? t("Tickets are renamed in the Support Tickets module.", "Tikety sa premenúvajú v module Tikety podpory.", "A jegyeket a Támogatási jegyek modulban nevezheti át.") : t("You cannot edit this task, so you cannot rename it.", "Túto úlohu nemôžete upravovať, preto ju nemôžete premenovať.", "Ezt a feladatot nem szerkesztheti, ezért nem nevezheti át.")) : undefined}
              data-testid="entry-title"
              className={`h-10 rounded-md border border-gray-200 px-3 text-ui outline-none focus:border-entity read-only:bg-gray-50 ${entry.titleDeleted ? "text-gray-400 italic" : ""}`}
            />
            {isLinked && hint && rename.can && <span className="type-meta text-gray-500">{hint}</span>}
            {entry.titleDeleted && <span className="type-meta text-amber-700">{t("The linked task or ticket was deleted.", "Prepojená úloha alebo tiket bol odstránený.", "A kapcsolt feladat vagy jegy törölve lett.")}</span>}
            {entry.legacyNote && <span className="type-meta text-gray-500">{entry.legacyNote}</span>}
          </label>

          {/* Description / Work report (Markdown) */}
          <div className="grid gap-1">
            <span className="type-label text-gray-600">{t("Description / Report", "Popis / Report", "Leírás / Jelentés")}</span>
            <MarkdownReportEditor
              value={note}
              onChange={setNote}
              readOnly={readOnly}
              rows={4}
              placeholder={t("What did you work on? Supports **bold**, *italic*, `- bullets`, `code`… (optional)", "Čo ste robili? Podporuje **tučné**, *kurzívu*, `- odrážky`, `kód`… (voliteľné)", "Min dolgozott? Támogatja: **félkövér**, *dőlt*, `- felsorolás`, `kód`… (nem kötelező)")}
              testId="entry-note"
              t={t}
            />
          </div>

          {/* Task link (primary entity) */}
          <div className="grid gap-1">
            <span className="type-label text-gray-600">
              {t("Task", "Úloha", "Feladat")}
              {/* The server enforces the rule on a new entry and on a linked or running one; an old unlinked entry stays editable without a task. */}
              {!readOnly && (isNew || isLinked || entry.running) && (tt.settings.requireTask || taskRequired) ? (
                <>
                  {" *"}
                  {deps.canLinkTicket && <span className="type-meta ml-1 font-normal text-gray-500" data-testid="entry-task-or-ticket">{t("· or a ticket", "· alebo tiket", "· vagy jegy")}</span>}
                </>
              ) : (
                <span className="type-meta ml-1 font-normal text-gray-400">{t("· optional", "· voliteľné", "· nem kötelező")}</span>
              )}
            </span>
            {taskId ? (
              <div className="flex items-center gap-2 rounded-md border border-entity-border bg-entity-subtle px-3 py-2 text-ui font-semibold text-entity-text" style={entityAccentStyle("tasks") as React.CSSProperties} data-testid="entry-linked-task">
                <CheckCircle2 className="size-4 shrink-0 text-entity-text" />
                <span className="min-w-0 flex-1 truncate">{linkedTask?.title ?? entry.title}</span>
                {!readOnly && (
                  <button type="button" onClick={unlink} title={t("Unlink the task: the entry keeps this title as its own", "Odpojiť úlohu: záznam si ponechá tento názov", "Feladat leválasztása: a bejegyzés megtartja ezt a címet")} data-testid="entry-unlink" className="inline-flex items-center gap-1 text-gray-400 hover:text-gray-700 cursor-pointer">
                    <Unlink className="size-4" />
                  </button>
                )}
              </div>
            ) : (
              !readOnly && (
                <div className="relative">
                  <input value={taskQuery} onChange={(e) => setTaskQuery(e.target.value)} placeholder={t("Link an open task…", "Prepojiť otvorenú úlohu…", "Nyitott feladat kapcsolása…")} data-testid="entry-task-search" className="h-10 w-full rounded-md border border-gray-200 px-3 text-ui outline-none focus:border-entity" />
                  {suggestions.length > 0 && (
                    <div className="absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                      {suggestions.map((s) => (
                        <button key={s.id} type="button" onClick={() => requestLink(s)} data-testid="entry-task-option" className="block w-full truncate px-3 py-2 text-left text-ui font-semibold text-gray-800 hover:bg-gray-50 cursor-pointer">
                          {s.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
            {pendingLink && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-ui text-amber-900" data-testid="entry-link-confirm">
                {t("The entry's title will be replaced by the task's title.", "Názov záznamu bude nahradený názvom úlohy.", "A bejegyzés címét a feladat címe váltja fel.")}
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => link(pendingLink)} data-testid="entry-link-confirm-ok" className="h-8 rounded-md bg-amber-600 px-3 text-ui font-semibold text-white cursor-pointer">{t("Link task", "Prepojiť úlohu", "Feladat kapcsolása")}</button>
                  <button type="button" onClick={() => setPendingLink(null)} className="h-8 rounded-md px-3 text-ui font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer">{t("Cancel", "Zrušiť", "Mégse")}</button>
                </div>
              </div>
            )}
          </div>

          {/* Project & Client (derived from task when linked; editable on standalone entries) */}
          <div className="grid gap-1">
            <span className="type-label text-gray-600">{taskId ? t("Project & Client", "Projekt a klient", "Projekt és ügyfél") : t("Project", "Projekt", "Projekt")}</span>
            {taskId ? (() => {
              const effProj = linkedTask?.relatedProjectId || (taskId === entry.taskId ? entry.projectId : null) || null;
              const effClient =
                (effProj ? projectClientName(effProj, deps.projects, deps.leads) : null) ||
                (linkedTask ? clientForTask(linkedTask, deps.leads)?.name ?? null : null) ||
                (taskId === entry.taskId ? entry.clientName ?? (entry.clientId ? deps.leads.find((l) => l.id === entry.clientId)?.name ?? null : null) : null);
              return (
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-ui" data-testid="entry-derived-attribution">
                  {effProj ? (
                    <div className="flex flex-wrap items-center gap-2 font-medium text-gray-800">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: projectColor(effProj) }} />
                      <span className="truncate">{lookups.projectName(effProj, entry.projectName)}</span>
                      {effClient && <span className="truncate text-gray-500">· {effClient}</span>}
                    </div>
                  ) : effClient ? (
                    <div className="flex items-center gap-1.5 font-medium text-gray-800">
                      <Building2 className="size-3.5 shrink-0 text-gray-500" />
                      <span className="truncate">{effClient}</span>
                    </div>
                  ) : (
                    <div className="text-gray-500">
                      {t("Unsorted — attach a project or client on the task", "Nezaradené — priraďte projekt alebo klienta k úlohe", "Rendezetlen — rendeljen projektet vagy ügyfelet a feladathoz")}
                    </div>
                  )}
                </div>
              );
            })() : (
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
            )}
          </div>

          {deps.canLinkTicket && !taskId && (
            <div className="grid gap-1">
              <span className="type-label text-gray-600">{t("Ticket", "Tiket", "Jegy")}</span>
              {ticketId ? (
                <div className="flex items-center gap-2 rounded-md border border-entity-border bg-entity-subtle px-3 py-2 text-ui font-semibold text-entity-text" style={entityAccentStyle("tickets") as React.CSSProperties} data-testid="entry-linked-ticket">
                  <span className="min-w-0 flex-1 truncate">{linkedTicket?.title || linkedTicket?.subject || entry.title}</span>
                  {!readOnly && (
                    <button type="button" onClick={unlink} data-testid="entry-unlink-ticket" className="inline-flex items-center gap-1 text-entity-text hover:opacity-80 cursor-pointer">
                      <Unlink className="size-4" />
                    </button>
                  )}
                </div>
              ) : (
                !readOnly && (
                  <div className="relative">
                    <input value={ticketQuery} onChange={(e) => setTicketQuery(e.target.value)} placeholder={t("Link an open ticket…", "Prepojiť otvorený tiket…", "Nyitott jegy kapcsolása…")} data-testid="entry-ticket-search" className="h-10 w-full rounded-md border border-gray-200 px-3 text-ui outline-none focus:border-entity" />
                    {ticketSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                        {ticketSuggestions.map((s) => (
                          <button key={s.id} type="button" onClick={() => { setTicketId(s.id); setTitle(s.title || s.subject); setTicketQuery(""); if (!projectId && s.projectId) setProjectId(s.projectId); }} data-testid="entry-ticket-option" className="block w-full truncate px-3 py-2 text-left text-ui font-semibold text-gray-800 hover:bg-gray-50 cursor-pointer">
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]" data-testid="entry-when-row">
            <label className="grid min-w-0 gap-1">
              <span className="type-label text-gray-600">{t("Date", "Dátum", "Dátum")}</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} readOnly={readOnly} className="h-10 w-full min-w-0 rounded-md border border-gray-200 px-2 text-ui outline-none focus:border-entity" data-testid="entry-date" />
            </label>
            <label className="grid min-w-0 gap-1">
              <span className="type-label text-gray-600">{t("Start", "Začiatok", "Kezdet")}</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} readOnly={readOnly} className="h-10 w-full min-w-0 rounded-md border border-gray-200 px-2 text-ui tabular-nums outline-none focus:border-entity" data-testid="entry-start" />
            </label>
            <label className="grid min-w-0 gap-1">
              <span className="type-label text-gray-600">{t("End", "Koniec", "Vég")}</span>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} readOnly={readOnly || entry.running} className="h-10 w-full min-w-0 rounded-md border border-gray-200 px-2 text-ui tabular-nums outline-none focus:border-entity" data-testid="entry-end" />
            </label>
            {!entry.running && (
              <label className="grid min-w-0 gap-1">
                <span className="type-label text-gray-600">{t("Duration", "Trvanie", "Időtartam")}</span>
                <input value={dur} onChange={(e) => setDur(e.target.value)} readOnly={readOnly || (!!start && !!end)} placeholder="1:30" className="h-10 w-full min-w-0 rounded-md border border-gray-200 px-2 text-ui tabular-nums outline-none focus:border-entity read-only:bg-gray-50" data-testid="entry-duration" />
              </label>
            )}
            {!entry.running && <span className="type-meta col-span-2 text-gray-500 sm:col-span-4">{t("Start and end are optional: leave them empty to keep the entry hours-only.", "Začiatok a koniec sú voliteľné: nechajte ich prázdne pre záznam iba v hodinách.", "A kezdet és a vég nem kötelező: hagyja üresen, ha csak óraszámot rögzít.")}</span>}
          </div>

          {/* Person */}
          {viewer.canTeam && (
            <label className="grid gap-1">
              <span className="type-label text-gray-600">
                {t("Person", "Osoba", "Személy")}
                {!readOnly && <span className="type-meta ml-1 font-normal text-gray-400">{t("· whose time", "· čí je to čas", "· kié az idő")}</span>}
              </span>
              <div data-testid="entry-person">
                <CustomSelect
                  searchable
                  value={person}
                  onChange={setPerson}
                  disabled={readOnly}
                  searchPlaceholder={t("Search person…", "Hľadať osobu…", "Személy keresése…")}
                  options={deps.users.filter((u) => u.id).map((u) => ({ value: u.id as string, label: u.name }))}
                />
              </div>
            </label>
          )}

          <label className="grid gap-1">
            <span className="type-label text-gray-600">{t("Tags", "Štítky", "Címkék")}</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} readOnly={readOnly} placeholder={t("comma, separated", "oddelené, čiarkou", "vesszővel, elválasztva")} className="h-10 rounded-md border border-gray-200 px-3 text-ui outline-none focus:border-entity" />
          </label>

          <label className="flex cursor-pointer items-center gap-3">
            <Switch checked={billable} onChange={setBillable} disabled={readOnly} tone="emerald" testId="entry-billable" />
            <span className="text-ui font-semibold text-gray-800">{t("Billable", "Fakturovateľné", "Számlázható")}</span>
            {viewer.canCosts && entry.billableRate ? <span className="type-meta tabular-nums text-emerald-700">{money(entry.billableRate)}/h</span> : null}
          </label>

          {showCost && <DrawerWorkedLine entry={entry} />}

          {/* Cost */}
          {showCost && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4" data-testid="entry-cost-panel">
              <div className="type-overline text-gray-500">{t("Cost", "Náklad", "Költség")}</div>
              {entry.costRate === null || entry.costRate === undefined ? (
                <div className="mt-1 text-ui font-semibold text-amber-700">{t("No rate — no employee linked", "Bez sadzby — nie je pripojený zamestnanec", "Nincs díj — nincs munkatárs hozzárendelve")}</div>
              ) : (
                <>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <span className="text-ui text-gray-600">{money(entry.costRate)}/h · {sourceName(entry.costRateSource)}</span>
                    <span className="text-title font-bold tabular-nums text-gray-900">{entry.cost !== null && entry.cost !== undefined ? money(entry.cost) : "—"}</span>
                  </div>
                  {entry.cost !== null && entry.cost !== undefined && !!workedSec && (
                    <div className="mt-1 text-ui tabular-nums text-gray-600" data-testid="entry-cost-formula">
                      {formatDuration(workedSec)} × {money(entry.costRate)}/h {Math.abs((workedSec / 3600) * Number(entry.costRate) - Number(entry.cost)) < 0.005 ? "=" : "≈"} {money(entry.cost)}
                    </div>
                  )}
                  <RateExplanation
                    employeeId={entry.costRateSource === "monthly" || entry.costRateSource === "contractor_monthly" ? entry.employeeId : null}
                    month={entry.entryDate.slice(0, 7)}
                    monthLabel={monthLabel}
                    country={country}
                    t={t}
                    money={money}
                    fallback={
                      <>
                        {entry.costRateBasisDays ? `${monthLabel} · ${country} · ${entry.costRateBasisDays} ${t("working days", "pracovných dní", "munkanap")} · ` : `${monthLabel} · `}
                        {t("the rate stays provisional until the month's payroll is closed, then it is frozen", "sadzba ostáva predbežná, kým sa neuzavrie výplata mesiaca, potom sa zafixuje", "a díj ideiglenes, amíg a hónap bérszámfejtése le nem zárul, utána rögzül")}
                      </>
                    }
                  />
                </>
              )}
              {billableValue !== null && (
                <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-ui">
                  <span className="text-gray-600">{t("Billable value", "Fakturovateľná hodnota", "Számlázható érték")}</span>
                  <span className="font-semibold tabular-nums text-emerald-700">{money(billableValue)}</span>
                </div>
              )}
              {billableValue !== null && entry.cost !== null && entry.cost !== undefined && workedMatchesDuration && (
                <div className="mt-1 flex justify-between text-ui" data-testid="entry-margin">
                  <span className="text-gray-600">{t("Margin", "Marža", "Árrés")}</span>
                  <span className="font-semibold tabular-nums text-gray-900">{money(billableValue - entry.cost)}</span>
                </div>
              )}
            </div>
          )}

          {/* Provenance */}
          <p className="type-meta text-gray-500" data-testid="entry-provenance">
            {importTool
              ? `${t(`Imported from ${importTool} by`, `Z ${importTool} importoval`, `${importTool}-importot végezte:`)} ${recordedBy?.name ?? "—"}`
              : `${t("Recorded by", "Zaznamenal", "Rögzítette")} ${recordedBy?.name ?? "—"} ${t("with", "cez", "ezzel:")} ${sourceText}`}
            {provenanceWhen ? ` ${t("on", "dňa", "ekkor:")} ${provenanceWhen}` : ""}
            {originTask ? `, ${t("started from task", "spustené z úlohy", "feladatból indítva:")} “${originTask.title}”` : ""}
            {person_ && entry.userId !== entry.recordedByUserId ? ` · ${t("time of", "čas používateľa", "személy:")} ${person_.name}` : ""}
          </p>
        </div>
        </div>

        <div className="shrink-0 flex items-center justify-between gap-2 border-t border-gray-200 bg-gray-50/90 px-6 py-4">
          <div className="flex items-center gap-1">
            {!readOnly && !isNew && (
              <>
                <HoldToConfirmButton onConfirm={() => { onDelete(entry); close(); }} what={entry.title} lang={deps.language} icon={<Trash2 className="size-4" />} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-ui font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer" data-testid="entry-delete">
                  {t("Hold to delete", "Podržte pre odstránenie", "Tartsa a törléshez")}
                </HoldToConfirmButton>
                <button type="button" onClick={duplicate} title={t("Duplicate", "Duplikovať", "Másolás")} aria-label={t("Duplicate", "Duplikovať", "Másolás")} className="inline-flex size-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 cursor-pointer">
                  <Copy className="size-4" />
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={close} className="h-9 rounded-md px-3 text-ui font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer">{t("Cancel", "Zrušiť", "Mégse")}</button>
            {!readOnly && (
              <button type="button" onClick={save} disabled={saving} data-testid="entry-save" className="h-9 rounded-md bg-entity-solid hover:bg-entity-solid-hover px-4 text-ui font-semibold text-white transition-all active:scale-95 disabled:opacity-60 cursor-pointer">
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

