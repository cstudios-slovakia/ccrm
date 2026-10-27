import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Surface } from "../layout";
import { StatGrid, StatTile } from "../layout/StatGrid";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { useTimeEntries } from "../../hooks/useTimeEntries";
import { holidayName } from "../../utils/holidays.ts";
import {
  billablePercent,
  collapseIdentical,
  formatDuration,
  groupByDay,
  targetSeconds,
  todayIso,
  totalCost,
  totalSeconds,
  weekDays,
  type TimeEntry,
} from "../../utils/timeTracking.ts";
import { addDays } from "../../utils/holidays.ts";
import { TimeApiError, deleteEntry, restoreEntry, timeErrorMessage } from "../../utils/timeTrackingApi.ts";
import { EntryRow } from "./EntryRow";
import { continueInput } from "./TimerBar";
import { useMoney, type TimeDeps } from "./shared";

interface Props {
  deps: TimeDeps;
  /** "me", "all" (needs the team permission) or a user id. */
  scope: string;
  onOpen: (entry: TimeEntry) => void;
}

export const scopeParam = (scope: string): string | undefined => (scope === "me" ? undefined : scope);

/** The List tab: this week's stat strip and the entries as day cards, newest first. */
export function TimeListView({ deps, scope, onOpen }: Props) {
  const tt = useTimeTracking();
  const { t, nowMs, settings } = tt;
  const money = useMoney(deps);
  const [anchor, setAnchor] = useState(todayIso());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const days = useMemo(() => weekDays(anchor), [anchor]);
  const { entries, loading } = useTimeEntries({ from: days[0], to: days[6], userId: scopeParam(scope) });
  const today = todayIso();

  const calendar = tt.calendarFor(tt.workCountry);
  useEffect(() => {
    tt.ensureHolidayYears(tt.workCountry, [...new Set(days.map((d) => Number(d.slice(0, 4))))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, tt.workCountry, tt.enabled]);
  useEffect(() => setSelected(new Set()), [anchor, scope]);

  const byDay = useMemo(() => groupByDay(entries), [entries]);
  const todays = byDay.get(today) ?? [];
  const week = entries;
  const target = scope === "me" ? targetSeconds(calendar, days, settings.hoursPerDay) : null;
  const weekCost = totalCost(week);
  const billable = billablePercent(week, nowMs);
  const locale = deps.language === "sk" ? "sk-SK" : deps.language === "hu" ? "hu-HU" : "en-US";
  const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const weekLabel = `${new Date(`${days[0]}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" })} – ${new Date(`${days[6]}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}`;

  const cards = [...days].reverse().filter((d) => byDay.has(d) || calendar.holiday(d));
  const holidayLabel = (iso: string) => {
    const h = calendar.holiday(iso);
    return h ? holidayName(h, tt.workCountry, deps.language) : null;
  };

  const remove = async (ids: string[]) => {
    try {
      await Promise.all(ids.map((id) => deleteEntry(id)));
      tt.bump();
      setSelected(new Set());
      window.showUndoToast?.({
        message: ids.length === 1 ? t("Time entry deleted.", "Záznam času bol odstránený.", "Az időbejegyzés törölve.") : t(`${ids.length} time entries deleted.`, `Odstránené záznamy: ${ids.length}.`, `${ids.length} időbejegyzés törölve.`),
        undoLabel: t("Undo", "Späť", "Visszavonás"),
        onUndo: () => void Promise.all(ids.map((id) => restoreEntry(id))).then(() => tt.bump()),
        onCommit: () => {},
      });
    } catch (e) {
      window.showToast?.(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");
    }
  };

  return (
    <div className="grid gap-4" data-testid="time-list">
      <StatGrid count={weekCost !== null ? 4 : 3}>
        <StatTile label={t("Today", "Dnes", "Ma")} value={<span className="tabular-nums" data-testid="stat-today">{formatDuration(totalSeconds(todays, nowMs))}</span>} />
        <StatTile
          label={t("This week", "Tento týždeň", "Ez a hét")}
          value={<span className="tabular-nums" data-testid="stat-week">{formatDuration(totalSeconds(week, nowMs))}</span>}
          delta={target !== null ? <span data-testid="stat-target">{t("of", "z", "ennyiből:")} {formatDuration(target)} {t("target", "cieľ", "cél")}</span> : undefined}
        />
        <StatTile label={t("Billable", "Fakturovateľné", "Számlázható")} value={<span className="tabular-nums">{billable === null ? "—" : `${billable} %`}</span>} />
        {weekCost !== null && <StatTile label={t("Labour cost this week", "Náklady na prácu za týždeň", "Heti munkaköltség")} value={<span className="tabular-nums text-violet-700" data-testid="stat-cost">{money(weekCost)}</span>} />}
      </StatGrid>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setAnchor(addDays(days[0], -7))} aria-label={t("Previous week", "Predchádzajúci týždeň", "Előző hét")} className="inline-flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-900 cursor-pointer">
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-40 text-center text-ui font-semibold text-slate-800" data-testid="week-label">{weekLabel}</span>
        <button type="button" onClick={() => setAnchor(addDays(days[0], 7))} aria-label={t("Next week", "Nasledujúci týždeň", "Következő hét")} className="inline-flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-900 cursor-pointer">
          <ChevronRight className="size-4" />
        </button>
        {days[0] !== weekDays(today)[0] && (
          <button type="button" onClick={() => setAnchor(today)} className="h-9 rounded-xl px-3 text-ui font-semibold text-primary hover:bg-slate-100 cursor-pointer">{t("Current week", "Aktuálny týždeň", "Aktuális hét")}</button>
        )}
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-1.5 text-ui font-semibold text-white" data-testid="bulk-bar">
            {selected.size} {t("selected", "vybraných", "kijelölve")}
            <HoldToConfirmButton onConfirm={() => void remove([...selected])} what={`${selected.size}`} lang={deps.language} icon={<Trash2 className="size-4" />} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-rose-300 hover:bg-white/10 cursor-pointer">
              {t("Hold to delete", "Podržte pre odstránenie", "Tartsa a törléshez")}
            </HoldToConfirmButton>
          </div>
        )}
      </div>

      {cards.length === 0 && !loading && (
        <Surface>
          <p className="text-body text-slate-500" data-testid="time-empty">{t("No time tracked this week. Start the timer above, or add time manually.", "Tento týždeň nie je zaznamenaný žiadny čas. Spustite časovač vyššie alebo pridajte čas ručne.", "Ezen a héten nincs rögzített idő. Indítsa el az időzítőt, vagy adjon hozzá kézzel.")}</p>
        </Surface>
      )}

      {cards.map((date) => {
        const list = byDay.get(date) ?? [];
        const rows = collapseIdentical(list);
        const holiday = holidayLabel(date);
        return (
          <Surface key={date} padding="none" className="overflow-hidden" >
            <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 ${calendar.isOffDay(date) ? "bg-slate-50" : ""}`} data-testid="day-card-header" data-date={date}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`type-card-title capitalize ${date === today ? "text-teal-700" : "text-slate-900"}`}>{longDate(date)}</span>
                {holiday && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-micro font-semibold text-slate-600" data-testid="holiday-chip" title={holiday}>
                    {t("State holiday", "Štátny sviatok", "Állami ünnep")} · {holiday}
                  </span>
                )}
              </div>
              <span className="font-semibold tabular-nums text-slate-900">{formatDuration(totalSeconds(list, nowMs))}</span>
            </div>
            <div role="table" className="divide-y divide-slate-100">
              {rows.map(({ entry, members }) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  count={members.length}
                  deps={deps}
                  showPerson={scope !== "me"}
                  selected={selected.has(entry.id)}
                  onSelect={(checked) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      for (const m of members) (checked ? next.add(m.id) : next.delete(m.id));
                      return next;
                    })
                  }
                  onOpen={onOpen}
                  onContinue={scope === "me" || entry.userId === tt.userId ? (e) => void tt.start(continueInput(e)) : undefined}
                />
              ))}
            </div>
          </Surface>
        );
      })}
    </div>
  );
}
