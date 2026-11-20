import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Lock, Trash2 } from "lucide-react";
import { Surface } from "../layout";
import { StatGrid, StatTile } from "../layout/StatGrid";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { useTimeEntries } from "../../hooks/useTimeEntries";
import { holidayName } from "../../utils/holidays.ts";
import {
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
import { totalWorkedSeconds } from "../../utils/timeWorked.ts";
import { WorkedTotal } from "./WorkedLine";
import { addDays } from "../../utils/holidays.ts";
import { TimeApiError, deleteEntry, restoreEntry, timeErrorMessage } from "../../utils/timeTrackingApi.ts";
import { withoutHiddenCost } from "../../utils/timeTeam.ts";
import { clusterEntries, segmentByCluster } from "../../utils/timeClusters.ts";
import { ClusterGroup } from "./ClusterChip";
import { ClockDigits } from "./ClockDigits";
import { EntryRow } from "./EntryRow";
import { RangeNav } from "./RangeNav";
import { continueInput } from "./TimerBar";
import { TimeToolbarSlot } from "./TimeToolbarSlot";
import { EntriesFocusBanner, clearEntriesFocus, useEntriesFocus, useViewingAsOptional, viewingFromScope } from "./ViewingAsContext";
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
  /** Grouped rows the user opened, by the group's first entry id. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /* PHASE4-VIEWING-AS */
  const providedView = useViewingAsOptional();
  const entriesFocus = useEntriesFocus();
  const viewing = providedView ?? viewingFromScope(scope);
  const viewScope = entriesFocus
    ? entriesFocus.userId
    : viewing.mode === "team"
      ? "all"
      : viewing.mode === "user" && viewing.userId
        ? viewing.userId
        : "me";
  const wholeTeam = viewScope === "all";
  const seenScope = useRef(scope);
  useEffect(() => {
    if (seenScope.current === scope) return;
    seenScope.current = scope;
    // Opening a team cell sets both the focus and "viewing as" that person.
    // Only a later change of the selector drops the focused range.
    if (!entriesFocus || entriesFocus.userId !== scope) clearEntriesFocus();
  }, [scope, entriesFocus]);
  const days = useMemo(() => {
    if (entriesFocus?.from && entriesFocus.to && entriesFocus.from <= entriesFocus.to) {
      const out: string[] = [];
      for (let d = entriesFocus.from; d <= entriesFocus.to && out.length < 62; d = addDays(d, 1)) out.push(d);
      if (out.length) return out;
    }
    return weekDays(anchor);
  }, [anchor, entriesFocus]);
  /* END-PHASE4-VIEWING-AS */
  const { entries, loading } = useTimeEntries({ from: days[0], to: days[days.length - 1], userId: scopeParam(viewScope) });
  const today = todayIso();

  const calendar = tt.calendarFor(tt.workCountry);
  useEffect(() => {
    tt.ensureHolidayYears(tt.workCountry, [...new Set(days.map((d) => Number(d.slice(0, 4))))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, tt.workCountry, tt.enabled]);
  useEffect(() => setSelected(new Set()), [anchor, viewScope, entriesFocus?.nonce]);

  const byDay = useMemo(() => groupByDay(entries), [entries]);
  const todays = byDay.get(today) ?? [];
  const week = entries;
  const target = viewScope === "me" ? targetSeconds(calendar, days, settings.hoursPerDay) : null;
  const finishedToday = todays.filter((e) => !e.running).length;
  const weekCost = totalCost(week.map((m) => withoutHiddenCost(m, tt.userId || "", tt.viewer.canCosts)));
  const weekWorked = totalWorkedSeconds(week, nowMs);
  const billableWorked = totalWorkedSeconds(week.filter((e) => e.billable), nowMs);
  const billable = weekWorked > 0 ? Math.round((billableWorked / weekWorked) * 100) : null;
  const locale = deps.language === "sk" ? "sk-SK" : deps.language === "hu" ? "hu-HU" : "en-GB";
  const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const dayName = (iso: string) =>
    iso === today
      ? t("Today", "Dnes", "Ma")
      : iso === addDays(today, -1)
        ? t("Yesterday", "Včera", "Tegnap")
        : new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { weekday: "long" });
  const shortDate = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", ...(iso.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" as const }) });
  const weekLabel =`${new Date(`${days[0]}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" })} – ${new Date(`${days[days.length - 1]}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}`;
  const isCurrentWeek = weekDays(anchor)[0] === weekDays(today)[0];
  const shortRange = `${new Date(`${days[0]}T12:00:00`).toLocaleDateString(locale, { day: "numeric" })} – ${new Date(`${days[days.length - 1]}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" })}`;

  // Phone: the current week shows today only, the rest of the week opens in place.
  const [wholeWeek, setWholeWeek] = useState(false);
  const phoneTodayOnly = isCurrentWeek && !entriesFocus && !wholeWeek;
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
        <StatTile
          label={t("Today", "Dnes", "Ma")}
          value={<ClockDigits value={formatDuration(totalWorkedSeconds(todays, nowMs), true)} data-testid="stat-today" />}
          delta={
            <span data-testid="stat-today-note">
              {t(`${finishedToday} ${finishedToday === 1 ? "entry" : "entries"}`, `Záznamy: ${finishedToday}`, `${finishedToday} bejegyzés`)}
              {todays.some((e) => e.running) && t(" + running timer", " + beží časovač", " + futó időzítő")}
            </span>
          }
        />
        <StatTile
          label={days.length > 7 ? t("This period", "Toto obdobie", "Ez az időszak") : t("This week", "Tento týždeň", "Ez a hét")}
          value={<ClockDigits value={formatDuration(totalWorkedSeconds(week, nowMs), true)} data-testid="stat-week" />}
          suffix={target !== null ? <span className="type-meta font-normal text-slate-400" data-testid="stat-target">/ {formatDuration(target)}</span> : undefined}
          progress={target ? { value: (weekWorked / target) * 100, label: t("Week target", "Týždenný cieľ", "Heti cél") } : undefined}
        />
        <StatTile
          label={days.length > 7 ? t("Billable this period", "Fakturovateľné za obdobie", "Számlázható ebben az időszakban") : t("Billable this week", "Fakturovateľné tento týždeň", "Számlázható ezen a héten")}
          value={<span className="tabular-nums" data-testid="stat-billable">{billable === null ? "—" : formatDuration(billableWorked, true)}</span>}
          suffix={billable === null ? undefined : <span className="type-meta font-semibold text-emerald-600" data-testid="stat-billable-percent">{billable} %</span>}
          progress={billable === null ? undefined : { value: billable, tone: "emerald", label: t("Billable share", "Podiel fakturovateľného", "Számlázható arány") }}
        />
        {weekCost !== null && (
          <StatTile
            label={t("Labour cost this week", "Náklady na prácu za týždeň", "Heti munkaköltség")}
            value={<span className="tabular-nums text-slate-900" data-testid="stat-cost">{money(weekCost)}</span>}
            icon={
              <span title={t("Only you and people with the cost permission see this.", "Toto vidíte iba vy a ľudia s oprávnením na náklady.", "Ezt csak Ön és a költséghez jogosult személyek látják.")} data-testid="stat-cost-lock">
                <Lock className="size-5" aria-label={t("Restricted", "Obmedzené", "Korlátozott")} />
              </span>
            }
          />
        )}
      </StatGrid>

      <TimeToolbarSlot>
        <RangeNav
          label={isCurrentWeek ? `${t("This week", "Tento týždeň", "Ez a hét")} · ${shortRange}` : weekLabel}
          labelTestId="week-label"
          prevLabel={t("Previous week", "Predchádzajúci týždeň", "Előző hét")}
          nextLabel={t("Next week", "Nasledujúci týždeň", "Következő hét")}
          onPrev={() => { clearEntriesFocus(); setAnchor(addDays(weekDays(anchor)[0], -7)); }}
          onNext={() => { clearEntriesFocus(); setAnchor(addDays(weekDays(anchor)[0], 7)); }}
          resetLabel={t("This week", "Tento týždeň", "Ez a hét")}
          onReset={isCurrentWeek ? undefined : () => { clearEntriesFocus(); setAnchor(today); }}
        />
      </TimeToolbarSlot>

      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-1.5 text-ui font-semibold text-white" data-testid="bulk-bar">
            {selected.size} {t("selected", "vybraných", "kijelölve")}
            <HoldToConfirmButton onConfirm={() => void remove([...selected])} what={`${selected.size}`} lang={deps.language} icon={<Trash2 className="size-4" />} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-rose-300 hover:bg-white/10 cursor-pointer">
              {t("Hold to delete", "Podržte pre odstránenie", "Tartsa a törléshez")}
            </HoldToConfirmButton>
          </div>
        )}
        {/* PHASE4-VIEWING-AS */}
        <EntriesFocusBanner users={deps.users} />
        {/* END-PHASE4-VIEWING-AS */}
      </div>

      {cards.length === 0 && !loading && (
        <Surface>
          <p className="text-body text-slate-500" data-testid="time-empty">{t("No time tracked this week. Start the timer above, or add time manually.", "Tento týždeň nie je zaznamenaný žiadny čas. Spustite časovač vyššie alebo pridajte čas ručne.", "Ezen a héten nincs rögzített idő. Indítsa el az időzítőt, vagy adjon hozzá kézzel.")}</p>
        </Surface>
      )}

      {phoneTodayOnly && !byDay.has(today) && !loading && cards.length > 0 && !entries.some((e) => e.running) && (
        <Surface className="ws-sm:hidden">
          <p className="text-body text-slate-500" data-testid="time-today-empty">{t("Nothing tracked today yet. Start the timer above.", "Dnes ešte nie je zaznamenaný žiadny čas. Spustite časovač vyššie.", "Ma még nincs rögzített idő. Indítsa el az időzítőt fent.")}</p>
        </Surface>
      )}

      {cards.map((date) => {
        const list = byDay.get(date) ?? [];
        const rows = collapseIdentical(list);
        const holiday = holidayLabel(date);
        const hiddenCost = list.some((m) => !tt.viewer.canCosts && m.userId !== (tt.userId || ""));
        const dayCost = hiddenCost ? null : totalCost(list.map((m) => withoutHiddenCost(m, tt.userId || "", tt.viewer.canCosts)));
        return (
          <Surface key={date} padding="none" className={`overflow-hidden ${phoneTodayOnly && date !== today && !list.some((m) => m.running) ? "hidden ws-sm:block" : ""}`}>
            <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 ${calendar.isOffDay(date) ? "bg-slate-50" : ""}`} data-testid="day-card-header" data-date={date}>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  ref={(el) => { if (el) el.indeterminate = list.some((m) => selected.has(m.id)) && !list.every((m) => selected.has(m.id)); }}
                  checked={list.length > 0 && list.every((m) => selected.has(m.id))}
                  disabled={list.length === 0}
                  onChange={(e) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      for (const m of list) (e.target.checked ? next.add(m.id) : next.delete(m.id));
                      return next;
                    })
                  }
                  aria-label={t("Select all entries of this day", "Vybrať všetky záznamy dňa", "A nap összes bejegyzésének kijelölése")}
                  data-testid="day-select-all"
                  className="size-4 shrink-0 accent-teal-600"
                />
                <span className="type-card-title capitalize text-slate-900" title={longDate(date)}>{dayName(date)}</span>
                <span className="type-meta text-slate-500">{shortDate(date)}</span>
                {holiday && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-micro font-semibold text-slate-600" data-testid="holiday-chip" title={holiday}>
                    {t("State holiday", "Štátny sviatok", "Állami ünnep")} · {holiday}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {dayCost !== null && <span className="type-meta tabular-nums text-slate-500" data-testid="day-cost">{money(dayCost)}</span>}
                <WorkedTotal projectSec={totalSeconds(list, nowMs)} workedSec={totalWorkedSeconds(list, nowMs)} className="font-semibold text-slate-900" />
              </div>
            </div>
            <div role="table" className="divide-y divide-slate-100">
              {segmentByCluster(rows, clusterEntries(list, nowMs), (r) => r.members.map((m) => m.id)).map((seg, si) => {
              const inner = seg.items.map(({ entry, members }) => {
                const visible = members.map((m) => withoutHiddenCost(m, tt.userId || "", tt.viewer.canCosts));
                const isOpen = members.length > 1 && expanded.has(entry.id);
                const toggleSelect = (ids: string[]) => (checked: boolean) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    for (const id of ids) (checked ? next.add(id) : next.delete(id));
                    return next;
                  });
                const onContinue = viewScope === "me" || entry.userId === tt.userId ? (e: TimeEntry, anchor?: Element) => void tt.start(continueInput(e), { anchor }) : undefined;
                return (
                  <Fragment key={entry.id}>
                    <EntryRow
                      entry={visible[0]}
                      members={visible}
                      expanded={isOpen}
                      onToggleGroup={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(entry.id)) next.delete(entry.id);
                          else next.add(entry.id);
                          return next;
                        })
                      }
                      deps={deps}
                      showPerson={wholeTeam}
                      selected={members.every((m) => selected.has(m.id))}
                      onSelect={toggleSelect(members.map((m) => m.id))}
                      onOpen={onOpen}
                      onContinue={onContinue}
                    />
                    {isOpen &&
                      visible.map((m) => (
                        <EntryRow
                          key={m.id}
                          entry={m}
                          nested
                          deps={deps}
                          showPerson={wholeTeam}
                          selected={selected.has(m.id)}
                          onSelect={toggleSelect([m.id])}
                          onOpen={onOpen}
                          onContinue={onContinue}
                        />
                      ))}
                  </Fragment>
                );
              });
              return seg.cluster ? <ClusterGroup key={`c${si}`} cluster={seg.cluster}>{inner}</ClusterGroup> : <Fragment key={`s${si}`}>{inner}</Fragment>;
            })}
            </div>
          </Surface>
        );
      })}

      {isCurrentWeek && !entriesFocus && cards.some((d) => d !== today) && (
        <button
          type="button"
          onClick={() => { setSelected(new Set()); setWholeWeek((v) => !v); }}
          aria-expanded={wholeWeek}
          data-testid="time-whole-week"
          className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-ui font-semibold text-primary hover:bg-slate-50 cursor-pointer ws-sm:hidden"
        >
          {wholeWeek ? t("Today only", "Iba dnes", "Csak a mai nap") : t("Whole week", "Celý týždeň", "Egész hét")}
        </button>
      )}
    </div>
  );
}
