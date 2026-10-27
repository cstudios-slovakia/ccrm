import { useEffect, useMemo, useState } from "react";
import { SectionIcon } from "../icons/SectionIcon";
import { Calendar, CalendarDays, LayoutGrid, List, Settings as SettingsIcon } from "lucide-react";
import { Page, PageHeader, Tabs } from "../layout";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { useTimeEntries } from "../../hooks/useTimeEntries";
import { addDays } from "../../utils/holidays.ts";
import { todayIso, type TimeEntry } from "../../utils/timeTracking.ts";
import { EntryDrawer } from "./EntryDrawer";
import { extraTimeTrackingTabs, type ExtraTimeTrackingTab } from "./extraTabs";
import { TimeCalendarView } from "./TimeCalendarView";
import { TimeDayView } from "./TimeDayView";
import { TimeListView } from "./TimeListView";
import { TimeTimesheetView } from "./TimeTimesheetView";
import { TimerBar } from "./TimerBar";
import { TimeTrackingMobileBar } from "./TimeTrackingMobileBar";
import { ViewingAsProvider, useViewingAs } from "./ViewingAsContext";
import { ViewingAsSelect } from "./ViewingAsSelect";
import { useEntryDeletion, type TimeDeps } from "./shared";

interface Props {
  deps: TimeDeps;
  /** Route like `time-tracking/day`; the part after the slash picks the tab. */
  route: string;
  onNavigate: (route: string) => void;
}

const tabFromRoute = (route: string): string => {
  const sub = route.split("/")[1] || "";
  if (sub === "day" || sub === "calendar" || sub === "timesheet") return sub;
  if (extraTimeTrackingTabs.some((item) => item.id === sub)) return sub;
  return "list";
};

/** The Time Tracking module: timer bar, tabs, the entry drawer. */
export function TimeTrackingView(props: Props) {
  return (
    <ViewingAsProvider>
      <TimeTrackingScreen {...props} />
    </ViewingAsProvider>
  );
}

function TimeTrackingScreen({ deps, route, onNavigate }: Props) {
  const tt = useTimeTracking();
  const { t, ready } = tt;
  const viewing = useViewingAs();
  const scope = viewing.mode === "team" ? "all" : viewing.mode === "user" && viewing.userId ? viewing.userId : "me";
  const [tab, setTab] = useState(() => tabFromRoute(route));
  const [open, setOpen] = useState<TimeEntry | null>(null);
  const remove = useEntryDeletion();

  // Recent projects and per-project totals come from the last 30 days of the caller's own entries.
  const today = todayIso();
  const { entries: recentEntries } = useTimeEntries({ from: addDays(today, -30), to: today });
  const { recentProjectIds, secondsByProject } = useMemo(() => {
    const ids: string[] = [];
    const seconds: Record<string, number> = {};
    for (const e of [...recentEntries].sort((a, b) => (b.startAt ?? b.createdAt).localeCompare(a.startAt ?? a.createdAt))) {
      if (!e.projectId) continue;
      if (!ids.includes(e.projectId)) ids.push(e.projectId);
      seconds[e.projectId] = (seconds[e.projectId] ?? 0) + (e.durationSec ?? 0);
    }
    return { recentProjectIds: ids, secondsByProject: seconds };
  }, [recentEntries]);

  useEffect(() => {
    setTab(tabFromRoute(route));
  }, [route]);

  useEffect(() => {
    const onTab = (e: Event) => {
      const next = (e as CustomEvent<string>).detail;
      if (typeof next !== "string") return;
      const known = next === "list" || next === "day" || next === "calendar" || next === "timesheet" || extraTimeTrackingTabs.some((item) => item.id === next);
      if (!known) return;
      setTab(next);
      onNavigate(next === "list" ? "time-tracking" : `time-tracking/${next}`);
    };
    window.addEventListener("ccrm-time-tab", onTab);
    return () => window.removeEventListener("ccrm-time-tab", onTab);
  }, [onNavigate]);

  const choose = (next: string) => {
    setTab(next);
    onNavigate(next === "list" ? "time-tracking" : `time-tracking/${next}`);
  };

  const people = deps.users.filter((u) => u.id);
  const extra = extraTimeTrackingTabs.find((item) => item.id === tab);

  return (
    <Page>
      <PageHeader
        icon={<SectionIcon id="time-tracking" />}
        title={t("Time tracking", "Evidencia času", "Időkövetés")}
        subtitle={t("Track what you work on — every hour is priced at its real cost.", "Zaznamenávajte, na čom pracujete — každá hodina má svoju skutočnú cenu.", "Rögzítse, min dolgozik — minden óra a valós költségén szerepel.")}
        actions={
          <button type="button" onClick={() => onNavigate("settings/projects/time")} title={t("Time tracking settings", "Nastavenia evidencie času", "Időkövetés beállításai")} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-ui font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer">
            <SettingsIcon className="size-4" />
            <span className="hidden ws-sm:inline">{t("Settings", "Nastavenia", "Beállítások")}</span>
          </button>
        }
      />

      <TimerBar deps={deps} recentProjectIds={recentProjectIds} secondsByProject={secondsByProject} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-60 flex-1">
          <Tabs<string>
            testId="time-tabs"
            value={tab}
            onChange={choose}
            items={[
              { key: "list", label: t("List", "Zoznam", "Lista"), icon: <List /> },
              { key: "day", label: t("Day", "Deň", "Nap"), icon: <CalendarDays /> },
              { key: "calendar", label: t("Calendar", "Kalendár", "Naptár"), icon: <Calendar /> },
              { key: "timesheet", label: t("Timesheet", "Výkaz", "Munkaidő-nyilvántartás"), icon: <LayoutGrid /> },
              ...extraTimeTrackingTabs.map((item: ExtraTimeTrackingTab) => ({ key: item.id, label: item.label(t) })),
            ]}
          />
        </div>
        <ViewingAsSelect users={people} />
      </div>

      {!ready ? (
        <p className="text-body text-slate-500">{t("Loading…", "Načítava sa…", "Betöltés…")}</p>
      ) : tab === "list" ? (
        <TimeListView deps={deps} scope={scope} onOpen={setOpen} />
      ) : tab === "day" ? (
        <TimeDayView deps={deps} scope={scope} recentProjectIds={recentProjectIds} secondsByProject={secondsByProject} onOpen={setOpen} />
      ) : tab === "calendar" ? (
        <TimeCalendarView deps={deps} scope={scope} recentProjectIds={recentProjectIds} secondsByProject={secondsByProject} onOpen={setOpen} />
      ) : tab === "timesheet" ? (
        <TimeTimesheetView deps={deps} scope={scope} recentProjectIds={recentProjectIds} secondsByProject={secondsByProject} onOpen={setOpen} />
      ) : (
        extra?.render({ deps, onNavigate }) ?? null
      )}

      {open && (
        <EntryDrawer
          key={open.id}
          entry={open}
          deps={deps}
          recentProjectIds={recentProjectIds}
          secondsByProject={secondsByProject}
          onClose={() => setOpen(null)}
          onDelete={(e) => {
            void remove(e);
            setOpen(null);
          }}
        />
      )}
      <TimeTrackingMobileBar onNavigate={onNavigate} />
    </Page>
  );
}
