import React, { useCallback, useEffect, useState } from "react";
import { CalendarDays, ChevronRight, RefreshCw, Users, UserCheck, Wallet } from "lucide-react";
import { PageHeader, Tabs, type TabItem } from "../layout";
import { SectionIcon } from "../icons/SectionIcon";
import type {
  FinancialCategory,
  Lead,
  Project,
  Task,
  Ticket,
  TicketStatusDef,
  UserProfile,
} from "../../types";
import type { Language } from "../../utils/translations";
import type { AgencyBootstrapPayload, AgencyWorker, AgencyWorkerChecklistItem } from "../../types/agency";
import { fetchAgencyBootstrap, saveAgencyWorker } from "../../utils/agencyApi";
import type { AgencyRights } from "../../utils/agencyRights";
import { localDateStr, localStampStr } from "../../utils/projectTasks";
import { addDays } from "../../utils/holidays";
import type { TaskAccess } from "../../utils/taskSelectors";
import { AgencyWorkerDetailView } from "./AgencyWorkerDetailView";
import { AgencyPaymentsView } from "./AgencyPaymentsView";
import { AgencyScheduleView } from "./AgencyScheduleView";
import { CandidatesPipelineView } from "./CandidatesPipelineView";
import { PlacementsPanel } from "./PlacementsPanel";
import { RentedEmployeesView } from "./RentedEmployeesView";
import { WorkerTasksTicketsTab } from "./WorkerTasksTicketsTab";

export type AgencySubTab = "candidates" | "workers" | "schedule" | "payments";

interface AgencyViewProps {
  route: string;
  onNavigate: (route: string) => void;
  lang: Language;
  rights: AgencyRights;
  isAdmin: boolean;
  currentUser?: UserProfile;
  leads: Lead[];
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  projects: Project[];
  users: UserProfile[];
  taskStates: string[];
  taskStateColors?: Record<string, string>;
  taskAccess: TaskAccess;
  tickets: Ticket[];
  setTickets: React.Dispatch<React.SetStateAction<Ticket[]>>;
  ticketStatuses?: TicketStatusDef[];
  financialCategories: FinancialCategory[];
  mailConfigured?: boolean;
  integrationsConfig?: any;
}

export const AgencyView: React.FC<AgencyViewProps> = ({
  route,
  onNavigate,
  lang,
  rights,
  isAdmin,
  currentUser,
  leads,
  tasks,
  setTasks,
  projects,
  users,
  taskStates,
  taskStateColors,
  taskAccess,
  tickets,
  setTickets,
  ticketStatuses,
  financialCategories,
  mailConfigured,
  integrationsConfig,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    lang === "sk" ? sk : lang === "hu" ? hu : en;

  const [bootstrap, setBootstrap] = useState<AgencyBootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const y = new Date().getFullYear();
      const data = await fetchAgencyBootstrap(`${y - 1}-01-01`, `${y + 1}-12-31`);
      setBootstrap(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agency module");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  // Parse `#agency`, `#agency/candidates`, `#agency/workers`, `#agency/schedule`, `#agency/payments`, `#agency/worker/<id>`
  const cleanRoute = route.replace(/^agency\/?/, "");
  const parts = cleanRoute.split("/").filter(Boolean);
  const selectedWorkerId = parts[0] === "worker" && parts[1] ? decodeURIComponent(parts[1]) : null;
  const activeSubTab: AgencySubTab =
    parts[0] === "workers"
      ? "workers"
      : parts[0] === "schedule"
      ? "schedule"
      : parts[0] === "payments" && rights.payments
      ? "payments"
      : "candidates";

  const handleCreateWorker = async (draft: Partial<AgencyWorker> & { fullName: string }) => {
    const created = await saveAgencyWorker(draft);
    await loadBootstrap();
    return created;
  };

  const handleMoveStage = async (worker: AgencyWorker, stageId: string) => {
    const targetStage = bootstrap?.settings.stages.find((s) => s.id === stageId);
    const isPlacedStage = targetStage?.group === "placed" || stageId === "placed";
    const nextWorkerStatus = isPlacedStage
      ? "rented"
      : worker.workerStatus === "rented" && worker.stageId === "placed"
      ? "candidate"
      : worker.workerStatus;
    await saveAgencyWorker({ ...worker, stageId, workerStatus: nextWorkerStatus });
    await loadBootstrap();
  };

  const handleWorkerUpdated = (updated: AgencyWorker) => {
    setBootstrap((prev) =>
      prev
        ? {
            ...prev,
            workers: prev.workers.map((w) => (w.id === updated.id ? updated : w)),
          }
        : prev
    );
  };

  const handleWorkerDeleted = (workerId: string) => {
    setBootstrap((prev) =>
      prev
        ? {
            ...prev,
            workers: prev.workers.filter((w) => w.id !== workerId),
          }
        : prev
    );
    onNavigate("agency/candidates");
  };

  const handleQuickRenewTask = async (worker: AgencyWorker, item: AgencyWorkerChecklistItem) => {
    const today = localDateStr(new Date());
    let deadline = addDays(today, 7);
    if (item.expiresAt && /^\d{4}-\d{2}-\d{2}$/.test(item.expiresAt)) {
      const minus30 = addDays(item.expiresAt, -30);
      deadline = minus30 > today ? minus30 : addDays(today, 1);
    }
    const label = item.label || item.itemKey;
    const owner = worker.assignedRecruiter || currentUser?.name || users[0]?.name || "";
    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: t(
        `Renew ${label} — ${worker.fullName}`,
        `Obnoviť ${label} — ${worker.fullName}`,
        `${label} megújítása — ${worker.fullName}`
      ),
      description: item.expiresAt
        ? t(`Document expires on ${item.expiresAt}.`, `Dokument vyprší ${item.expiresAt}.`, `Lejárat: ${item.expiresAt}.`)
        : "",
      status: taskStates[0] || "New",
      priority: "high",
      startDate: today,
      deadline,
      deadlineTime: "10:00",
      owner,
      createdBy: currentUser?.name || owner,
      createdAt: localStampStr(new Date()),
      assignedUsers: owner ? [owner] : [],
      relatedAgencyWorkerId: worker.id,
    };
    setTasks((prev) => [newTask, ...prev]);
    (window as unknown as { showToast?: (m: string, type?: string) => void }).showToast?.(
      t("Renewal task created", "Úloha na obnovenie vytvorená", "Megújítási feladat létrehozva"),
      "success"
    );
  };

  const tabItems: TabItem<AgencySubTab>[] = [
    {
      key: "candidates",
      icon: <UserCheck className="w-3.5 h-3.5" />,
      label: t("Candidates Pipeline", "Kandidáti", "Jelöltek"),
      testId: "agency-subtab-candidates",
    },
    {
      key: "workers",
      icon: <Users className="w-3.5 h-3.5" />,
      label: t("Rented Employees", "Prenajatí zamestnanci", "Kölcsönzött dolgozók"),
      testId: "agency-subtab-workers",
    },
    {
      key: "schedule",
      icon: <CalendarDays className="w-3.5 h-3.5" />,
      label: t("Work Schedule", "Rozpis zmien", "Műszakbeosztás"),
      testId: "agency-subtab-schedule",
    },
    {
      key: "payments",
      icon: <Wallet className="w-3.5 h-3.5" />,
      label: t("Payments & Billing", "Výplaty a fakturácia", "Kifizetések"),
      hidden: !rights.payments,
      testId: "agency-subtab-payments",
    },
  ];

  const selectedWorker = selectedWorkerId
    ? bootstrap?.workers.find((w) => w.id === selectedWorkerId) || null
    : null;

  void financialCategories;

  return (
    <div className="space-y-6 select-none animate-fade-in text-gray-800 pb-16 relative" data-testid="agency-module-view">
      <PageHeader
        icon={<SectionIcon id="agency" />}
        title={t("Agency & Workforce Leasing", "Personálna agentúra a prenájom", "Munkaerő-közvetítés és kölcsönzés")}
        subtitle={t(
          "Recruitment pipeline, permanent worker dossiers, client placements, shift schedules & payroll.",
          "Nábor kandidátov, permanentné profily pracovníkov, umiestnenia u klientov, rozpis zmien a výplaty.",
          "Jelöltkezelés, dolgozói profilok, céges kihelyezések, műszakbeosztás és bérelszámolás."
        )}
        actions={
          <button
            type="button"
            onClick={loadBootstrap}
            disabled={loading}
            className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-white border border-gray-200 hover:border-entity-border text-gray-600 hover:text-[#4a5a20] text-ui font-semibold shadow-2xs transition-colors cursor-pointer"
            title={t("Refresh", "Obnoviť", "Frissítés")}
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{t("Refresh", "Obnoviť", "Frissítés")}</span>
          </button>
        }
      />

      <div className="flex flex-col ws-sm:flex-row ws-sm:items-center justify-between gap-4 border-b border-gray-200/60 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={activeSubTab}
            onChange={(id) => onNavigate(`agency/${id}`)}
            items={tabItems}
          />
          {selectedWorker && (
            <div className="flex items-center gap-2 pl-2">
              <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-ui font-heading font-bold text-[#4a5a20]">
                {selectedWorker.fullName}
              </span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-ui font-semibold">
          {error}
        </div>
      )}

      {!bootstrap && loading ? (
        <div className=" rounded-lg p-10 text-center text-ui text-gray-500">
          {t("Loading agency data…", "Načítavam dáta agentúry…", "Adatok betöltése…")}
        </div>
      ) : bootstrap && selectedWorkerId ? (
        <AgencyWorkerDetailView
          workerId={selectedWorkerId}
          lang={lang}
          rights={rights}
          settings={bootstrap.settings}
          clients={leads}
          workplaces={bootstrap.workplaces}
          tasks={tasks}
          integrationsConfig={integrationsConfig}
          onBack={() => onNavigate(`agency/${activeSubTab}`)}
          onWorkerUpdated={handleWorkerUpdated}
          onWorkerDeleted={handleWorkerDeleted}
          onQuickRenewTask={handleQuickRenewTask}
          renderPlacementsTab={({ detail, refresh }) => (
            <PlacementsPanel
              worker={detail.worker}
              placements={detail.placements}
              workplaces={bootstrap.workplaces}
              clients={leads}
              settings={bootstrap.settings}
              rights={rights}
              lang={lang}
              onChanged={async () => {
                await refresh();
                await loadBootstrap();
              }}
            />
          )}
          renderTasksTicketsTab={({ detail }) => (
            <WorkerTasksTicketsTab
              detail={detail}
              lang={lang}
              currentUser={currentUser}
              leads={leads}
              projects={projects}
              users={users}
              tasks={tasks}
              setTasks={setTasks}
              taskStates={taskStates}
              taskStateColors={taskStateColors}
              taskAccess={taskAccess}
              tickets={tickets}
              setTickets={setTickets}
              ticketStatuses={ticketStatuses}
              mailConfigured={mailConfigured}
              onNavigate={onNavigate}
            />
          )}
          renderScheduleTab={({ detail, refresh }) => (
            <AgencyScheduleView
              bootstrap={{ ...bootstrap, shifts: detail.shifts, payments: detail.payments }}
              clients={leads}
              rights={rights}
              isAdmin={isAdmin}
              lang={lang}
              singleWorkerId={detail.worker.id}
              onChanged={async () => {
                await refresh();
                await loadBootstrap();
              }}
            />
          )}
        />
      ) : bootstrap && activeSubTab === "candidates" ? (
        <CandidatesPipelineView
          lang={lang}
          rights={rights}
          settings={bootstrap.settings}
          workers={bootstrap.workers}
          placements={bootstrap.placements}
          clients={leads}
          checklists={bootstrap.checklists}
          onOpenWorker={(id) => onNavigate(`agency/worker/${encodeURIComponent(id)}`)}
          onCreateWorker={handleCreateWorker}
          onMoveStage={handleMoveStage}
        />
      ) : bootstrap && activeSubTab === "workers" ? (
        <RentedEmployeesView
          lang={lang}
          rights={rights}
          workers={bootstrap.workers}
          placements={bootstrap.placements}
          workplaces={bootstrap.workplaces}
          checklists={bootstrap.checklists}
          clients={leads}
          integrationsConfig={integrationsConfig}
          onOpenWorker={(id) => onNavigate(`agency/worker/${encodeURIComponent(id)}`)}
          onOpenSchedule={() => onNavigate("agency/schedule")}
        />
      ) : bootstrap && activeSubTab === "schedule" ? (
        <AgencyScheduleView
          bootstrap={bootstrap}
          clients={leads}
          rights={rights}
          isAdmin={isAdmin}
          lang={lang}
          onChanged={loadBootstrap}
          onOpenWorker={(id) => onNavigate(`agency/worker/${encodeURIComponent(id)}`)}
        />
      ) : bootstrap && activeSubTab === "payments" && rights.payments ? (
        <AgencyPaymentsView
          bootstrap={bootstrap}
          clients={leads}
          rights={rights}
          isAdmin={isAdmin}
          lang={lang}
          onChanged={loadBootstrap}
          onOpenWorker={(id) => onNavigate(`agency/worker/${encodeURIComponent(id)}`)}
        />
      ) : null}
    </div>
  );
};
