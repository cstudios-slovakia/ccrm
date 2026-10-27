import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, GripVertical, Play } from "lucide-react";
import { Surface, Toolbar } from "../layout";
import { CustomSelect } from "../ui/CustomSelect";
import { useTimeEntries } from "../../hooks/useTimeEntries";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { holidayName } from "../../utils/holidays.ts";
import { isAdminRoleName } from "../../utils/permissions";
import {
  DEFAULT_ZOOM,
  MINUTES_PER_DAY,
  VISIBLE_START_MIN,
  calendarDayLocked,
  countryForScope,
  createSpan,
  defaultClickSpan,
  dragAllowed,
  entryDurationSec,
  formatMinute,
  instantFromLocal,
  instantsForSpan,
  isUntimed,
  layoutDay,
  minuteFromFraction,
  moveRunningStart,
  moveSpan,
  nowPosition,
  plusDays,
  queryRange,
  resizeAllowed,
  resizeBySteps,
  resizeSpan,
  shiftAnchor,
  spanForDrop,
  spanFromEntry,
  spanFromUntimedDrop,
  visibleDays,
  visibleScrollFraction,
  type CalendarZoom,
  type DayLayoutBlock,
  type MinuteSpan,
} from "../../utils/timeCalendar.ts";
import { isEntryLocked, lockReason, paidMonthsForOwner } from "../../utils/timeLock";
import { formatDuration, localIsoDate, projectColor, todayIso, type TimeEntry } from "../../utils/timeTracking.ts";
import { TimeApiError, createEntry, timeErrorMessage, updateEntry, type EntryInput } from "../../utils/timeTrackingApi.ts";
import { ProjectPicker } from "./ProjectPicker";
import { scopeParam } from "./TimeListView";
import { describeTimeLock, useEntryDeletion, useTimeLookups, type TimeDeps } from "./shared";
import { typePx } from "../../utils/viewSize";

interface Props {
  deps: TimeDeps;
  scope: string;
  recentProjectIds: string[];
  secondsByProject?: Record<string, number>;
  onOpen: (entry: TimeEntry) => void;
}

type Ghost =
  | { kind: "draft"; day: string; span: MinuteSpan }
  | { kind: "entry"; id: string; day: string; span: MinuteSpan };

type PopoverState =
  | { kind: "entry"; id: string; top: number; left: number }
  | { kind: "draft"; day: string; span: MinuteSpan; top: number; left: number; taskId?: string; projectId?: string | null };

type Drag = {
  kind: "create" | "move" | "resize" | "month-resize" | "open";
  id?: string;
  day: string;
  anchorMin: number;
  startMin: number;
  endMin: number;
  originX: number;
  originY: number;
  height: number;
  stepPx: number;
  running: boolean;
  moved: boolean;
  preview?: MinuteSpan;
  previewDay?: string;
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** Calendar tab: day, week (the default) and month, with an untimed lane and a task rail. */
export function TimeCalendarView({ deps, scope, recentProjectIds, secondsByProject, onOpen }: Props) {
  const tt = useTimeTracking();
  const { t, nowMs, settings } = tt;
  const lookups = useTimeLookups(deps);
  const remove = useEntryDeletion();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [zoom, setZoom] = useState<CalendarZoom>(DEFAULT_ZOOM);
  const [anchor, setAnchor] = useState(() => todayIso());
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);

  const days = useMemo(() => visibleDays(zoom, anchor), [zoom, anchor]);
  const range = queryRange(zoom, anchor);
  const scopeUserId = scope !== "me" && scope !== "all" ? scope : undefined;
  const { entries: loaded } = useTimeEntries({ from: range.from, to: range.to, userId: scopeParam(scope) });
  const entries = useMemo(() => {
    const running = tt.running;
    if (!running) return loaded;
    if (scopeUserId && running.userId !== scopeUserId) return loaded;
    if (loaded.some((e) => e.id === running.id)) return loaded.map((e) => (e.id === running.id ? running : e));
    if (running.entryDate >= range.from && running.entryDate <= range.to) return [running, ...loaded];
    return loaded;
  }, [loaded, tt.running, scopeUserId, range.from, range.to]);
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  const people = useMemo(
    () => deps.employees.filter((e) => e.userId).map((e) => ({ userId: e.userId as string, workCountry: e.workCountry ?? null })),
    [deps.employees],
  );
  const country = countryForScope(scope, tt.userId, tt.workCountry, tt.defaultCountry, people);
  const calendar = tt.calendarFor(country);
  useEffect(() => {
    tt.ensureHolidayYears(country, [...new Set(days.map((d) => Number(d.slice(0, 4))))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, country, tt.enabled]);

  const locale = deps.language === "sk" ? "sk-SK" : deps.language === "hu" ? "hu-HU" : "en-US";
  const today = todayIso(new Date(nowMs));
  const now = nowPosition(nowMs);
  const isAdmin = isAdminRoleName(deps.currentUser.role);
  const createUserId = scopeUserId ?? tt.userId ?? null;
  const stampedByUser = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const entry of entries) {
      if (!entry.paidPayrollMonth || !entry.userId) continue;
      const month = entry.entryDate.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) continue;
      const list = map.get(entry.userId);
      if (list) {
        if (!list.includes(month)) list.push(month);
      } else {
        map.set(entry.userId, [month]);
      }
    }
    return map;
  }, [entries]);
  const lockFor = (userId: string | null | undefined, employeeId?: string | null) => ({
    lockAfterDays: settings.lockAfterDays,
    isAdmin,
    paidPayrollMonths: paidMonthsForOwner(
      deps.salaries,
      deps.employees,
      { userId: userId ?? null, employeeId: employeeId ?? null },
      userId ? stampedByUser.get(userId) : undefined,
    ),
  });
  const locked = (entry: Pick<TimeEntry, "entryDate" | "approvalStatus" | "running" | "userId" | "employeeId">) =>
    isEntryLocked(
      { entryDate: entry.entryDate, approvalStatus: entry.approvalStatus, running: entry.running },
      lockFor(entry.userId, entry.employeeId),
      today,
    );
  const dayIsLocked = (day: string, userId: string | null | undefined) => calendarDayLocked(day, lockFor(userId), today);
  const lockNotice = (
    subject: { entryDate: string; approvalStatus?: string | null; running?: boolean },
    userId: string | null | undefined,
    employeeId?: string | null,
  ) => {
    const code = lockReason(subject, lockFor(userId, employeeId), today);
    return code
      ? describeTimeLock(code, t)
      : t("This entry is locked.", "Tento záznam je uzamknutý.", "Ez a bejegyzés zárolt.");
  };
  const mayChange = (entry: TimeEntry) =>
    dragAllowed(locked(entry)) && (entry.userId === tt.userId ? tt.viewer.canEdit : tt.viewer.canTeam);
  const mayCreate = scope !== "all" && (scopeUserId ? tt.viewer.canTeam : tt.viewer.canEdit);
  const pickPerson = t("Pick one person to log time.", "Vyberte jednu osobu, ktorej čas zapisujete.", "Válasszon egy személyt az idő rögzítéséhez.");
  const refuseCreate = (day: string): boolean => {
    if (!mayCreate) {
      tt.notify(pickPerson, "warning");
      return true;
    }
    if (dayIsLocked(day, createUserId)) {
      tt.notify(lockNotice({ entryDate: day, approvalStatus: null, running: false }, createUserId), "warning");
      return true;
    }
    return false;
  };

  const holidayLabel = (day: string): string | null => {
    const holiday = calendar.holiday(day);
    if (holiday) return holidayName(holiday, country, deps.language);
    const extra = calendar.override(day);
    return extra?.kind === "extraDayOff" ? extra.name : null;
  };

  const place = (e: { clientX: number; clientY: number }) => {
    const root = rootRef.current?.getBoundingClientRect();
    if (!root) return { top: 8, left: 8 };
    return {
      top: Math.max(8, e.clientY - root.top + 8),
      left: Math.max(8, Math.min(e.clientX - root.left, Math.max(8, root.width - 288))),
    };
  };

  const fail = (e: unknown) => tt.notify(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");

  const saveCreate = async (day: string, span: MinuteSpan, extra?: { taskId?: string; projectId?: string | null }) => {
    if (refuseCreate(day)) return;
    const timing = instantsForSpan(day, span);
    const task = extra?.taskId ? deps.tasks.find((item) => item.id === extra.taskId) : undefined;
    const projectId = extra?.projectId !== undefined ? extra.projectId : task ? lookups.resolveTaskProject(task).projectId : null;
    try {
      const created = await createEntry({
        ...timing,
        userId: scopeUserId,
        projectId,
        taskId: extra?.taskId ?? null,
        description: null,
        billable: settings.billableByDefault,
        source: "calendar",
        originType: extra?.taskId ? "task" : "calendar",
        originId: extra?.taskId ?? null,
      });
      tt.bump();
      const pos = { top: 48, left: 48 };
      setPopover({ kind: "entry", id: created.id, ...pos });
    } catch (e) {
      fail(e);
    }
  };

  const saveSpan = async (id: string, day: string, span: MinuteSpan) => {
    const entry = byId.get(id);
    if (!entry) return;
    const movedIntoLock = day !== entry.entryDate && dayIsLocked(day, entry.userId);
    if (!mayChange(entry) || movedIntoLock) {
      const subject = locked(entry) ? entry : { entryDate: day, approvalStatus: null, running: false };
      tt.notify(
        locked(entry) || movedIntoLock
          ? lockNotice(subject, entry.userId, entry.employeeId)
          : t("You cannot edit this entry.", "Tento záznam nemôžete upraviť.", "Ezt a bejegyzést nem szerkesztheti."),
        "warning",
      );
      return;
    }
    try {
      if (entry.running) {
        const start = instantFromLocal(day, span.startMin);
        if (start.getTime() > nowMs) {
          tt.notify(t("A running timer cannot start in the future.", "Bežiaci časovač nemôže začať v budúcnosti.", "A futó időzítő nem kezdődhet a jövőben."), "warning");
          return;
        }
        await updateEntry(entry.id, { entryDate: localIsoDate(start), startAt: start.toISOString() });
      } else {
        await updateEntry(entry.id, instantsForSpan(day, span));
      }
      tt.bump();
    } catch (e) {
      fail(e);
    }
  };

  const api = useRef({ saveCreate, saveSpan, entries, nowMs });
  api.current = { saveCreate, saveSpan, entries, nowMs };

  useEffect(() => {
    const hourColumn = (day: string) =>
      rootRef.current?.querySelector(`[data-cal-grid="hour"][data-cal-day="${day}"]`) as HTMLElement | null;
    const minuteAt = (day: string, clientY: number) => {
      const rect = hourColumn(day)?.getBoundingClientRect();
      if (!rect || rect.height <= 0) return 0;
      return minuteFromFraction((clientY - rect.top) / rect.height);
    };
    const dayUnder = (x: number, y: number) => {
      const node = document.elementFromPoint(x, y);
      return node?.closest("[data-cal-grid='hour']")?.getAttribute("data-cal-day") ?? null;
    };
    const onMove = (e: PointerEvent) => {
      const current = drag.current;
      if (!current || current.kind === "open") return;
      if (!current.moved && Math.hypot(e.clientX - current.originX, e.clientY - current.originY) < 4) return;
      current.moved = true;
      if (current.kind === "create") {
        const span = createSpan(current.anchorMin, minuteAt(current.day, e.clientY));
        current.preview = span;
        current.previewDay = current.day;
        setGhost({ kind: "draft", day: current.day, span });
        return;
      }
      if (current.kind === "month-resize") {
        const steps = Math.round((e.clientY - current.originY) / Math.max(8, current.stepPx));
        const span = resizeBySteps({ startMin: current.startMin, endMin: current.endMin }, steps);
        current.preview = span;
        current.previewDay = current.day;
        setGhost({ kind: "entry", id: current.id!, day: current.day, span });
        return;
      }
      const delta = ((e.clientY - current.originY) / Math.max(1, current.height)) * MINUTES_PER_DAY;
      if (current.kind === "resize") {
        const span = resizeSpan({ startMin: current.startMin, endMin: current.endMin }, minuteAt(current.day, e.clientY));
        current.preview = span;
        current.previewDay = current.day;
        setGhost({ kind: "entry", id: current.id!, day: current.day, span });
        return;
      }
      const day = current.running ? current.day : dayUnder(e.clientX, e.clientY) ?? current.day;
      const span = current.running
        ? { startMin: moveRunningStart(current.startMin, current.endMin, delta), endMin: current.endMin }
        : moveSpan({ startMin: current.startMin, endMin: current.endMin }, delta);
      current.preview = span;
      current.previewDay = day;
      setGhost({ kind: "entry", id: current.id!, day, span });
    };
    const onUp = (e: PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      drag.current = null;
      setGhost(null);
      const pos = (() => {
        const root = rootRef.current?.getBoundingClientRect();
        if (!root) return { top: 8, left: 8 };
        return { top: Math.max(8, e.clientY - root.top + 8), left: Math.max(8, Math.min(e.clientX - root.left, Math.max(8, root.width - 288))) };
      })();
      if (current.kind === "create" && !current.moved) {
        setPopover({ kind: "draft", day: current.day, span: defaultClickSpan(current.anchorMin), ...pos });
        return;
      }
      if (current.kind === "create" && current.preview) {
        void api.current.saveCreate(current.day, current.preview);
        return;
      }
      if (!current.moved || current.kind === "open") {
        if (current.id) setPopover({ kind: "entry", id: current.id, ...pos });
        return;
      }
      if (current.id && current.preview) void api.current.saveSpan(current.id, current.previewDay ?? current.day, current.preview);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || zoom === "month") return;
    el.scrollTop = visibleScrollFraction() * el.scrollHeight;
  }, [zoom, anchor]);

  useEffect(() => {
    if (!popover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopover(null);
    };
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-cal-popover]")) setPopover(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [popover]);

  const begin = (next: Drag) => {
    drag.current = next;
  };

  const onColumnDown = (e: PointerEvent<HTMLElement>, day: string) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-cal-block], [data-resize]")) return;
    if (refuseCreate(day)) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    begin({
      kind: "create",
      day,
      anchorMin: minuteFromFraction((e.clientY - rect.top) / rect.height),
      startMin: 0,
      endMin: 0,
      originX: e.clientX,
      originY: e.clientY,
      height: rect.height,
      stepPx: 16,
      running: false,
      moved: false,
    });
  };

  const onBlockDown = (e: PointerEvent<HTMLElement>, entry: TimeEntry, day: string) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-resize]")) return;
    e.stopPropagation();
    const span = spanFromEntry(entry, nowMs) ?? { startMin: VISIBLE_START_MIN, endMin: VISIBLE_START_MIN + 60 };
    const height = (e.currentTarget.parentElement?.getBoundingClientRect().height ?? 1);
    if (!mayChange(entry)) {
      begin({ kind: "open", id: entry.id, day, anchorMin: span.startMin, startMin: span.startMin, endMin: span.endMin, originX: e.clientX, originY: e.clientY, height, stepPx: 16, running: entry.running, moved: false });
      if (locked(entry)) tt.notify(lockNotice(entry, entry.userId, entry.employeeId), "warning");
      return;
    }
    begin({ kind: "move", id: entry.id, day, anchorMin: span.startMin, startMin: span.startMin, endMin: span.endMin, originX: e.clientX, originY: e.clientY, height, stepPx: 16, running: entry.running, moved: false });
  };

  const onResizeDown = (e: PointerEvent<HTMLElement>, entry: TimeEntry, day: string, month = false) => {
    e.stopPropagation();
    e.preventDefault();
    if (!resizeAllowed(locked(entry), entry.running)) {
      if (locked(entry)) tt.notify(lockNotice(entry, entry.userId, entry.employeeId), "warning");
      return;
    }
    const span = spanFromEntry(entry, nowMs);
    if (!span) return;
    const height = ((e.currentTarget as HTMLElement).closest("[data-cal-grid='hour']") as HTMLElement | null)?.getBoundingClientRect().height ?? 1;
    begin({
      kind: month ? "month-resize" : "resize",
      id: entry.id,
      day,
      anchorMin: span.startMin,
      startMin: span.startMin,
      endMin: span.endMin,
      originX: e.clientX,
      originY: e.clientY,
      height,
      stepPx: typePx("ui") || 16,
      running: false,
      moved: false,
    });
  };

  const onDrop = async (e: DragEvent<HTMLElement>, day: string, grid: "hour" | "month") => {
    e.preventDefault();
    const plain = e.dataTransfer.getData("text/plain");
    const taskId = e.dataTransfer.getData("application/x-ccrm-task") || (plain.startsWith("task:") ? plain.slice(5) : "");
    const entryId = e.dataTransfer.getData("application/x-ccrm-entry") || (plain.startsWith("entry:") ? plain.slice(6) : "");
    if (taskId) {
      const task = deps.tasks.find((item) => item.id === taskId);
      if (!task) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const span = grid === "hour" ? spanForDrop(minuteFromFraction((e.clientY - rect.top) / Math.max(1, rect.height))) : defaultClickSpan(9 * 60);
      await saveCreate(day, span, { taskId: task.id, projectId: lookups.resolveTaskProject(task).projectId });
      return;
    }
    const entry = entryId ? byId.get(entryId) : undefined;
    if (!entry) return;
    const movedIntoLock = day !== entry.entryDate && dayIsLocked(day, entry.userId);
    if (!mayChange(entry) || movedIntoLock) {
      tt.notify(
        locked(entry) || movedIntoLock
          ? lockNotice(locked(entry) ? entry : { entryDate: day, approvalStatus: null, running: false }, entry.userId, entry.employeeId)
          : pickPerson,
        "warning",
      );
      return;
    }
    try {
      if (isUntimed(entry) && grid === "month") {
        await updateEntry(entry.id, { entryDate: day });
      } else if (isUntimed(entry)) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const span = spanFromUntimedDrop(minuteFromFraction((e.clientY - rect.top) / Math.max(1, rect.height)), entry.durationSec ?? 3600);
        await updateEntry(entry.id, instantsForSpan(day, span));
      } else if (grid === "month") {
        const span = spanFromEntry(entry, nowMs);
        await updateEntry(entry.id, span ? instantsForSpan(day, span) : { entryDate: day });
      }
      tt.bump();
    } catch (err) {
      fail(err);
    }
  };

  const allowDrop = (e: DragEvent<HTMLElement>) => {
    const types = [...e.dataTransfer.types];
    if (types.includes("application/x-ccrm-task") || types.includes("application/x-ccrm-entry") || types.includes("text/plain")) {
      e.preventDefault();
    }
  };

  const timedOn = (day: string): DayLayoutBlock[] => {
    const base = layoutDay(entries, day, nowMs).timed;
    if (!ghost || ghost.kind !== "entry") return base;
    const rest = base.filter((block) => block.id !== ghost.id);
    if (ghost.day !== day) return rest;
    const existing = base.find((block) => block.id === ghost.id);
    return [
      ...rest,
      {
        id: ghost.id,
        startMin: ghost.span.startMin,
        endMin: ghost.span.endMin,
        durationSec: existing?.durationSec ?? 0,
        plus: plusDays(ghost.span.endMin),
        column: existing ? existing.column : 0,
        columns: existing ? existing.columns : 1,
      },
    ];
  };

  const box = (span: MinuteSpan, column = 0, columns = 1): CSSProperties => {
    const start = Math.min(Math.max(span.startMin, 0), MINUTES_PER_DAY - 12);
    const end = Math.min(Math.max(span.endMin, start + 12), MINUTES_PER_DAY);
    return {
      top: `${(start / MINUTES_PER_DAY) * 100}%`,
      height: `${((end - start) / MINUTES_PER_DAY) * 100}%`,
      left: `${(column / columns) * 100}%`,
      width: `${100 / columns}%`,
    };
  };

  const myTasks = deps.tasks
    .filter((task) => {
      if (task.archived || deps.isTaskDone(task)) return false;
      const names = [task.owner, ...(task.assignedUsers ?? [])].filter(Boolean);
      return names.includes(deps.currentUser.name);
    })
    .sort((a, b) => (a.deadline || "").localeCompare(b.deadline || "") || a.title.localeCompare(b.title));

  const columns = `3.5rem repeat(${zoom === "day" ? 1 : 7}, minmax(0, 1fr))`;
  const hourDays = zoom === "month" ? [] : days;
  const anyHoliday = hourDays.some((day) => holidayLabel(day));
  const monthDays = zoom === "month" ? days : [];
  const monthLabel = new Date(`${anchor.slice(0, 7)}-01T12:00:00`).toLocaleDateString(locale, { month: "long", year: "numeric" });
  const rangeLabel = zoom === "month"
    ? monthLabel
    : zoom === "day"
      ? new Date(`${anchor}T12:00:00`).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })
      : `${new Date(`${days[0]}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" })} – ${new Date(`${days[6]}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" })}`;

  const openEntry = byId.get(popover?.kind === "entry" ? popover.id : "");

  return (
    <div className="flex flex-col gap-3 ws-lg:flex-row" data-testid="time-calendar">
      <div ref={rootRef} className="relative min-w-0 flex-1">
        <Toolbar
          filters={
            <div className="flex flex-wrap items-center gap-1">
              <button type="button" onClick={() => setAnchor(shiftAnchor(zoom, anchor, -1))} aria-label={t("Earlier", "Skôr", "Korábbi")} className="inline-flex size-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer">
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" onClick={() => setAnchor(todayIso())} className="inline-flex h-9 items-center rounded-xl px-3 text-ui font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
                {t("Today", "Dnes", "Ma")}
              </button>
              <button type="button" onClick={() => setAnchor(shiftAnchor(zoom, anchor, 1))} aria-label={t("Later", "Neskôr", "Későbbi")} className="inline-flex size-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer">
                <ChevronRight className="size-4" />
              </button>
              <span className="px-2 text-ui font-semibold capitalize text-slate-800">{rangeLabel}</span>
            </div>
          }
          trailing={
            <div data-testid="calendar-zoom">
              <CustomSelect
                value={zoom}
                onChange={(value) => setZoom(value as CalendarZoom)}
                options={[
                  { value: "day", label: t("Day", "Deň", "Nap") },
                  { value: "week", label: t("Week", "Týždeň", "Hét") },
                  { value: "month", label: t("Month", "Mesiac", "Hónap") },
                ]}
                size="sm"
                fitLabel
              />
            </div>
          }
        />

        {zoom !== "month" ? (
          <Surface padding="none" className="mt-3 overflow-hidden">
            <div className="grid" style={{ gridTemplateColumns: columns }}>
              <div />
              {hourDays.map((day) => {
                const dt = new Date(`${day}T12:00:00`);
                const off = calendar.isOffDay(day) && !holidayLabel(day);
                return (
                  <div key={day} className={`border-l border-slate-100 px-1 py-2 text-center ${day === today ? "bg-teal-600 text-white" : off ? "text-slate-400" : "text-slate-700"}`}>
                    <div className="type-overline">{dt.toLocaleDateString(locale, { weekday: "short" })}</div>
                    <div className="text-ui font-bold tabular-nums">{dt.getDate()}</div>
                  </div>
                );
              })}
              {anyHoliday && (
                <>
                  <div className="type-meta px-1 py-1 text-slate-400">{t("All day", "Celý deň", "Egész nap")}</div>
                  {hourDays.map((day) => {
                    const name = holidayLabel(day);
                    return (
                      <div key={`h-${day}`} data-testid="calendar-holiday" data-holiday={name ? "1" : "0"} className={`truncate border-l border-t border-slate-100 px-1 py-1 text-micro font-semibold ${name ? "bg-slate-100 text-slate-600" : ""}`}>
                        {name}
                      </div>
                    );
                  })}
                </>
              )}
              <div className="bg-amber-50 px-1 py-1 type-meta font-semibold text-amber-700">{t("Untimed", "Bez času", "Idő nélkül")}</div>
              {hourDays.map((day) => (
                <div key={`u-${day}`} data-testid="calendar-untimed" className="flex max-h-24 flex-col gap-1 overflow-y-auto border-l border-t border-amber-100 bg-amber-50/70 p-1">
                  {layoutDay(entries, day, nowMs).untimed
                    .filter((item) => !(ghost?.kind === "entry" && ghost.id === item.id))
                    .map((item) => {
                      const entry = byId.get(item.id);
                      if (!entry) return null;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          draggable={mayChange(entry)}
                          data-cal-block
                          onDragStart={(e) => {
                            e.dataTransfer.setData("application/x-ccrm-entry", entry.id);
                            e.dataTransfer.setData("text/plain", `entry:${entry.id}`);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onClick={() => setPopover({ kind: "entry", id: entry.id, top: 72, left: 24 })}
                          className="truncate rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-left text-micro font-semibold text-amber-800 cursor-grab"
                        >
                          <span className="tabular-nums">{formatDuration(item.durationSec)}</span> {entry.title || t("Untitled", "Bez názvu", "Névtelen")}
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>
            <div ref={scrollerRef} className="max-h-[36rem] overflow-y-auto">
              <div className="relative">
                <div className="grid select-none" style={{ gridTemplateColumns: columns }}>
                  <div>
                    {HOURS.map((hour) => (
                      <div key={hour} className="flex h-12 items-start justify-end border-t border-slate-100 pr-1 text-micro tabular-nums text-slate-400">
                        {String(hour).padStart(2, "0")}:00
                      </div>
                    ))}
                  </div>
                  {hourDays.map((day) => (
                    <div
                      key={day}
                      data-cal-day={day}
                      data-cal-grid="hour"
                      onPointerDown={(e) => onColumnDown(e, day)}
                      onDragOver={allowDrop}
                      onDrop={(e) => void onDrop(e, day, "hour")}
                      className={`relative border-l border-slate-100 ${holidayLabel(day) ? "bg-slate-50" : ""}`}
                    >
                      {HOURS.map((hour) => (
                        <div key={hour} className="h-12 border-t border-slate-100" />
                      ))}
                      {timedOn(day).map((block) => {
                        const entry = byId.get(block.id);
                        if (!entry) return null;
                        const color = projectColor(entry.projectId);
                        return (
                          <div
                            key={block.id}
                            data-cal-block
                            data-testid="calendar-block"
                            data-entry-id={entry.id}
                            onPointerDown={(e) => onBlockDown(e, entry, day)}
                            className={`absolute z-10 overflow-hidden rounded-md border-l-4 px-1 py-0.5 ${entry.running ? "border-rose-600 bg-rose-50" : ""} ${entry.titleDeleted ? "text-slate-400" : "text-slate-800"}`}
                            style={entry.running ? box({ startMin: block.startMin, endMin: block.endMin }, block.column, block.columns) : { ...box({ startMin: block.startMin, endMin: block.endMin }, block.column, block.columns), borderLeftColor: color, backgroundColor: `${color}22` }}
                          >
                            <div className="truncate text-micro font-semibold">{entry.title || t("Untitled", "Bez názvu", "Névtelen")}</div>
                            <div className="text-micro tabular-nums text-slate-600">
                              {formatMinute(block.startMin)}–{formatMinute(block.endMin)}
                              {block.plus > 0 ? ` +${block.plus}` : ""}
                              {entry.billable && <span className="ml-1 inline-block size-1.5 rounded-full bg-emerald-500" />}
                            </div>
                            <div data-resize className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize" onPointerDown={(e) => onResizeDown(e, entry, day)} />
                          </div>
                        );
                      })}
                      {ghost?.kind === "draft" && ghost.day === day && (
                        <div className="pointer-events-none absolute z-10 rounded-md border border-teal-600 bg-teal-600/15" style={box(ghost.span)} />
                      )}
                    </div>
                  ))}
                </div>
                {hourDays.includes(now.day) && (
                  <div className="pointer-events-none absolute right-0 z-20 border-t-2 border-rose-600" style={{ top: `${(now.minute / MINUTES_PER_DAY) * 100}%`, left: "3.5rem" }} data-testid="calendar-now">
                    <span className="absolute -top-2.5 left-0 rounded bg-rose-600 px-1 text-micro font-semibold text-white">{t("Now", "Teraz", "Most")}</span>
                  </div>
                )}
              </div>
            </div>
          </Surface>
        ) : (
          <Surface padding="none" className="mt-3 overflow-hidden">
            <div className="grid grid-cols-7">
              {monthDays.slice(0, 7).map((day) => (
                <div key={day} className="px-1 py-2 text-center type-overline text-slate-500">
                  {new Date(`${day}T12:00:00`).toLocaleDateString(locale, { weekday: "short" })}
                </div>
              ))}
              {monthDays.map((day) => {
                const name = holidayLabel(day);
                const inMonth = day.slice(0, 7) === anchor.slice(0, 7);
                const layout = layoutDay(entries, day, nowMs);
                return (
                  <div
                    key={day}
                    data-cal-day={day}
                    data-cal-grid="month"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("[data-cal-block]")) return;
                      if (refuseCreate(day)) return;
                      setPopover({ kind: "draft", day, span: defaultClickSpan(9 * 60), ...place(e) });
                    }}
                    onDragOver={allowDrop}
                    onDrop={(e) => void onDrop(e, day, "month")}
                    className={`min-h-28 border-t border-l border-slate-100 p-1 ${name ? "bg-slate-100" : ""} ${inMonth ? "" : "bg-slate-50 text-slate-400"}`}
                  >
                    <div className={`mb-1 text-ui font-semibold tabular-nums ${day === today ? "inline-flex size-6 items-center justify-center rounded-full bg-teal-600 text-white" : ""}`}>{Number(day.slice(8))}</div>
                    {name && <div className="truncate text-micro font-semibold text-slate-500" data-testid="calendar-holiday">{name}</div>}
                    {layout.untimed.map((item) => {
                      const entry = byId.get(item.id);
                      if (!entry) return null;
                      return (
                        <button key={item.id} type="button" data-cal-block draggable={mayChange(entry)} onDragStart={(e) => { e.dataTransfer.setData("application/x-ccrm-entry", entry.id); e.dataTransfer.setData("text/plain", `entry:${entry.id}`); }} onClick={() => setPopover({ kind: "entry", id: entry.id, top: 80, left: 24 })} className="mb-0.5 block w-full truncate rounded-md border border-amber-200 bg-amber-50 px-1 text-left text-micro font-semibold text-amber-800">
                          {formatDuration(item.durationSec)} {entry.title}
                        </button>
                      );
                    })}
                      {layout.timed.map((block) => {
                      const entry = byId.get(block.id);
                      if (!entry) return null;
                      const shown = ghost?.kind === "entry" && ghost.id === entry.id ? ghost.span : block;
                      const plus = plusDays(shown.endMin);
                      return (
                        <div key={block.id} data-cal-block data-testid="calendar-block" draggable={mayChange(entry)} onDragStart={(e) => { if (!mayChange(entry)) { e.preventDefault(); return; } e.dataTransfer.setData("application/x-ccrm-entry", entry.id); e.dataTransfer.setData("text/plain", `entry:${entry.id}`); }} onClick={() => setPopover({ kind: "entry", id: entry.id, top: 80, left: 24 })} className={`relative mb-0.5 truncate rounded-md border-l-4 px-1 text-micro font-semibold ${entry.running ? "border-rose-600 bg-rose-50 text-rose-700" : "border-transparent"}`} style={entry.running ? undefined : { backgroundColor: `${projectColor(entry.projectId)}22`, borderLeftColor: projectColor(entry.projectId) }}>
                          <span className="tabular-nums">{formatMinute(shown.startMin)}{plus > 0 ? ` +${plus}` : ""}</span> {entry.title}
                          <div data-resize className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize" onPointerDown={(e) => onResizeDown(e, entry, day, true)} />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </Surface>
        )}

        {popover && (popover.kind === "draft" || openEntry) && (
          <QuickPopover
            key={popover.kind === "entry" ? popover.id : `draft-${popover.day}`}
            popover={popover}
            entry={openEntry ?? null}
            deps={deps}
            recentProjectIds={recentProjectIds}
            secondsByProject={secondsByProject}
            nowMs={nowMs}
            readOnly={openEntry ? !mayChange(openEntry) : popover.kind === "draft" ? !mayCreate || dayIsLocked(popover.day, createUserId) : !mayCreate}
            onClose={() => setPopover(null)}
            onOpen={(entry) => {
              setPopover(null);
              onOpen(entry);
            }}
            onDelete={(entry) => {
              setPopover(null);
              void remove(entry);
            }}
            onPatch={async (entry, patch) => {
              try {
                await updateEntry(entry.id, patch);
                tt.bump();
              } catch (e) {
                fail(e);
              }
            }}
            onCreate={async (day, span, projectId, billable) => {
              setPopover(null);
              try {
                const created = await createEntry({
                  ...instantsForSpan(day, span),
                  userId: scopeUserId,
                  projectId,
                  billable,
                  source: "calendar",
                  originType: "calendar",
                });
                tt.bump();
                setPopover({ kind: "entry", id: created.id, top: popover.top, left: popover.left });
              } catch (e) {
                fail(e);
              }
            }}
          />
        )}
      </div>

      <aside className="ws-lg:w-64 ws-lg:shrink-0" data-testid="calendar-task-rail">
        <Surface className="flex max-h-[36rem] flex-col gap-2">
          <h3 className="type-label text-slate-800">{t("Your tasks", "Vaše úlohy", "Az Ön feladatai")}</h3>
          <p className="type-meta text-slate-500">{t("Drag a task onto the calendar, or press play to start the timer.", "Úlohu pretiahnite do kalendára alebo spustite časovač.", "Húzza a feladatot a naptárra, vagy indítsa az időzítőt.")}</p>
          <div className="flex flex-col gap-1 overflow-y-auto">
            {myTasks.length === 0 && <p className="text-ui text-slate-500">{t("No open tasks.", "Žiadne otvorené úlohy.", "Nincs nyitott feladat.")}</p>}
            {myTasks.map((task) => {
              const projectId = lookups.resolveTaskProject(task).projectId;
              return (
                <div key={task.id} className="flex items-center gap-1 rounded-xl border border-slate-200/80 px-2 py-1.5">
                  <span
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/x-ccrm-task", task.id);
                      e.dataTransfer.setData("text/plain", `task:${task.id}`);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className="cursor-grab text-slate-400"
                    aria-label={t("Drag onto the calendar", "Pretiahnuť do kalendára", "Húzza a naptárra")}
                  >
                    <GripVertical className="size-4" />
                  </span>
                  <button
                    type="button"
                    onClick={() => void tt.start({ taskId: task.id, projectId, originType: "task", originId: task.id, billable: settings.billableByDefault })}
                    className="inline-flex size-7 items-center justify-center rounded-lg text-teal-700 hover:bg-teal-50 cursor-pointer"
                    aria-label={t("Start timer", "Spustiť časovač", "Időzítő indítása")}
                  >
                    <Play className="size-3.5 fill-current" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-ui font-semibold text-slate-800">{task.title}</div>
                    <div className={`truncate type-meta ${projectId ? "text-slate-500" : "text-amber-700"}`}>{projectId ? lookups.projectName(projectId) : t("No project", "Bez projektu", "Nincs projekt")}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Surface>
      </aside>
    </div>
  );
}

function QuickPopover({
  popover,
  entry,
  deps,
  recentProjectIds,
  secondsByProject,
  nowMs,
  readOnly,
  onClose,
  onOpen,
  onDelete,
  onPatch,
  onCreate,
}: {
  popover: PopoverState;
  entry: TimeEntry | null;
  deps: TimeDeps;
  recentProjectIds: string[];
  secondsByProject?: Record<string, number>;
  nowMs: number;
  readOnly: boolean;
  onClose: () => void;
  onOpen: (entry: TimeEntry) => void;
  onDelete: (entry: TimeEntry) => void;
  onPatch: (entry: TimeEntry, patch: EntryInput) => Promise<void>;
  onCreate: (day: string, span: MinuteSpan, projectId: string | null, billable: boolean) => Promise<void>;
}) {
  const { t, settings } = useTimeTracking();
  const [projectId, setProjectId] = useState<string | null>(entry?.projectId ?? (popover.kind === "draft" ? popover.projectId ?? null : null));
  const [billable, setBillable] = useState(entry?.billable ?? settings.billableByDefault);
  const span = entry ? spanFromEntry(entry, nowMs) : popover.kind === "draft" ? popover.span : null;
  const when = !span
    ? t("hours only", "iba hodiny", "csak órák")
    : `${formatMinute(span.startMin)}–${formatMinute(span.endMin)}${plusDays(span.endMin) > 0 ? ` +${plusDays(span.endMin)}` : ""}`;
  return (
    <div data-cal-popover className="absolute z-30 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl" style={{ top: popover.top, left: popover.left }}>
      {entry ? (
        <div className={`mb-1 truncate text-ui font-semibold ${entry.titleDeleted ? "text-slate-400" : "text-slate-900"}`}>{entry.title || t("Untitled", "Bez názvu", "Névtelen")}</div>
      ) : (
        <div className="mb-1 text-ui font-semibold text-slate-900">{t("New entry", "Nový záznam", "Új bejegyzés")}</div>
      )}
      <div className="mb-2 text-ui tabular-nums text-slate-600">
        {when}
        {entry && <span className="ml-2">{formatDuration(entryDurationSec(entry, nowMs))}</span>}
        {popover.kind === "draft" && <span className="ml-2">{formatDuration(instantsForSpan(popover.day, popover.span).durationSec)}</span>}
      </div>
      <ProjectPicker
        projects={deps.projects}
        leads={deps.leads}
        projectTypes={deps.projectTypes}
        value={projectId}
        onChange={(id) => {
          setProjectId(id);
          if (entry && !readOnly) void onPatch(entry, { projectId: id });
        }}
        t={t}
        recentIds={recentProjectIds}
        secondsByProject={secondsByProject}
        onCreateProject={deps.onCreateProject}
        disabled={readOnly || !deps.canPickProject}
      />
      <button
        type="button"
        disabled={readOnly}
        onClick={() => {
          const next = !billable;
          setBillable(next);
          if (entry) void onPatch(entry, { billable: next });
        }}
        className={`mt-2 inline-flex h-8 items-center rounded-lg px-2 text-ui font-semibold cursor-pointer disabled:opacity-40 ${billable ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}
      >
        {t("Billable", "Fakturovateľné", "Számlázható")}
      </button>
      <div className="mt-3 flex flex-wrap gap-2">
        {entry ? (
          <>
            <button type="button" onClick={() => onOpen(entry)} className="inline-flex h-8 items-center rounded-lg bg-teal-600 px-2 text-ui font-semibold text-white cursor-pointer">
              {t("Open", "Otvoriť", "Megnyitás")}
            </button>
            {!readOnly && (
              <button type="button" onClick={() => onDelete(entry)} className="inline-flex h-8 items-center rounded-lg px-2 text-ui font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer">
                {t("Delete", "Odstrániť", "Törlés")}
              </button>
            )}
          </>
        ) : (
          popover.kind === "draft" && (
            <button type="button" disabled={readOnly} onClick={() => void onCreate(popover.day, popover.span, projectId, billable)} className="inline-flex h-8 items-center rounded-lg bg-teal-600 px-2 text-ui font-semibold text-white cursor-pointer disabled:opacity-40">
              {t("Save", "Uložiť", "Mentés")}
            </button>
          )
        )}
        <button type="button" onClick={onClose} className="inline-flex h-8 items-center rounded-lg px-2 text-ui font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer">
          {t("Close", "Zavrieť", "Bezárás")}
        </button>
      </div>
    </div>
  );
}
