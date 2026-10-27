import { useMemo, useState } from "react";
import { CalendarDays, List, Settings as SettingsIcon, Timer } from "lucide-react";
import { Page, PageHeader, Tabs } from "../layout";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { useTimeEntries } from "../../hooks/useTimeEntries";
import { addDays } from "../../utils/holidays.ts";
import { todayIso, type TimeEntry } from "../../utils/timeTracking.ts";
import { EntryDrawer } from "./EntryDrawer";
import { TimeDayView } from "./TimeDayView";
import { TimeListView } from "./TimeListView";
import { TimerBar } from "./TimerBar";
import { useEntryDeletion, type TimeDeps } from "./shared";

type TabKey = "list" | "day";

interface Props {
  deps: TimeDeps;
  /** Route like `time-tracking/day`; the part after the slash picks the tab. */
  route: string;
  onNavigate: (route: string) => void;
}

/** The Time Tracking module: timer bar, tabs, the entry drawer. */
export function TimeTrackingView({ deps, route, onNavigate }: Props) {
  const tt = useTimeTracking();
  const { t, viewer, ready } = tt;
  const [tab, setTab] = useState<TabKey>(() => (route.split("/")[1] === "day" ? "day" : "list"));
  const [scope, setScope] = useState("me");
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

  const choose = (next: TabKey) => {
    setTab(next);
    onNavigate(next === "list" ? "time-tracking" : `time-tracking/${next}`);
  };

  const people = deps.users.filter((u) => u.id);

  return (
    <Page>
      <PageHeader
        icon={<Timer className="text-teal-600" />}
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
          <Tabs<TabKey>
            testId="time-tabs"
            value={tab}
            onChange={choose}
            items={[
              { key: "list", label: t("List", "Zoznam", "Lista"), icon: <List /> },
              { key: "day", label: t("Day", "Deň", "Nap"), icon: <CalendarDays /> },
            ]}
          />
        </div>
        {viewer.canTeam && (
          <label className="flex items-center gap-2 text-ui text-slate-600">
            {t("Viewing as", "Zobraziť ako", "Megtekintés mint")}
            <select value={scope} onChange={(e) => setScope(e.target.value)} data-testid="viewing-as" className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-ui font-semibold text-slate-800">
              <option value="me">{t("Me", "Ja", "Én")}</option>
              <option value="all">{t("Whole team", "Celý tím", "Teljes csapat")}</option>
              {people.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!ready ? (
        <p className="text-body text-slate-500">{t("Loading…", "Načítava sa…", "Betöltés…")}</p>
      ) : tab === "list" ? (
        <TimeListView deps={deps} scope={scope} onOpen={setOpen} />
      ) : (
        <TimeDayView deps={deps} scope={scope} recentProjectIds={recentProjectIds} secondsByProject={secondsByProject} onOpen={setOpen} />
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
    </Page>
  );
}

