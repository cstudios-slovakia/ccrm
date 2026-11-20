import { useState } from "react";
import { CheckSquare, Copy, Play, Trash2, X } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { entryDurationSec, formatMinute, instantsForSpan, plusDays, spanFromEntry, type MinuteSpan } from "../../utils/timeCalendar.ts";
import { formatDuration, type TimeEntry } from "../../utils/timeTracking.ts";
import { visibleEntryCost } from "../../utils/timeTeam.ts";
import { TimeApiError, createEntry, timeErrorMessage, type EntryInput } from "../../utils/timeTrackingApi.ts";
import { duplicateInput } from "./entryDuplicate";
import { AssignProjectChip } from "./AssignProjectChip";
import { ProjectLabel } from "./ProjectLabel";
import { projectClientName } from "./projectClient";
import { continueInput } from "./TimerBar";
import { useMoney, useTimeLookups, type TimeDeps } from "./shared";

export type PopoverState =
  | { kind: "entry"; id: string; top: number; left: number }
  | { kind: "draft"; day: string; span: MinuteSpan; top: number; left: number; taskId?: string; projectId?: string | null };

interface Props {
  popover: PopoverState;
  entry: TimeEntry | null;
  deps: TimeDeps;
  nowMs: number;
  /** Edit actions (billable, duplicate, delete, save) are disabled: locked entry, no permission, no person picked. */
  readOnly: boolean;
  onClose: () => void;
  onOpen: (entry: TimeEntry) => void;
  onDelete: (entry: TimeEntry) => void;
  onPatch: (entry: TimeEntry, patch: EntryInput) => Promise<void>;
  onCreate: (day: string, span: MinuteSpan, projectId: string | null, billable: boolean) => Promise<void>;
}

const ICON_BUTTON = "inline-flex size-9 shrink-0 items-center justify-center rounded-xl border cursor-pointer disabled:cursor-not-allowed disabled:opacity-40";

/** The Calendar's entry popover: title, project, task / billable / tag chips, when and how long, and the actions. */
export function CalendarPopover({ popover, entry, deps, nowMs, readOnly, onClose, onOpen, onDelete, onPatch, onCreate }: Props) {
  const tt = useTimeTracking();
  const { t, settings } = tt;
  const money = useMoney(deps);
  const lookups = useTimeLookups(deps);
  const projectId = entry?.projectId ?? (popover.kind === "draft" ? popover.projectId ?? null : null);
  const [billable, setBillable] = useState(entry?.billable ?? settings.billableByDefault);
  const span = entry ? spanFromEntry(entry, nowMs) : popover.kind === "draft" ? popover.span : null;
  const plus = span ? plusDays(span.endMin) : 0;
  const when = !span
    ? t("hours only", "iba hodiny", "csak órák")
    : `${formatMinute(span.startMin)}–${formatMinute(span.endMin)}${plus > 0 ? ` +${plus}` : ""}`;
  const day = entry?.entryDate ?? (popover.kind === "draft" ? popover.day : "");
  const locale = deps.language === "sk" ? "sk-SK" : deps.language === "hu" ? "hu-HU" : "en-GB";
  const dayLabel = day ? `${new Date(`${day}T12:00:00`).toLocaleDateString(locale, { weekday: "short" })} ${new Date(`${day}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" })}` : "";
  const seconds = entry ? entryDurationSec(entry, nowMs) : popover.kind === "draft" ? instantsForSpan(popover.day, popover.span).durationSec : 0;
  const cost = entry ? visibleEntryCost(entry, tt.userId || "", tt.viewer.canCosts) : null;
  const taskName = entry?.taskId ? deps.tasks.find((task) => task.id === entry.taskId)?.title ?? entry.title : "";
  const canContinue = !!entry && !entry.running && entry.userId === tt.userId
    && !tt.isRunningTarget({ taskId: entry.taskId, ticketId: entry.ticketId, projectId: entry.projectId, title: entry.description });
  const clientName = projectClientName(projectId, deps.projects, deps.leads);
  const closeLabel = t("Close", "Zavrieť", "Bezárás");

  const duplicate = async (source: TimeEntry) => {
    try {
      await createEntry(duplicateInput(source, tt.userId));
      tt.bump();
      onClose();
    } catch (e) {
      tt.notify(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");
    }
  };

  return (
    <div data-cal-popover className="absolute z-30 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl" style={{ top: popover.top, left: popover.left }}>
      <div className="flex items-start gap-2">
        {entry ? (
          <div className={`min-w-0 flex-1 truncate text-body font-semibold ${entry.titleDeleted ? "text-slate-400" : "text-slate-900"}`}>{entry.title || t("Untitled", "Bez názvu", "Névtelen")}</div>
        ) : (
          <div className="min-w-0 flex-1 text-body font-semibold text-slate-900">{t("New entry", "Nový záznam", "Új bejegyzés")}</div>
        )}
        <button type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel} className="-mr-1 -mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer">
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-0.5">
        {projectId ? (
          <ProjectLabel projectId={projectId} name={lookups.projectName(projectId, entry?.projectName)} client={clientName} className="max-w-full text-ui" />
        ) : (
          <AssignProjectChip />
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {taskName && (
          <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-micro font-semibold text-slate-700">
            <CheckSquare className="size-3 shrink-0" />
            <span className="truncate">{taskName}</span>
          </span>
        )}
        <button
          type="button"
          disabled={readOnly}
          aria-pressed={billable}
          onClick={() => {
            const next = !billable;
            setBillable(next);
            if (entry) void onPatch(entry, { billable: next });
          }}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-micro font-semibold cursor-pointer disabled:cursor-default ${billable ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500 line-through"}`}
        >
          {t("Billable", "Fakturovateľné", "Számlázható")}
        </button>
        {entry?.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-micro font-semibold text-slate-600">{tag}</span>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 px-3 py-2">
        <div className="min-w-0">
          <div className="type-overline text-slate-500">{dayLabel}</div>
          <div className="text-ui font-semibold tabular-nums text-slate-900" data-testid="calendar-popover-when">{when}</div>
        </div>
        <div className="min-w-0">
          <div className="type-overline text-slate-500">{cost !== null ? t("Duration · cost", "Trvanie · náklady", "Időtartam · költség") : t("Duration", "Trvanie", "Időtartam")}</div>
          <div className="truncate text-ui font-semibold tabular-nums text-slate-900" data-testid="calendar-popover-duration">
            {formatDuration(seconds)}
            {cost !== null && <span className="text-slate-600"> · {money(cost)}</span>}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {entry ? (
          <>
            {canContinue && (
              <button
                type="button"
                onClick={(ev) => {
                  void tt.start(continueInput(entry), { anchor: ev.currentTarget });
                  onClose();
                }}
                data-testid="calendar-popover-continue"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-ui font-semibold text-primary-foreground hover:opacity-90 cursor-pointer"
              >
                <Play className="size-3.5 fill-current" />
                {t("Continue", "Pokračovať", "Folytatás")}
              </button>
            )}
            <button type="button" onClick={() => onOpen(entry)} className="inline-flex h-9 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-ui font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
              {t("Edit", "Upraviť", "Szerkesztés")}
            </button>
            {!entry.running && (
            <button
              type="button"
              disabled={readOnly}
              onClick={() => void duplicate(entry)}
              title={t("Duplicate", "Duplikovať", "Másolás")}
              aria-label={t("Duplicate", "Duplikovať", "Másolás")}
              className={`${ICON_BUTTON} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
            >
              <Copy className="size-4" />
            </button>
            )}
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onDelete(entry)}
              title={t("Delete", "Odstrániť", "Törlés")}
              aria-label={t("Delete", "Odstrániť", "Törlés")}
              className={`${ICON_BUTTON} border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100`}
            >
              <Trash2 className="size-4" />
            </button>
          </>
        ) : (
          popover.kind === "draft" && (
            <button type="button" disabled={readOnly} onClick={() => void onCreate(popover.day, popover.span, projectId, billable)} className="inline-flex h-9 items-center rounded-xl bg-primary px-3 text-ui font-semibold text-primary-foreground hover:opacity-90 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40">
              {t("Save", "Uložiť", "Mentés")}
            </button>
          )
        )}
      </div>
    </div>
  );
}
