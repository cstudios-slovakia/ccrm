/**
 * The Dashboard's designed cards.
 *
 * A library preset knows exactly what its rows mean — these are the fixed
 * server-side queries, not something a model invented — so it is drawn by a
 * renderer written for it rather than by the generic metric/chart/table
 * fallbacks. That is what buys the avatar discs, the phase badges in the
 * administrator's own colours, the "5 of 44" footers and the native donut.
 *
 * Every renderer takes the same context so the grid can hand them all the same
 * object, and every one of them is safe on an empty or half-shaped result: a
 * widget whose query fails must not take the panel down with it.
 */

import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Building2, Plus, User } from "lucide-react";
import { cn } from "../../utils/cn";
import { formatDateLocalized, nowLocalStamp } from "../../utils/localTime";
import { isTaskOverdue } from "../../utils/projectTasks";
import type { Language } from "../../utils/translations";
import {
  visibleColumnsOf,
  type WidgetSection
} from "../../utils/dashboardWidgets";
import {
  BigNumber,
  CardFooter,
  EmptyWidgetRows,
  FILL_ROWS_LAYER,
  MoreLink,
  PersonPill,
  SegmentBar,
  SegmentedToggle,
  StatusBadge,
  WidgetCard,
  colorForStatus,
  initialsOf,
  labelForStatus,
  useFillRows,
  type Translate
} from "./widgetKit";

export interface WidgetRenderContext {
  t: Translate;
  systemLanguage: Language;
  money: (value: number, opts?: Intl.NumberFormatOptions) => string;
  leadStates: string[];
  leadStateColors: Record<string, string> | null;
  leadSourceColors: Record<string, string> | null;
  taskStates: string[];
  taskStateColors: Record<string, string> | null;
  /** Navigate to an app route (the hash), for "see all" and row clicks. */
  navigate: (route: string) => void;
  /** Whose tasks "Mine" means. */
  currentUser: string;
}

export interface PresetWidgetProps {
  widget: any;
  data: any;
  title: string;
  section: WidgetSection;
  ctx: WidgetRenderContext;
  /** View-mode toggles write here; they filter without dirtying the layout. */
  onView: (patch: Record<string, any>) => void;
  /** The widget's settings with any view-mode override already folded in. */
  settings: Record<string, any>;
}

const rows = (data: any): any[] => (Array.isArray(data) ? data : []);
const num = (value: any): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** A task state is "done" when it is the last configured one, or literally done. */
export const isDoneTaskState = (status: any, taskStates: string[]): boolean => {
  const raw = String(status ?? "").trim().toLowerCase();
  if (!raw) return false;
  if (raw === "done" || raw === "hotová" || raw === "hotovo" || raw === "kész") return true;
  const last = taskStates[taskStates.length - 1];
  return !!last && last.toLowerCase() === raw;
};

/** …and "blocked" when it says so, in any of the three app languages. */
const isBlockedTaskState = (status: any): boolean =>
  /block|blokov|blokkol/i.test(String(status ?? ""));

/* ------------------------------------------------------------ 1. metric */

/**
 * One figure. The value lives in the first row under `mapping.dataKey` (or the
 * first column), and is read as money when the column or the card's own name
 * says it is worth rather than a count.
 */
export const readMetricValue = (
  widget: any,
  data: any,
  title: string,
  money: (value: number, opts?: Intl.NumberFormatOptions) => string
): string => {
  if (widget?.metricValue !== undefined && widget.metricValue !== "") return String(widget.metricValue);
  if (data === undefined || data === null) return "…";

  const row = Array.isArray(data) ? data[0] : data;
  if (row === undefined || row === null) return "0";
  if (typeof row !== "object") return String(row);

  const keys = Object.keys(row);
  if (keys.length === 0) return "0";
  const key =
    widget?.mapping?.dataKey && keys.includes(widget.mapping.dataKey) ? widget.mapping.dataKey : keys[0];
  const value = row[key];

  const haystack = `${key} ${title}`.toLowerCase();
  const isMoney = /value|worth|revenue|price|hodnot|érték/.test(haystack);
  if (isMoney && !isNaN(Number(value))) return money(Number(value));
  if (typeof value === "number") return value.toLocaleString();
  // COUNT(*) arrives from PDO as a string; a count is still a number.
  if (typeof value === "string" && value.trim() !== "" && !isNaN(Number(value))) {
    return Number(value).toLocaleString();
  }
  return String(value);
};

export const MetricWidget: React.FC<PresetWidgetProps> = ({ widget, data, title, section, ctx }) => (
  <WidgetCard icon={section.icon} accent={section.accent} title={title}>
    <div className="flex flex-col gap-1">
      <BigNumber>{readMetricValue(widget, data, title, ctx.money)}</BigNumber>
    </div>
  </WidgetCard>
);

/* -------------------------------------------------------- 2. open tasks */

/**
 * Open tasks: the count, how many of them are stuck, and a strip showing how
 * the open ones split across the states. Reads a full `tasks_summary`, which is
 * the only way to say "open" without hard-coding which state means finished.
 */
export const OpenTasksWidget: React.FC<PresetWidgetProps> = ({ data, title, section, ctx }) => {
  const all = rows(data);
  const open = all.filter((row) => !isDoneTaskState(row?.status, ctx.taskStates));
  const total = open.reduce((sum, row) => sum + num(row?.count), 0);
  const blocked = open
    .filter((row) => isBlockedTaskState(row?.status))
    .reduce((sum, row) => sum + num(row?.count), 0);

  return (
    <WidgetCard icon={section.icon} accent={section.accent} title={title}>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <BigNumber>{total.toLocaleString()}</BigNumber>
          {blocked > 0 && (
            <span className="text-xs font-bold text-rose-700 whitespace-nowrap">
              {blocked} {ctx.t("blocked", "blokované", "blokkolt")}
            </span>
          )}
        </div>
        <SegmentBar
          segments={open.map((row, index) => ({
            key: `${row?.status ?? index}`,
            value: num(row?.count),
            color: colorForStatus(row?.status, ctx.taskStateColors, "#3b82f6"),
            label: `${labelForStatus(row?.status, ctx.taskStates)}: ${num(row?.count)}`
          }))}
        />
      </div>
    </WidgetCard>
  );
};

/* ------------------------------------------------------- 3. leads table */

const LEAD_COLUMN_WIDTH: Record<string, string> = {
  lead: "minmax(0, 1fr)",
  status: "150px",
  value: "110px",
  owner: "150px",
  source: "120px",
  category: "130px",
  created_at: "110px"
};

const LEAD_COLUMN_LABEL: Record<string, [string, string, string]> = {
  lead: ["Lead", "Lead", "Lead"],
  status: ["Stage", "Fáza", "Fázis"],
  value: ["Value", "Hodnota", "Érték"],
  owner: ["Manager", "Manažér", "Menedzser"],
  source: ["Source", "Zdroj", "Forrás"],
  category: ["Category", "Kategória", "Kategória"],
  created_at: ["Created", "Vytvorené", "Létrehozva"]
};

const clientTypeLabel = (row: any, t: Translate): string => {
  const type = String(row?.client_type ?? "").toLowerCase();
  if (type === "business") return t("Company", "Firma", "Cég");
  if (type === "partner") return t("Partner", "Partner", "Partner");
  return t("Person", "Osoba", "Személy");
};

/** Every table row is this tall; `useFillRows` counts how many fit in it. */
const TABLE_ROW_HEIGHT = 60;

/** Rows leaving/entering/reordering on a toggle animate rather than snap. */
const ROW_EASE = [0.4, 0, 0.2, 1] as const;

export const LeadsTableWidget: React.FC<PresetWidgetProps> = ({
  widget,
  data,
  title,
  section,
  ctx,
  onView,
  settings
}) => {
  const reduceMotion = useReducedMotion();
  const rowTransition = { duration: reduceMotion ? 0 : 0.25, ease: ROW_EASE };
  const list = rows(data);
  const columns = visibleColumnsOf({ ...widget, settings });
  const template = columns.map((key) => LEAD_COLUMN_WIDTH[key] || "120px").join(" ");
  const fill = useFillRows(num(settings.rows) || 5, list.length, TABLE_ROW_HEIGHT);
  const shown = list.slice(0, fill.count);
  const total = num(list[0]?.total_count) || list.length;
  const shownValue = shown.reduce((sum, row) => sum + num(row?.value), 0);

  const cell = (key: string, row: any) => {
    switch (key) {
      case "lead": {
        const isCompany = String(row?.client_type ?? "").toLowerCase() !== "person";
        const TypeIcon = isCompany ? Building2 : User;
        return (
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-[34px] h-[34px] rounded-full bg-indigo-50 text-indigo-600 text-[11px] font-extrabold flex items-center justify-center shrink-0">
              {initialsOf(row?.name)}
            </span>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[13px] font-bold text-slate-800 truncate">{row?.name || "—"}</span>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 truncate">
                <TypeIcon className="h-[11px] w-[11px] text-slate-400 shrink-0" strokeWidth={2.25} />
                {clientTypeLabel(row, ctx.t)}
                {row?.city ? ` · ${row.city}` : ""}
              </span>
            </div>
          </div>
        );
      }
      case "status":
        return (
          <div className="min-w-0">
            <StatusBadge
              label={labelForStatus(row?.status, ctx.leadStates)}
              color={colorForStatus(row?.status, ctx.leadStateColors, "#64748b")}
            />
          </div>
        );
      case "value":
        return (
          <div
            className="text-[13px] font-bold text-slate-800 text-right"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {ctx.money(num(row?.value), { maximumFractionDigits: 0 })}
          </div>
        );
      case "owner":
        return (
          <div className="min-w-0">
            {row?.owner ? <PersonPill name={String(row.owner)} /> : <span className="text-xs text-slate-400">—</span>}
          </div>
        );
      case "source":
        return (
          <div className="min-w-0">
            {row?.source ? (
              <StatusBadge
                label={String(row.source)}
                color={colorForStatus(row.source, ctx.leadSourceColors, "#0d9488")}
              />
            ) : (
              <span className="text-xs text-slate-400">—</span>
            )}
          </div>
        );
      case "category":
        return (
          <div className="text-xs font-semibold text-slate-600 truncate">
            {row?.category || "—"}
          </div>
        );
      case "created_at":
        return (
          <div className="text-xs font-semibold text-slate-500" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatDateLocalized(row?.created_at, ctx.systemLanguage) || "—"}
          </div>
        );
      default:
        return <div className="text-xs text-slate-500 truncate">{String(row?.[key] ?? "—")}</div>;
    }
  };

  return (
    <WidgetCard
      icon={section.icon}
      accent={section.accent}
      title={title}
      flush
      actions={
        <>
          <SegmentedToggle
            value={String(settings.order ?? "recent")}
            onChange={(value) => onView({ order: value })}
            options={[
              { value: "recent", label: ctx.t("Newest", "Najnovšie", "Legújabb") },
              { value: "value", label: ctx.t("Highest value", "Najvyššia hodnota", "Legnagyobb érték") }
            ]}
          />
          <MoreLink
            label={ctx.t("All", "Všetky", "Összes")}
            href="#leads"
            onClick={() => ctx.navigate("leads")}
          />
        </>
      }
    >
      {list.length === 0 ? (
        <EmptyWidgetRows t={ctx.t} />
      ) : (
        <>
          <div className="flex flex-col flex-1 min-w-0">
            <div
              className="grid items-center h-8 px-3 gap-x-4"
              style={{ gridTemplateColumns: template }}
            >
              {columns.map((key) => (
                <span
                  key={key}
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400",
                    key === "value" && "text-right"
                  )}
                >
                  {ctx.t(...(LEAD_COLUMN_LABEL[key] ?? ([key, key, key] as [string, string, string])))}
                </span>
              ))}
            </div>
            <div {...fill.bodyProps}>
              <div className={FILL_ROWS_LAYER}>
                <AnimatePresence initial={false} mode="popLayout">
                  {shown.map((row, index) => (
                    <motion.a
                      key={row?.id ?? index}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={rowTransition}
                      href={row?.id ? `#lead-${row.id}` : "#leads"}
                      onClick={(e) => {
                        e.preventDefault();
                        ctx.navigate(row?.id ? `lead-${row.id}` : "leads");
                      }}
                      className="grid items-center h-[60px] px-3 gap-x-4 border-t border-slate-100 text-inherit hover:bg-slate-50 transition-colors"
                      style={{ gridTemplateColumns: template }}
                    >
                      {columns.map((key) => (
                        <React.Fragment key={key}>{cell(key, row)}</React.Fragment>
                      ))}
                    </motion.a>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
          <CardFooter>
            <span className="text-xs font-semibold text-slate-500">
              {ctx.t(
                `${shown.length} of ${total} leads`,
                `${shown.length} z ${total} leadov`,
                `${shown.length} / ${total} lead`
              )}
            </span>
            <span
              className="text-xs font-bold text-slate-700"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {ctx.t("Total", "Spolu", "Összesen")}{" "}
              {ctx.money(shownValue, { maximumFractionDigits: 0 })}
            </span>
          </CardFooter>
        </>
      )}
    </WidgetCard>
  );
};

/* ------------------------------------------------------- 4. tasks table */

const TASK_COLUMN_WIDTH: Record<string, string> = {
  task: "minmax(0, 1fr)",
  owner: "150px",
  status: "120px",
  deadline: "130px",
  priority: "110px",
  project: "140px"
};

const TASK_COLUMN_LABEL: Record<string, [string, string, string]> = {
  task: ["Task", "Úloha", "Feladat"],
  owner: ["Assignee", "Riešiteľ", "Felelős"],
  status: ["Status", "Stav", "Állapot"],
  deadline: ["Deadline", "Termín", "Határidő"],
  priority: ["Priority", "Priorita", "Prioritás"],
  project: ["Project", "Projekt", "Projekt"]
};

const PRIORITY_COLOR: Record<string, string> = {
  low: "#64748b",
  medium: "#f59e0b",
  high: "#ef4444"
};

export const TasksTableWidget: React.FC<PresetWidgetProps> = ({
  widget,
  data,
  title,
  section,
  ctx,
  onView,
  settings
}) => {
  const reduceMotion = useReducedMotion();
  const rowTransition = { duration: reduceMotion ? 0 : 0.25, ease: ROW_EASE };
  const list = rows(data);
  const columns = visibleColumnsOf({ ...widget, settings });
  const template = columns.map((key) => TASK_COLUMN_WIDTH[key] || "120px").join(" ");
  const fill = useFillRows(num(settings.rows) || 5, list.length, TABLE_ROW_HEIGHT);
  const shown = list.slice(0, fill.count);
  const total = num(list[0]?.total_count) || list.length;

  const cell = (key: string, row: any) => {
    const done = isDoneTaskState(row?.status, ctx.taskStates);
    switch (key) {
      case "task":
        return (
          <div className="flex flex-col gap-[3px] min-w-0">
            <span
              className={cn(
                "text-[13px] font-bold truncate",
                done ? "text-slate-400 line-through" : "text-slate-800"
              )}
            >
              {row?.title || "—"}
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 truncate">
              <Building2 className="h-[11px] w-[11px] text-slate-400 shrink-0" strokeWidth={2.25} />
              {row?.lead_name || row?.project_name || ctx.t("No client", "Bez klienta", "Nincs ügyfél")}
            </span>
          </div>
        );
      case "owner":
        return (
          <div className="min-w-0">
            {row?.owner ? <PersonPill name={String(row.owner)} /> : <span className="text-xs text-slate-400">—</span>}
          </div>
        );
      case "status":
        return (
          <div className="min-w-0">
            <StatusBadge
              label={labelForStatus(row?.status, ctx.taskStates)}
              color={colorForStatus(row?.status, ctx.taskStateColors, "#64748b")}
            />
          </div>
        );
      case "deadline": {
        const overdue =
          !done &&
          isTaskOverdue(
            { status: row?.status, deadline: row?.deadline, deadlineTime: row?.deadline_time },
            ctx.taskStates,
            nowLocalStamp()
          );
        return (
          <div className="min-w-0">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 h-6 px-2 rounded-lg border text-xs font-bold whitespace-nowrap",
                done
                  ? "bg-slate-100 border-slate-200 text-slate-500"
                  : overdue
                    ? "bg-rose-50 border-rose-200 text-rose-700"
                    : "bg-indigo-50 border-indigo-100 text-indigo-700"
              )}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatDateLocalized(row?.deadline, ctx.systemLanguage) || "—"}
            </span>
          </div>
        );
      }
      case "priority": {
        const priority = String(row?.priority ?? "medium").toLowerCase();
        return (
          <div className="min-w-0">
            <StatusBadge label={priority} color={PRIORITY_COLOR[priority] || "#64748b"} />
          </div>
        );
      }
      case "project":
        return <div className="text-xs font-semibold text-slate-600 truncate">{row?.project_name || "—"}</div>;
      default:
        return <div className="text-xs text-slate-500 truncate">{String(row?.[key] ?? "—")}</div>;
    }
  };

  return (
    <WidgetCard
      icon={section.icon}
      accent={section.accent}
      title={title}
      flush
      actions={
        <>
          <SegmentedToggle
            value={String(settings.scope ?? "team")}
            onChange={(value) => onView({ scope: value })}
            options={[
              { value: "mine", label: ctx.t("Mine", "Moje", "Enyém") },
              { value: "team", label: ctx.t("Whole team", "Celý tím", "Egész csapat") }
            ]}
          />
          <MoreLink
            label={ctx.t("All", "Všetky", "Összes")}
            href="#tasks"
            onClick={() => ctx.navigate("tasks")}
          />
        </>
      }
    >
      {list.length === 0 ? (
        <EmptyWidgetRows t={ctx.t} />
      ) : (
        <>
          <div className="flex flex-col flex-1 min-w-0">
            <div className="grid items-center h-8 px-3 gap-x-4" style={{ gridTemplateColumns: template }}>
              {columns.map((key) => (
                <span key={key} className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                  {ctx.t(...(TASK_COLUMN_LABEL[key] ?? ([key, key, key] as [string, string, string])))}
                </span>
              ))}
            </div>
            <div {...fill.bodyProps}>
              <div className={FILL_ROWS_LAYER}>
                <AnimatePresence initial={false} mode="popLayout">
                  {shown.map((row, index) => (
                    <motion.a
                      key={row?.id ?? index}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={rowTransition}
                      href="#tasks"
                      onClick={(e) => {
                        e.preventDefault();
                        ctx.navigate("tasks");
                      }}
                      className="grid items-center h-[60px] px-3 gap-x-4 border-t border-slate-100 text-inherit hover:bg-slate-50 transition-colors"
                      style={{ gridTemplateColumns: template }}
                    >
                      {columns.map((key) => (
                        <React.Fragment key={key}>{cell(key, row)}</React.Fragment>
                      ))}
                    </motion.a>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
          <CardFooter>
            <span className="text-xs font-semibold text-slate-500">
              {ctx.t(
                `${shown.length} of ${total} tasks`,
                `${shown.length} z ${total} úloh`,
                `${shown.length} / ${total} feladat`
              )}
            </span>
            <a
              href="#tasks"
              onClick={(e) => {
                e.preventDefault();
                ctx.navigate("tasks");
              }}
              className="flex items-center gap-1.5 text-xs font-bold text-indigo-600"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              {ctx.t("New task", "Nová úloha", "Új feladat")}
            </a>
          </CardFooter>
        </>
      )}
    </WidgetCard>
  );
};

/* ------------------------------------------------------- 5. stage donut */

/**
 * The pipeline as a ring. Drawn as stroked arcs rather than through the chart
 * library because the card needs the total in the middle and a legend that
 * carries the same counts the rest of the app shows — and because the phases
 * are already coloured in Settings.
 */
export const StageDonutWidget: React.FC<PresetWidgetProps> = ({ data, title, section, ctx }) => {
  const list = rows(data).filter((row) => num(row?.count) >= 0);
  const total = list.reduce((sum, row) => sum + num(row?.count), 0);

  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const arcs = list.map((row, index) => {
    const value = num(row?.count);
    const length = total > 0 ? (value / total) * circumference : 0;
    const arc = {
      key: `${row?.status ?? index}`,
      color: colorForStatus(row?.status, ctx.leadStateColors, "#94a3b8"),
      dash: `${Math.max(length - 2, 0).toFixed(2)} ${circumference.toFixed(2)}`,
      offset: -offset
    };
    offset += length;
    return arc;
  });

  return (
    <WidgetCard
      icon={section.icon}
      accent={section.accent}
      title={title}
      actions={
        <MoreLink
          label={ctx.t("Open", "Otvoriť", "Megnyitás")}
          href="#leads"
          onClick={() => ctx.navigate("leads")}
        />
      }
    >
      <div className="flex items-center gap-6">
        <div className="relative w-[132px] h-[132px] shrink-0">
          <svg width="132" height="132" viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" className="text-slate-100" strokeWidth="16" />
            {arcs.map((arc) => (
              <circle
                key={arc.key}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth="16"
                strokeDasharray={arc.dash}
                strokeDashoffset={arc.offset}
                transform="rotate(-90 60 60)"
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-[22px] font-bold text-slate-900 leading-none"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {total.toLocaleString()}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400 mt-[3px]">
              {ctx.t("leads", "leadov", "lead")}
            </span>
          </div>
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          {list.map((row, index) => (
            <div key={`${row?.status ?? index}`} className="flex items-center gap-2 h-[22px]">
              <span
                className="w-2 h-2 rounded-[3px] shrink-0"
                style={{ backgroundColor: colorForStatus(row?.status, ctx.leadStateColors, "#94a3b8") }}
              />
              <span className="text-xs font-semibold text-slate-700 flex-1 truncate capitalize">
                {labelForStatus(row?.status, ctx.leadStates)}
              </span>
              <span
                className="text-xs font-bold text-slate-900"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {num(row?.count).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </WidgetCard>
  );
};

/* ------------------------------------------------------- 6. source bars */

export const SourceBarsWidget: React.FC<PresetWidgetProps> = ({ data, title, section, ctx }) => {
  const list = rows(data);
  const max = list.reduce((top, row) => Math.max(top, num(row?.count)), 0);

  return (
    <WidgetCard
      icon={section.icon}
      accent={section.accent}
      title={title}
      actions={
        <MoreLink
          label={ctx.t("Open", "Otvoriť", "Megnyitás")}
          href="#leads"
          onClick={() => ctx.navigate("leads")}
        />
      }
    >
      {list.length === 0 ? (
        <EmptyWidgetRows t={ctx.t} />
      ) : (
        <div className="flex flex-col gap-1.5">
          {list.map((row, index) => {
            const value = num(row?.count);
            const color = colorForStatus(row?.source, ctx.leadSourceColors, "#0d9488");
            return (
              <div
                key={`${row?.source ?? index}`}
                className="grid items-center h-6 gap-x-2.5"
                style={{ gridTemplateColumns: "92px minmax(0, 1fr) 28px" }}
              >
                <span className="text-xs font-semibold text-slate-700 truncate capitalize">
                  {row?.source || ctx.t("Unknown", "Neznámy", "Ismeretlen")}
                </span>
                <span className="h-2.5 rounded-full bg-slate-100 flex">
                  <span
                    className="rounded-full"
                    style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, backgroundColor: color }}
                  />
                </span>
                <span
                  className="text-xs font-bold text-slate-900 text-right"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {value.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
};

/* ------------------------------------------------------ 7. task status */

export const TaskStatusWidget: React.FC<PresetWidgetProps> = ({ data, title, section, ctx }) => {
  const list = rows(data);
  const total = list.reduce((sum, row) => sum + num(row?.count), 0);

  return (
    <WidgetCard
      icon={section.icon}
      accent={section.accent}
      title={title}
      actions={
        <MoreLink
          label={ctx.t("Open", "Otvoriť", "Megnyitás")}
          href="#tasks"
          onClick={() => ctx.navigate("tasks")}
        />
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <span
            className="text-[34px] font-bold tracking-[-0.02em] leading-none text-slate-900"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {total.toLocaleString()}
          </span>
          <span className="text-xs font-semibold text-slate-500">
            {ctx.t("tasks in total", "úloh spolu", "feladat összesen")}
          </span>
        </div>
        <SegmentBar
          thickness={12}
          segments={list.map((row, index) => ({
            key: `${row?.status ?? index}`,
            value: num(row?.count),
            color: colorForStatus(row?.status, ctx.taskStateColors, "#3b82f6"),
            label: `${labelForStatus(row?.status, ctx.taskStates)}: ${num(row?.count)}`
          }))}
        />
      </div>
      <div className="flex flex-col">
        {list.map((row, index) => {
          const value = num(row?.count);
          return (
            <div
              key={`${row?.status ?? index}`}
              className="flex items-center justify-between h-11 border-t border-slate-100"
            >
              <StatusBadge
                label={labelForStatus(row?.status, ctx.taskStates)}
                color={colorForStatus(row?.status, ctx.taskStateColors, "#64748b")}
              />
              <span className="flex items-baseline gap-2">
                <span
                  className="text-[15px] font-bold text-slate-900"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {value.toLocaleString()}
                </span>
                <span
                  className="text-xs font-semibold text-slate-400 w-9 text-right"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {total > 0 ? Math.round((value / total) * 100) : 0} %
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </WidgetCard>
  );
};
