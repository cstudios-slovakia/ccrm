import { useEffect, useState } from "react";
import { SectionIcon } from "../icons/SectionIcon";
import { Calendar, CalendarDays, LayoutGrid, List } from "lucide-react";
import { Page, PageHeader, Tabs } from "../layout";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { useRecentProjects } from "../../hooks/useRecentProjects";
import { type TimeEntry } from "../../utils/timeTracking.ts";
import { EntryDrawer } from "./EntryDrawer";
import { extraTimeTrackingTabs, type ExtraTimeTrackingTab } from "./extraTabs";
import { TimeCalendarView } from "./TimeCalendarView";
import { TimeDayView } from "./TimeDayView";
import { TimeListView } from "./TimeListView";
import { TimeTimesheetView } from "./TimeTimesheetView";
import { MobileRunningCard } from "./MobileRunningCard";
import { TimerBar } from "./TimerBar";
import { TimeTrackingMobileBar } from "./TimeTrackingMobileBar";
import { ViewingAsProvider, useEntriesFocus, useViewingAs } from "./ViewingAsContext";
import { ViewingAsSelect } from "./ViewingAsSelect";
import { TimeHeaderActions } from "./TimeHeaderActions";
import { TimeToolbarProvider, TimeToolbarTarget } from "./TimeToolbarSlot";
import { UnsortedListChip } from "./UnsortedInbox";
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
      <TimeToolbarProvider>
        <TimeTrackingScreen {...props} />
      </TimeToolbarProvider>
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
  const entriesFocus = useEntriesFocus();

  const { recentProjectIds, secondsByProject } = useRecentProjects();
  // Phone, one timer running: the big card replaces the slim bar; its chips bring the bar's fields back.
  const [barOpen, setBarOpen] = useState(false);
  const singleRunning = tt.running.length === 1 && tt.paused.length === 0;
  const [addOpen, setAddOpen] = useState(false);
  useEffect(() => {
    if (!singleRunning) {
      setBarOpen(false);
      setAddOpen(false);
    }
  }, [singleRunning]);

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
        subtitle={t("Track work against projects and tasks. Labour cost is calculated from each employee's salary.", "Sledujte prácu na projektoch a úlohách. Náklady na prácu sa počítajú z platu každého zamestnanca.", "Kövesse nyomon a projektekre és feladatokra fordított munkát. A munkaköltséget az egyes munkatársak fizetéséből számoljuk.")}
        actions={<TimeHeaderActions onNavigate={onNavigate} />}
      />

      <MobileRunningCard deps={deps} editing={barOpen} onToggleEdit={() => setBarOpen((v) => !v)} onAdd={() => setAddOpen((v) => !v)} />
      {addOpen && singleRunning && (
        <div className="ws-sm:hidden">
          <TimerBar deps={deps} recentProjectIds={recentProjectIds} secondsByProject={secondsByProject} adding onStarted={() => setAddOpen(false)} />
        </div>
      )}
      <div className={singleRunning && !barOpen ? "hidden ws-sm:contents" : "contents"}>
        <TimerBar deps={deps} recentProjectIds={recentProjectIds} secondsByProject={secondsByProject} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3" data-testid="time-toolbar">
        <div className="min-w-0 max-w-full shrink">
          <Tabs<string>
            testId="time-tabs"
            value={tab}
            onChange={choose}
            items={[
              { key: "list", label: t("List", "Zoznam", "Lista"), icon: <List /> },
              { key: "day", label: t("Day", "Deň", "Nap"), icon: <CalendarDays /> },
              { key: "calendar", label: t("Calendar", "Kalendár", "Naptár"), icon: <Calendar /> },
              { key: "timesheet", label: t("Timesheet", "Výkaz", "Munkaidő-nyilvántartás"), icon: <LayoutGrid /> },
              ...extraTimeTrackingTabs.map((item: ExtraTimeTrackingTab) => ({ key: item.id, label: item.label(t), icon: item.icon })),
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TimeToolbarTarget />
          {scope === "me" && !entriesFocus && <UnsortedListChip refreshKey={tab} />}
          <ViewingAsSelect users={people} />
        </div>
      </div>

      {!ready ? (
        <p className="text-body text-slate-500">{t("Loading…", "Načítava sa…", "Betöltés…")}</p>
      ) : tab === "list" ? (
        <TimeListView deps={deps} scope={scope} onOpen={setOpen} />
      ) : tab === "day" ? (
        <TimeDayView deps={deps} scope={scope} recentProjectIds={recentProjectIds} secondsByProject={secondsByProject} onOpen={setOpen} />
      ) : tab === "calendar" ? (
        <TimeCalendarView deps={deps} scope={scope} onOpen={setOpen} />
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
      <TimeTrackingMobileBar onNavigate={onNavigate} deps={deps} recentProjectIds={recentProjectIds} secondsByProject={secondsByProject} />
    </Page>
  );
}
