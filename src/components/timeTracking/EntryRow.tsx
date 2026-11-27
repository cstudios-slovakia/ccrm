import { useState, type ReactNode } from "react";
import { Building2, CheckSquare, ChevronRight, Euro, Link2, MoreHorizontal, Play } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import {
  clockTime,
  endsNextDay,
  entrySeconds,
  formatDuration,
  importedFrom,
  type TimeEntry,
} from "../../utils/timeTracking.ts";
import { AssignProjectChip } from "./AssignProjectChip";
import { stripBasicMarkdown } from "../../utils/basicMarkdown";
import { ClockDigits } from "./ClockDigits";
import { ProjectLabel } from "./ProjectLabel";
import { RoundTimerButton } from "./RoundTimerButton";
import { RunningBadge } from "./RunningBadge";
import { projectClientName } from "./projectClient";
import { OfYourTime } from "./WorkedLine";
import { initials, useMoney, useTimeLookups, type TimeDeps } from "./shared";

interface Props {
  entry: TimeEntry;
  /**
   * Same work, several entries (the List view groups consecutive identical ones). The row then
   * shows their summed time and cost and the span from the first start to the last end.
   */
  members?: TimeEntry[];
  /** The group's entries are listed under it. */
  expanded?: boolean;
  onToggleGroup?: () => void;
  /** A member row inside an expanded group: indented. */
  nested?: boolean;
  deps: TimeDeps;
  showPerson?: boolean;
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
  onOpen: (entry: TimeEntry) => void;
  onContinue?: (entry: TimeEntry, anchor?: Element) => void;
  /** Replaces the hover Open / Continue column (the Day view shows its own always-visible actions). */
  actions?: ReactNode;
}

/** One entry as a row, shared by the List and the Day view. */
export function EntryRow({ entry, members, expanded, onToggleGroup, nested, deps, showPerson, selected, onSelect, onOpen, onContinue, actions }: Props) {
  const { t, nowMs, isRunningTarget, stop, userId: myUserId } = useTimeTracking();
  const lookups = useTimeLookups(deps);
  const money = useMoney(deps);
  const person = lookups.userById.get(entry.userId);
  const projectName = lookups.projectName(entry.projectId, entry.projectName);
  // An imported entry's recorder ran the import; saying "Recorded by" made it look like their time.
  const importTool = importedFrom(entry.source);
  const group = members && members.length > 1 ? members : [entry];
  const count = group.length;
  const sec = group.reduce((sum, m) => sum + entrySeconds(m, nowMs), 0);
  const timed = group.filter((m) => m.startAt);
  const first = timed.reduce<TimeEntry | null>((a, m) => (!a || (m.startAt ?? "") < (a.startAt ?? "") ? m : a), null);
  const last = timed.reduce<TimeEntry | null>((a, m) => (!a || (m.endAt ?? "") > (a.endAt ?? "") ? m : a), null);
  const range = first?.startAt
    ? `${clockTime(first.startAt)}–${last?.endAt ? clockTime(last.endAt) : "…"}${last && endsNextDay(last) ? " +1" : ""}`
    : t("hours only", "iba hodiny", "csak órák");
  const task = entry.taskId ? lookups.taskById.get(entry.taskId) : undefined;
  const showTask = !!task && task.title.trim() !== "" && task.title !== entry.title;
  const clientName = projectClientName(entry.projectId, deps.projects, deps.leads);
  const directClientName = entry.clientName || (entry.clientId ? deps.leads.find((l) => l.id === entry.clientId)?.name || null : null);
  const [stopping, setStopping] = useState(false);
  const rate = "costRate" in entry;
  const costs = group.map((m) => m.cost);
  const cost = costs.every((c) => c !== null && c !== undefined) ? costs.reduce<number>((a, c) => a + (c ?? 0), 0) : null;

  return (
    <div
      role="row"
      data-testid="time-entry-row"
      data-entry-id={entry.id}
      data-group-count={count > 1 ? count : undefined}
      className={`group flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-ui hover:bg-gray-50 ws-sm:flex-nowrap ${entry.running ? "bg-rose-50/50" : nested ? "bg-gray-50/60 pl-10" : ""}`}
    >
      {onSelect && (
        <input type="checkbox" checked={!!selected} onChange={(e) => onSelect(e.target.checked)} aria-label={t("Select", "Vybrať", "Kijelölés")} className="size-4 shrink-0 accent-[var(--entity-accent-solid)]" />
      )}
      {count > 1 && (
        <button
          type="button"
          onClick={onToggleGroup}
          aria-expanded={!!expanded}
          title={expanded ? t("Hide the entries", "Skryť záznamy", "Bejegyzések elrejtése") : t(`Show the ${count} entries`, `Zobraziť záznamy (${count})`, `A(z) ${count} bejegyzés megjelenítése`)}
          data-testid="time-entry-group-toggle"
          className={`inline-flex h-6 shrink-0 items-center gap-0.5 rounded-md border px-1 text-micro font-bold transition-colors cursor-pointer ${expanded ? "border-entity-border bg-entity-subtle text-entity-text" : "border-gray-200 bg-gray-100 text-gray-600 hover:border-gray-300"}`}
        >
          {count}
          <ChevronRight className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
      )}
      {showPerson && (
        <span
          title={person?.name}
          data-testid="time-entry-person"
          className="inline-flex shrink-0 items-center gap-2 ws-sm:w-36"
        >
          <span
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-micro font-bold text-white"
            style={{ backgroundColor: person?.color || "#64748b" }}
          >
            {initials(person?.name || "?")}
          </span>
          <span className="truncate text-ui font-medium text-gray-700">{person?.name || "—"}</span>
        </span>
      )}
      <button type="button" onClick={() => onOpen(entry)} className="min-w-0 flex-1 basis-40 text-left cursor-pointer" data-testid="time-entry-title">
        <span className={`flex items-center gap-1.5 font-semibold ${entry.titleDeleted ? "italic text-gray-400" : "text-gray-900"}`}>
          {entry.titleSource !== "entry" && !showTask && <Link2 className="size-3.5 shrink-0 text-entity-text" aria-label={t("Linked", "Prepojené", "Kapcsolt")} />}
          <span className="truncate">{entry.title || t("(no title)", "(bez názvu)", "(nincs cím)")}</span>
          {showTask && (
            <span className="inline-flex min-w-0 shrink items-center gap-1 font-normal text-gray-500" title={task.title} data-testid="time-entry-task">
              <CheckSquare className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{task.title}</span>
            </span>
          )}
          {entry.running && <RunningBadge />}
        </span>
        {entry.note && <span className="block truncate type-meta text-gray-500" data-testid="time-entry-note">{stripBasicMarkdown(entry.note)}</span>}
        {entry.legacyNote && <span className="block truncate type-meta text-gray-400">{entry.legacyNote}</span>}
        {entry.recordedByUserId !== entry.userId && (
          <span className="block type-meta text-gray-400" data-testid="time-entry-recorded-by">
            {importTool
              ? t(`Imported from ${importTool} by`, `Z ${importTool} importoval`, `${importTool}-importot végezte:`)
              : t("Recorded by", "Zaznamenal", "Rögzítette")}{" "}
            {lookups.userById.get(entry.recordedByUserId)?.name ?? "—"}
          </span>
        )}
      </button>
      {entry.projectId ? (
        <ProjectLabel projectId={entry.projectId} name={projectName} client={entry.clientName || clientName} className="max-w-56" />
      ) : directClientName ? (
        <span
          className="inline-flex max-w-56 items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-micro font-medium text-gray-700"
          data-testid="entry-client-chip"
          title={directClientName}
        >
          <Building2 className="size-3 shrink-0 text-gray-500" />
          <span className="truncate">{directClientName}</span>
        </span>
      ) : entry.taskId ? (
        <button
          type="button"
          onClick={() => onOpen(entry)}
          className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-micro font-medium text-gray-500 hover:bg-gray-100 cursor-pointer"
          data-testid="entry-unsorted-chip"
        >
          {t("Unsorted", "Nezaradené", "Rendezetlen")}
        </button>
      ) : (
        <AssignProjectChip onClick={() => onOpen(entry)} />
      )}
      {entry.tags.slice(0, 2).map((tag) => (
        <span key={tag} className="hidden rounded-full bg-gray-100 px-2 py-0.5 text-micro font-semibold text-gray-600 ws-md:inline">
          {tag}
        </span>
      ))}
      <Euro className={`size-4 shrink-0 ${entry.billable ? "text-emerald-600" : "text-gray-300"}`} aria-label={entry.billable ? t("Billable", "Fakturovateľné", "Számlázható") : t("Not billable", "Nefakturovateľné", "Nem számlázható")} />
      <span className="w-28 shrink-0 text-right tabular-nums text-gray-500">{range}</span>
      <span className="flex w-18 shrink-0 flex-col items-end">
        <ClockDigits value={formatDuration(sec, true)} className="justify-end font-semibold text-gray-900" data-testid="time-entry-duration" />
        <OfYourTime entries={group} />
      </span>
      {rate && (
        <span className="hidden w-20 shrink-0 text-right tabular-nums text-gray-500 ws-lg:inline" data-testid="time-entry-cost">
          {cost !== null ? money(cost) : entry.costRate === null && !entry.running ? <span className="text-amber-600" title={t("No rate — no employee linked", "Bez sadzby — nie je pripojený zamestnanec", "Nincs díj — nincs munkatárs hozzárendelve")}>—</span> : ""}
        </span>
      )}
      {actions ?? <span className="flex shrink-0 justify-end gap-1 opacity-100 ws-sm:w-16 ws-sm:opacity-0 ws-sm:transition-opacity ws-sm:group-hover:opacity-100 ws-sm:focus-within:opacity-100">
        {onContinue && !entry.running && !isRunningTarget({ taskId: entry.taskId, ticketId: entry.ticketId, projectId: entry.projectId, title: entry.description }) && (
          <button type="button" onClick={(ev) => onContinue(entry, ev.currentTarget)} title={t("Continue", "Pokračovať", "Folytatás")} aria-label={t("Continue", "Pokračovať", "Folytatás")} data-testid="time-entry-continue" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-entity-subtle text-entity-text hover:bg-entity-solid hover:text-white cursor-pointer ws-sm:size-7 ws-sm:min-h-0 ws-sm:min-w-0 ws-sm:bg-transparent ws-sm:text-gray-500 ws-sm:hover:bg-entity-solid ws-sm:hover:text-white">
            <Play className="size-3.5 fill-current" />
          </button>
        )}
        <button type="button" onClick={() => onOpen(entry)} title={t("Open", "Otvoriť", "Megnyitás")} aria-label={t("Open", "Otvoriť", "Megnyitás")} className="inline-flex size-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 cursor-pointer ws-sm:size-7">
          <MoreHorizontal className="size-4" />
        </button>
      </span>}
      {entry.running && !nested && entry.userId === myUserId && (
        <RoundTimerButton
          kind="stop"
          size="md"
          label={t("Stop timer", "Zastaviť časovač", "Időzítő leállítása")}
          disabled={stopping}
          onClick={() => { if (!stopping) { setStopping(true); void stop(entry.id).finally(() => setStopping(false)); } }}
          data-testid="time-entry-stop"
        />
      )}
    </div>
  );
}
