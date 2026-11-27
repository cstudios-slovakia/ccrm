import { useMemo, useState } from "react";
import type {
  Employee,
  EmployeeSalary,
  FinancialRecord,
  Lead,
  Project,
  ProjectType,
  SupportContract,
  Task,
  Ticket,
  TicketStatusDef,
  UserProfile,
} from "../../types";
import type { ProjectStatusDef } from "../../utils/projects";
import type { Language } from "../../utils/translations";
import type { EmployeeRights } from "../../utils/employeeRights";
import { useUserPref } from "../../utils/userPrefs";
import { useProjectBreakdownTime } from "../../hooks/useProjectBreakdownTime";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { nowLocalStamp, todayLocal } from "../../utils/localTime";
import { DEFAULT_TICKET_STATUS_DEFS } from "../../utils/tickets";
import {
  applyBreakdownPreset,
  BREAKDOWN_COLUMNS,
  buildProjectBreakdown,
  periodRangeForPreset,
  reconcileBreakdownColumns,
  type BreakdownHealthFilter,
  type BreakdownPeriodPreset,
  type BreakdownPresetId,
  type BreakdownSortKey,
} from "../../utils/projectBreakdown";
import { ProjectBreakdownColumnsMenu } from "./ProjectBreakdownColumnsMenu";
import { ProjectBreakdownView } from "./ProjectBreakdownView";

export interface UseProjectsBreakdownProps {
  enabled: boolean;
  t: (en: string, sk: string, hu: string) => string;
  userLanguage: Language;
  defaultCurrency: string;
  projects: readonly Project[];
  projectTypes: readonly ProjectType[];
  projectStatuses: readonly ProjectStatusDef[];
  leads: readonly Lead[];
  financialRecords: readonly FinancialRecord[];
  tasks: readonly Task[];
  taskStates: string[];
  tickets: readonly Ticket[];
  ticketStatuses?: TicketStatusDef[];
  supportContracts: readonly SupportContract[];
  users: readonly UserProfile[];
  employees?: readonly Employee[];
  employeeSalaries?: readonly EmployeeSalary[];
  employeeRights?: EmployeeRights;
  canSeeFinance: boolean;
}

export function useProjectsBreakdownState(props: UseProjectsBreakdownProps) {
  const tt = useTimeTracking();
  const [storedCols, setStoredCols] = useUserPref("projectsBreakdownColumns");
  const [storedSort, setStoredSort] = useUserPref("projectsBreakdownSort");
  const [healthFilter, setHealthFilter] = useState<BreakdownHealthFilter>("all");
  const [periodPreset, setPeriodPreset] = useState<BreakdownPeriodPreset>("all");

  const periodRange = useMemo(() => periodRangeForPreset(periodPreset), [periodPreset]);
  const { timeData, loading } = useProjectBreakdownTime({
    enabled: props.enabled,
    from: periodRange.from,
    to: periodRange.to,
  });

  const rights = useMemo(
    () => ({
      canSeeCosts: Boolean(tt.viewer.canCosts || timeData.canSeeAllCosts || props.employeeRights?.salaries),
      canSeeFinance: props.canSeeFinance,
      canSeeSalaries: Boolean(props.employeeRights?.salaries),
    }),
    [tt.viewer.canCosts, timeData.canSeeAllCosts, props.employeeRights?.salaries, props.canSeeFinance],
  );

  const columns = useMemo(
    () => reconcileBreakdownColumns(storedCols, rights),
    [storedCols, rights],
  );

  const sort = useMemo(
    () => ({
      key: (storedSort?.key as BreakdownSortKey) || "value",
      direction: (storedSort?.direction === "asc" ? "asc" : "desc") as "asc" | "desc",
    }),
    [storedSort],
  );

  const colMetaMap = useMemo(() => new Map(BREAKDOWN_COLUMNS.map((c) => [c.key, c])), []);
  const columnLabel = (col: { key: keyof typeof BREAKDOWN_COLUMNS[number] | string }) => {
    const def = colMetaMap.get(col.key as any);
    return def ? props.t(def.labels[0], def.labels[1], def.labels[2]) : String(col.key);
  };

  const breakdown = useMemo(() => {
    if (!props.enabled) return null;
    return buildProjectBreakdown({
      projects: props.projects,
      projectTypes: props.projectTypes,
      projectStatuses: props.projectStatuses,
      leads: props.leads,
      financialRecords: props.financialRecords,
      tasks: props.tasks,
      taskStates: props.taskStates,
      tickets: props.tickets,
      ticketStatuses: props.ticketStatuses || DEFAULT_TICKET_STATUS_DEFS,
      supportContracts: props.supportContracts,
      users: props.users,
      employees: props.employees,
      employeeSalaries: props.employeeSalaries,
      timeData,
      defaultCurrency: props.defaultCurrency,
      rights,
      healthFilter,
      sort,
      today: todayLocal(),
      nowStamp: nowLocalStamp(),
      nowMs: tt.nowMs || Date.now(),
      unassignedLabel: props.t("Internal / Unassigned", "Interné / Nepriradené", "Belső / Nincs hozzárendelve"),
    });
  }, [
    props.enabled,
    props.projects,
    props.projectTypes,
    props.projectStatuses,
    props.leads,
    props.financialRecords,
    props.tasks,
    props.taskStates,
    props.tickets,
    props.ticketStatuses,
    props.supportContracts,
    props.users,
    props.employees,
    props.employeeSalaries,
    timeData,
    props.defaultCurrency,
    rights,
    healthFilter,
    sort,
    tt.nowMs,
  ]);

  const menuProps = {
    t: props.t,
    sort,
    onSortChange: (next: { key: BreakdownSortKey; direction: "asc" | "desc" }) => setStoredSort(next),
    columns,
    onColumnsChange: (next: typeof columns) => setStoredCols(next),
    columnLabel,
    onReset: () => {
      setStoredSort(null);
      setStoredCols(null);
      setHealthFilter("all");
      setPeriodPreset("all");
    },
  };

  const renderMenu = () => <ProjectBreakdownColumnsMenu {...menuProps} />;

  const renderView = (onSelectProject: (id: string) => void, onQuickEditProject?: (id: string) => void) =>
    breakdown ? (
      <ProjectBreakdownView
        t={props.t}
        userLanguage={props.userLanguage}
        defaultCurrency={props.defaultCurrency}
        clients={breakdown.clients}
        summary={breakdown.summary}
        columns={columns}
        rights={rights}
        loadingTime={loading}
        healthFilter={healthFilter}
        onHealthFilterChange={setHealthFilter}
        periodPreset={periodPreset}
        onPeriodPresetChange={setPeriodPreset}
        onApplyPreset={(preset: BreakdownPresetId) => setStoredCols(applyBreakdownPreset(preset, rights))}
        onSelectProject={onSelectProject}
        onQuickEditProject={onQuickEditProject}
      />
    ) : null;

  return { renderMenu, renderView };
}
