import { Euro, Link2, MoreHorizontal, Play } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import {
  clockTime,
  endsNextDay,
  entrySeconds,
  formatDuration,
  projectColor,
  type TimeEntry,
} from "../../utils/timeTracking.ts";
import { initials, useMoney, useTimeLookups, type TimeDeps } from "./shared";

interface Props {
  entry: TimeEntry;
  /** Same work, several rows (List view groups consecutive identical entries). */
  count?: number;
  deps: TimeDeps;
  showPerson?: boolean;
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
  onOpen: (entry: TimeEntry) => void;
  onContinue?: (entry: TimeEntry) => void;
}

/** One entry as a row, shared by the List and the Day view. */
export function EntryRow({ entry, count = 1, deps, showPerson, selected, onSelect, onOpen, onContinue }: Props) {
  const { t, nowMs } = useTimeTracking();
  const lookups = useTimeLookups(deps);
  const money = useMoney(deps);
  const person = lookups.userById.get(entry.userId);
  const projectName = lookups.projectName(entry.projectId, entry.projectName);
  const sec = entrySeconds(entry, nowMs);
  const range = entry.startAt
    ? `${clockTime(entry.startAt)}–${entry.endAt ? clockTime(entry.endAt) : "…"}${endsNextDay(entry) ? " +1" : ""}`
    : t("hours only", "iba hodiny", "csak órák");
  const rate = "costRate" in entry;

  return (
    <div
      role="row"
      data-testid="time-entry-row"
      data-entry-id={entry.id}
      className={`group flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-ui hover:bg-slate-50 ws-sm:flex-nowrap ${entry.running ? "bg-rose-50/50" : ""}`}
    >
      {onSelect && (
        <input type="checkbox" checked={!!selected} onChange={(e) => onSelect(e.target.checked)} aria-label={t("Select", "Vybrať", "Kijelölés")} className="size-4 shrink-0 accent-teal-600" />
      )}
      {showPerson && (
        <span title={person?.name} className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-micro font-bold text-white" style={{ backgroundColor: person?.color || "#64748b" }}>
          {initials(person?.name || "?")}
        </span>
      )}
      <button type="button" onClick={() => onOpen(entry)} className="min-w-0 flex-1 basis-40 text-left cursor-pointer" data-testid="time-entry-title">
        <span className={`flex items-center gap-1.5 font-semibold ${entry.titleDeleted ? "italic text-slate-400" : "text-slate-900"}`}>
          {entry.titleSource !== "entry" && <Link2 className="size-3.5 shrink-0 text-teal-600" aria-label={t("Linked", "Prepojené", "Kapcsolt")} />}
          <span className="truncate">{entry.title || t("(no title)", "(bez názvu)", "(nincs cím)")}</span>
          {count > 1 && <span className="shrink-0 rounded-full bg-slate-200 px-1.5 text-micro font-bold text-slate-600">{count}</span>}
        </span>
        {entry.legacyNote && <span className="block truncate type-meta text-slate-400">{entry.legacyNote}</span>}
        {entry.recordedByUserId !== entry.userId && (
          <span className="block type-meta text-slate-400">
            {t("Recorded by", "Zaznamenal", "Rögzítette")} {lookups.userById.get(entry.recordedByUserId)?.name ?? "—"}
          </span>
        )}
      </button>
      {entry.projectId ? (
        <span className="inline-flex max-w-44 items-center gap-1.5 truncate" title={projectName}>
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: projectColor(entry.projectId) }} />
          <span className="truncate text-slate-600">{projectName}</span>
        </span>
      ) : (
        <button type="button" onClick={() => onOpen(entry)} className="rounded-full border border-dashed border-amber-400 bg-amber-50 px-2.5 py-0.5 text-micro font-semibold text-amber-800 cursor-pointer" data-testid="assign-project-chip">
          {t("Assign project", "Priradiť projekt", "Projekt hozzárendelése")}
        </button>
      )}
      {entry.tags.slice(0, 2).map((tag) => (
        <span key={tag} className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-micro font-semibold text-slate-600 ws-md:inline">
          {tag}
        </span>
      ))}
      <Euro className={`size-4 shrink-0 ${entry.billable ? "text-emerald-600" : "text-slate-300"}`} aria-label={entry.billable ? t("Billable", "Fakturovateľné", "Számlázható") : t("Not billable", "Nefakturovateľné", "Nem számlázható")} />
      <span className="w-28 shrink-0 text-right tabular-nums text-slate-500">{range}</span>
      <span className="w-14 shrink-0 text-right font-semibold tabular-nums text-slate-900" data-testid="time-entry-duration">
        {formatDuration(sec, entry.running)}
      </span>
      {rate && (
        <span className="hidden w-20 shrink-0 text-right tabular-nums text-violet-700 ws-lg:inline" data-testid="time-entry-cost">
          {entry.cost !== null && entry.cost !== undefined ? money(entry.cost) : entry.costRate === null && !entry.running ? <span className="text-amber-600" title={t("No rate — no employee linked", "Bez sadzby — nie je pripojený zamestnanec", "Nincs díj — nincs munkatárs hozzárendelve")}>—</span> : ""}
        </span>
      )}
      <span className="flex w-16 shrink-0 justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {onContinue && !entry.running && (
          <button type="button" onClick={() => onContinue(entry)} title={t("Continue", "Pokračovať", "Folytatás")} aria-label={t("Continue", "Pokračovať", "Folytatás")} data-testid="time-entry-continue" className="inline-flex size-7 items-center justify-center rounded-lg text-slate-500 hover:bg-primary hover:text-white cursor-pointer">
            <Play className="size-3.5 fill-current" />
          </button>
        )}
        <button type="button" onClick={() => onOpen(entry)} title={t("Open", "Otvoriť", "Megnyitás")} aria-label={t("Open", "Otvoriť", "Megnyitás")} className="inline-flex size-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer">
          <MoreHorizontal className="size-4" />
        </button>
      </span>
    </div>
  );
}
